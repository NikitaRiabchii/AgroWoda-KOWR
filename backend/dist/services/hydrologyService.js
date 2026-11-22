"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeHydrology = void 0;
const geo_1 = require("./geo");
const storageService_1 = require("./storageService");
const IMGW_HYDRO_URL = 'https://danepubliczne.imgw.pl/api/data/hydro';
const OVERPASS_MIRRORS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
];
const IMGW_CACHE_TTL_MS = 30 * 60 * 1000; // 30 min
const OSM_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dni
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const KIND_LABELS = {
    ditch: 'Rów melioracyjny',
    drain: 'Kanał / rów odwadniający',
    stream: 'Strumień / mały ciek',
    river: 'Rzeka',
    canal: 'Kanał wodny',
    pond: 'Oczko wodne / zbiornik',
    wetland: 'Mokradło / teren podmokły',
    tree_row: 'Zadrzewienie śródpolne / pas wiatrochronny',
    wood: 'Las / zadrzewienie',
};
const fetchNearestImgwHydro = async (lat, lng) => {
    try {
        let raw = (0, storageService_1.cacheGet)('imgw:hydro:all')?.data ?? null;
        if (!raw) {
            const res = await fetch(IMGW_HYDRO_URL, {
                signal: AbortSignal.timeout(6500),
                headers: { 'User-Agent': 'AgroWoda-KOWR/1.0' },
            });
            if (!res.ok)
                return null;
            raw = (await res.json());
            if (Array.isArray(raw))
                (0, storageService_1.cacheSet)('imgw:hydro:all', raw, IMGW_CACHE_TTL_MS);
        }
        if (!Array.isArray(raw) || !raw.length)
            return null;
        const toNum = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
        const withDist = [];
        for (const item of raw) {
            const sLat = toNum(item.lat);
            const sLng = toNum(item.lon);
            if (sLat === null || sLng === null)
                continue;
            const dist = (0, geo_1.haversineKm)({ lat, lng }, { lat: sLat, lng: sLng });
            if (dist > 60)
                continue;
            const level = toNum(item.stan_wody);
            const warn = toNum(item.stan_ostrzegawczy);
            const alarm = toNum(item.stan_alarmowy);
            const flow = toNum(item.przelyw ?? item.przeplyw);
            let statusPl = 'brak_danych';
            if (level !== null) {
                if (alarm !== null && level >= alarm)
                    statusPl = 'alarmowy';
                else if (warn !== null && level >= warn)
                    statusPl = 'ostrzegawczy';
                else if (warn !== null && level < warn * 0.45)
                    statusPl = 'niski';
                else if (warn !== null && level >= warn * 0.78)
                    statusPl = 'wysoki';
                else
                    statusPl = 'sredni';
            }
            withDist.push({
                dist,
                st: {
                    id: String(item.id_stacji ?? ''),
                    station: String(item.stacja ?? ''),
                    river: String(item.rzeka ?? '').replace(/\s*\(\d+\)\s*$/, ''),
                    voivodeship: String(item.wojewodztwo ?? ''),
                    distanceKm: round(dist, 1),
                    waterLevelCm: level,
                    warningLevelCm: warn,
                    alarmLevelCm: alarm,
                    flowM3s: flow,
                    measuredAt: item.stan_wody_data_pomiaru ? String(item.stan_wody_data_pomiaru) : null,
                    statusPl,
                },
            });
        }
        withDist.sort((a, b) => a.dist - b.dist);
        return withDist.slice(0, 3).map((x) => x.st);
    }
    catch {
        return null;
    }
};
/** Pobiera elementy hydrograficzne i krajobrazowe z OSM Overpass z twardym budżetem czasu 6.5 s */
const fetchOsmLandscapeFeatures = async (lat, lng) => {
    const cacheKey = `osm:hydro:${lat.toFixed(3)}:${lng.toFixed(3)}`;
    const cached = (0, storageService_1.cacheGet)(cacheKey);
    if (cached)
        return cached.data;
    // Bbox ~1.4 km wokół środka działki (bbox jest znacznie szybszy niż operator around w Overpass)
    const padLat = 0.013;
    const padLng = 0.02;
    const box = `${(lat - padLat).toFixed(5)},${(lng - padLng).toFixed(5)},${(lat + padLat).toFixed(5)},${(lng + padLng).toFixed(5)}`;
    const query = `[out:json][timeout:6];(way["waterway"~"^(river|stream|ditch|drain|canal)$"](${box});way["natural"~"^(water|wetland|wood|tree_row)$"](${box});way["landuse"="forest"](${box}););out center tags qt 120;`;
    for (const mirror of OVERPASS_MIRRORS) {
        try {
            const res = await fetch(mirror, {
                method: 'POST',
                signal: AbortSignal.timeout(4500),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'AgroWoda-KOWR-HackNation2026/1.0',
                    Accept: 'application/json',
                },
                body: new URLSearchParams({ data: query }).toString(),
            });
            if (!res.ok)
                continue;
            const data = await res.json();
            const elements = data?.elements ?? [];
            const features = [];
            for (const el of elements) {
                const c = el.center;
                if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lon))
                    continue;
                const tags = el.tags ?? {};
                let kind = null;
                if (tags.waterway === 'ditch')
                    kind = 'ditch';
                else if (tags.waterway === 'drain')
                    kind = 'drain';
                else if (tags.waterway === 'stream')
                    kind = 'stream';
                else if (tags.waterway === 'river')
                    kind = 'river';
                else if (tags.waterway === 'canal')
                    kind = 'canal';
                else if (tags.natural === 'wetland')
                    kind = 'wetland';
                else if (tags.natural === 'water')
                    kind = 'pond';
                else if (tags.natural === 'tree_row')
                    kind = 'tree_row';
                else if (tags.natural === 'wood' || tags.landuse === 'forest')
                    kind = 'wood';
                if (!kind)
                    continue;
                const distM = Math.round((0, geo_1.haversineKm)({ lat, lng }, { lat: c.lat, lng: c.lon }) * 1000);
                if (distM > 1600)
                    continue;
                features.push({
                    kind,
                    labelPl: KIND_LABELS[kind],
                    name: tags.name ? String(tags.name) : null,
                    distanceM: distM,
                    lat: Number(c.lat.toFixed(6)),
                    lng: Number(c.lon.toFixed(6)),
                });
            }
            features.sort((a, b) => a.distanceM - b.distanceM);
            (0, storageService_1.cacheSet)(cacheKey, features, OSM_CACHE_TTL_MS);
            return features;
        }
        catch {
            // Kolejny serwer zapasowy
        }
    }
    return null;
};
const analyzeHydrology = async (lat, lng, isHistoricalDate) => {
    if (process.env.NODE_ENV === 'test') {
        const ditch = {
            kind: 'ditch',
            labelPl: KIND_LABELS.ditch,
            name: 'Rów melioracyjny R-14',
            distanceM: 210,
            lat: lat + 0.0015,
            lng: lng + 0.001,
        };
        return {
            osmAvailable: true,
            imgwAvailable: true,
            imgwApplicableToDate: !isHistoricalDate,
            nearestDitchOrDrain: ditch,
            nearestWatercourse: ditch,
            nearestPondOrWetland: null,
            waterwaysCount1500m: 3,
            ditchesCount1500m: 2,
            pondsAndWetlandsCount1000m: 0,
            shelterbeltsAndWoodsCount1000m: 1,
            featuresForMap: [ditch],
            nearestImgwStations: [
                {
                    id: '152180010',
                    station: 'Inowrocław',
                    river: 'Noteć',
                    voivodeship: 'kujawsko-pomorskie',
                    distanceKm: 12.4,
                    waterLevelCm: 118,
                    warningLevelCm: 260,
                    alarmLevelCm: 320,
                    flowM3s: 1.8,
                    measuredAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
                    statusPl: 'niski',
                },
            ],
            landscapeRetentionPotential: 'wysoki',
            summaryPl: 'W odległości 210 m przebiega rów melioracyjny, a w promieniu 1 km brak oczek wodnych — wysokie szanse na poprawę retencji przez spowalnianie odpływu.',
            fetchedAt: new Date().toISOString(),
        };
    }
    const [imgwStations, osmFeatures] = await Promise.all([
        fetchNearestImgwHydro(lat, lng),
        fetchOsmLandscapeFeatures(lat, lng),
    ]);
    const features = osmFeatures ?? [];
    const ditches = features.filter((f) => f.kind === 'ditch' || f.kind === 'drain');
    const waterways = features.filter((f) => ['ditch', 'drain', 'stream', 'river', 'canal'].includes(f.kind));
    const pondsAndWetlands = features.filter((f) => (f.kind === 'pond' || f.kind === 'wetland') && f.distanceM <= 1100);
    const woodsAndTrees = features.filter((f) => (f.kind === 'tree_row' || f.kind === 'wood') && f.distanceM <= 1100);
    const nearestDitchOrDrain = ditches[0] ?? null;
    const nearestWatercourse = waterways[0] ?? null;
    const nearestPondOrWetland = pondsAndWetlands[0] ?? null;
    // Wybierz max 10 najważniejszych elementów do oznaczenia na mapie
    const featuresForMap = [
        ...ditches.slice(0, 4),
        ...waterways.filter((f) => f.kind !== 'ditch' && f.kind !== 'drain').slice(0, 3),
        ...pondsAndWetlands.slice(0, 3),
    ].slice(0, 10);
    let landscapeRetentionPotential = 'nieznany';
    if (osmFeatures !== null) {
        if (nearestDitchOrDrain && nearestDitchOrDrain.distanceM <= 700) {
            landscapeRetentionPotential = 'wysoki';
        }
        else if (nearestWatercourse && nearestWatercourse.distanceM <= 900) {
            landscapeRetentionPotential = 'wysoki';
        }
        else if (pondsAndWetlands.length === 0 && woodsAndTrees.length <= 1) {
            landscapeRetentionPotential = 'wysoki'; // Otwarty krajobraz bez retencji — duży potencjał pasów/oczek
        }
        else {
            landscapeRetentionPotential = 'umiarkowany';
        }
    }
    const summaryParts = [];
    if (osmFeatures !== null) {
        if (nearestDitchOrDrain) {
            summaryParts.push(`W odległości ok. ${nearestDitchOrDrain.distanceM} m znajduje się ${nearestDitchOrDrain.labelPl.toLowerCase()}${nearestDitchOrDrain.name ? ` (${nearestDitchOrDrain.name})` : ''} — sprzyja to okresowemu spowalnianiu odpływu.`);
        }
        else if (nearestWatercourse) {
            summaryParts.push(`Najbliższy ciek wodny (${nearestWatercourse.labelPl.toLowerCase()}${nearestWatercourse.name ? `: ${nearestWatercourse.name}` : ''}) znajduje się w odległości ok. ${nearestWatercourse.distanceM} m.`);
        }
        else {
            summaryParts.push('W bezpośrednim sąsiedztwie działki (do 1,5 km) nie zinwentaryzowano w OSM otwartych cieków ani rowów melioracyjnych.');
        }
        if (pondsAndWetlands.length === 0) {
            summaryParts.push('Brak zinwentaryzowanych oczek wodnych i mokradeł w promieniu 1 km (niska naturalna retencja krajobrazowa).');
        }
        else {
            summaryParts.push(`W otoczeniu 1 km występuje ${pondsAndWetlands.length} obiektów wodnych/mokradeł (najbliższy: ${nearestPondOrWetland.distanceM} m).`);
        }
    }
    else {
        summaryParts.push('Mapa obiektów hydrograficznych OpenStreetMap (Overpass) była czasowo przeciążona — pełny obraz sieci rowów można zweryfikować na warstwie mapy.');
    }
    if (imgwStations && imgwStations.length > 0 && !isHistoricalDate) {
        const st = imgwStations[0];
        summaryParts.push(`Najbliższy wodowskaz IMGW-PIB: ${st.station} na rz. ${st.river} (${st.distanceKm} km)${st.waterLevelCm !== null ? `, stan bieżący: ${st.waterLevelCm} cm (${st.statusPl})` : ''}.`);
    }
    return {
        osmAvailable: osmFeatures !== null,
        imgwAvailable: Boolean(imgwStations && imgwStations.length > 0),
        imgwApplicableToDate: !isHistoricalDate,
        nearestDitchOrDrain,
        nearestWatercourse,
        nearestPondOrWetland,
        waterwaysCount1500m: waterways.length,
        ditchesCount1500m: ditches.length,
        pondsAndWetlandsCount1000m: pondsAndWetlands.length,
        shelterbeltsAndWoodsCount1000m: woodsAndTrees.length,
        featuresForMap,
        nearestImgwStations: imgwStations ?? [],
        landscapeRetentionPotential,
        summaryPl: summaryParts.join(' '),
        fetchedAt: new Date().toISOString(),
        note: isHistoricalDate
            ? 'Publiczne API IMGW-PIB udostępnia wyłącznie bieżące odczyty wodowskazowe — nie uwzględniono ich w ocenie historycznej.'
            : osmFeatures === null
                ? 'Serwer Overpass OSM przekroczył limit czasu — rekomendacje oparto na NMT, glebie i bilansie wodnym.'
                : undefined,
    };
};
exports.analyzeHydrology = analyzeHydrology;
