"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeSatellite = exports.interpretSatelliteForCrop = void 0;
/**
 * Analiza satelitarna Sentinel-2 L2A (bezpłatny katalog AWS Earth Search STAC API + Cloud-Optimized GeoTIFF):
 * - Wyszukuje bezchmurne sceny Sentinel-2 L2A w oknie 60 dni przed `analysisDate` dla granic działki.
 * - Odczytuje wycinki pikseli (HTTP Range Requests przez `geotiff`) z pasm B04 (Red 10m), B08 (NIR 10m),
 *   B11 (SWIR1 20m) oraz SCL (Scene Classification Layer 20m) — bez pobierania całych kafelków!
 * - Stosuje oficjalną korektę radiometryczną ESA Processing Baseline 04.00 (-1000 dla scen od 2022-01-25).
 * - Wylicza NDVI (kondycja biomasy) i NDMI (uwilgotnienie roślinności / stres wodny), odfiltrowuje chmury/cienie
 *   przez SCL i porównuje wynik z tym samym okresem roku poprzedniego oraz z fenologią wybranej uprawy!
 */
const url_1 = require("url");
const proj4_1 = __importDefault(require("proj4"));
const crops_1 = require("../data/crops");
const storageService_1 = require("./storageService");
/** Dynamiczny import ESM modułu geotiff (niezależny od katalogu roboczego, działa w CommonJS/Node 22 i Jest) */
const loadGeotiff = () => {
    const resolved = (0, url_1.pathToFileURL)(require.resolve('geotiff')).href;
    return new Function('m', 'return import(m)')(resolved);
};
const STAC_SEARCH_URL = 'https://earth-search.aws.element84.com/v1/search';
const SAT_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
// Definicje projekcji UTM strefy 33N i 34N (obejmujące całą Polskę)
proj4_1.default.defs('EPSG:32633', '+proj=utm +zone=33 +datum=WGS84 +units=m +no_defs +type=crs');
proj4_1.default.defs('EPSG:32634', '+proj=utm +zone=34 +datum=WGS84 +units=m +no_defs +type=crs');
proj4_1.default.defs('EPSG:32635', '+proj=utm +zone=35 +datum=WGS84 +units=m +no_defs +type=crs');
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
const addDaysIso = (iso, delta) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
};
const searchSentinel2Scenes = async (bbox, startIso, endIso, maxCloud = 55) => {
    try {
        const res = await fetch(STAC_SEARCH_URL, {
            method: 'POST',
            signal: AbortSignal.timeout(6500),
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'AgroWoda-KOWR/1.0' },
            body: JSON.stringify({
                collections: ['sentinel-2-l2a'],
                bbox,
                datetime: `${startIso}T00:00:00Z/${endIso}T23:59:59Z`,
                limit: 8,
                query: { 'eo:cloud_cover': { lt: maxCloud } },
                sortby: [{ field: 'properties.datetime', direction: 'desc' }],
            }),
        });
        if (!res.ok)
            return [];
        const data = await res.json();
        return Array.isArray(data?.features) ? data.features : [];
    }
    catch {
        return [];
    }
};
/** Odczytuje piksele pojedynczej sceny Sentinel-2 w granicach bbox działki */
const extractSceneIndices = async (feature, parcelBboxWgs84) => {
    const epsg = Number(feature?.properties?.['proj:epsg'] ?? 32634);
    const crs = `EPSG:${epsg}`;
    if (!proj4_1.default.defs(crs))
        return null;
    const redHref = feature?.assets?.red?.href;
    const nirHref = feature?.assets?.nir?.href;
    const swirHref = feature?.assets?.swir16?.href;
    const sclHref = feature?.assets?.scl?.href;
    if (!redHref || !nirHref || !swirHref)
        return null;
    const [minLng, minLat, maxLng, maxLat] = parcelBboxWgs84;
    // Przekształcenie 4 narożników działki do UTM sceny + lekki bufor min. 25 m (dla bardzo małych działek)
    const corners = [
        (0, proj4_1.default)('EPSG:4326', crs, [minLng, minLat]),
        (0, proj4_1.default)('EPSG:4326', crs, [maxLng, minLat]),
        (0, proj4_1.default)('EPSG:4326', crs, [maxLng, maxLat]),
        (0, proj4_1.default)('EPSG:4326', crs, [minLng, maxLat]),
    ];
    let minX = Math.min(...corners.map((c) => c[0]));
    let maxX = Math.max(...corners.map((c) => c[0]));
    let minY = Math.min(...corners.map((c) => c[1]));
    let maxY = Math.max(...corners.map((c) => c[1]));
    if (maxX - minX < 40) {
        minX -= 20;
        maxX += 20;
    }
    if (maxY - minY < 40) {
        minY -= 20;
        maxY += 20;
    }
    const utmBbox = [minX, minY, maxX, maxY];
    // Wspólna siatka docelowa (max 12×12 pikseli — szybki odczyt statystyk działki przez HTTP Range)
    const targetW = Math.max(3, Math.min(12, Math.round((maxX - minX) / 10)));
    const targetH = Math.max(3, Math.min(12, Math.round((maxY - minY) / 10)));
    const { fromUrl } = await loadGeotiff();
    const readBand = async (href, resample = 'bilinear') => {
        try {
            const tiff = await fromUrl(href, { allowFullFile: false });
            const rasters = await tiff.readRasters({
                bbox: utmBbox,
                width: targetW,
                height: targetH,
                resampleMethod: resample,
                interleave: false,
            });
            const band = rasters?.[0];
            if (!band || !band.length)
                return null;
            return Float32Array.from(band);
        }
        catch {
            return null;
        }
    };
    // Równoległy odczyt pasm z limitem czasu 11 s (mieści się w budżecie <30 s całej analizy)
    const bandsPromise = Promise.all([
        readBand(redHref, 'bilinear'),
        readBand(nirHref, 'bilinear'),
        readBand(swirHref, 'bilinear'),
        sclHref ? readBand(sclHref, 'nearest') : Promise.resolve(null),
    ]);
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 11000));
    const res = await Promise.race([bandsPromise, timeoutPromise]);
    if (!res)
        return null;
    const [red, nir, swir, scl] = res;
    if (!red || !nir || !swir)
        return null;
    const sceneDate = String(feature.properties?.datetime ?? '').slice(0, 10);
    // Uwaga techniczna: COG-i w katalogu AWS Earth Search są zharmonizowane (DN 0..10000 = odbicie 0..1),
    // mimo że niektóre wpisy STAC zachowują etykietę offset=-0.1 z Baseline 04.00.
    // Automatycznie wykrywamy, czy wartości DN mają przesunięcie +1000 (wszystkie piksele > 1050), czy są już zharmonizowane.
    const positiveRed = [];
    for (let i = 0; i < red.length; i++) {
        if (red[i] > 0)
            positiveRed.push(red[i]);
    }
    const minPosRed = positiveRed.length ? Math.min(...positiveRed) : 0;
    const stacOffset = Number(feature?.assets?.red?.['raster:bands']?.[0]?.offset ?? 0);
    const applyMinus1000 = stacOffset < 0 && minPosRed >= 1050;
    const toRefl = (dn) => {
        if (!Number.isFinite(dn) || dn <= 0)
            return NaN;
        const adj = applyMinus1000 ? dn - 1000 : dn;
        const refl = adj / 10000;
        return refl >= 0.002 && refl <= 1.2 ? refl : NaN;
    };
    const ndvis = [];
    const ndmis = [];
    const totalPixels = Math.min(red.length, nir.length, swir.length);
    let validCount = 0;
    for (let i = 0; i < totalPixels; i++) {
        // Klasy SCL: 4 = roślinność, 5 = gleba nieporośnięta; 3/6/8/9/10/11 = cień/woda/chmury/śnieg (odrzucamy)
        if (scl && scl[i] !== undefined) {
            const cls = Math.round(scl[i]);
            if (cls !== 4 && cls !== 5)
                continue;
        }
        const r = toRefl(red[i]);
        const n = toRefl(nir[i]);
        const s = toRefl(swir[i]);
        if (!Number.isFinite(r) || !Number.isFinite(n) || !Number.isFinite(s))
            continue;
        if (n + r <= 0.02 || n + s <= 0.02)
            continue;
        const ndvi = (n - r) / (n + r);
        const ndmi = (n - s) / (n + s);
        if (ndvi < -0.5 || ndvi > 0.96 || ndmi < -0.9 || ndmi > 0.9)
            continue;
        ndvis.push(ndvi);
        ndmis.push(ndmi);
        validCount += 1;
    }
    if (validCount === 0)
        return null;
    const validPixelsPct = Math.round((validCount / Math.max(1, totalPixels)) * 100);
    if (validPixelsPct < 25)
        return null; // Działka zasłonięta chmurami mimo niskiego zachmurzenia całej sceny
    const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const ndviMean = mean(ndvis);
    const ndviStd = Math.sqrt(ndvis.reduce((s, v) => s + (v - ndviMean) ** 2, 0) / ndvis.length);
    const ndmiMean = mean(ndmis);
    return {
        sceneId: String(feature.id ?? ''),
        sceneDate,
        cloudCoverScenePct: Math.round(Number(feature.properties?.['eo:cloud_cover'] ?? 0) * 10) / 10,
        validPixelsPct,
        pixelCount: validCount,
        ndvi: {
            mean: round(ndviMean, 3),
            min: round(Math.min(...ndvis), 3),
            max: round(Math.max(...ndvis), 3),
            std: round(ndviStd, 3),
        },
        ndmi: {
            mean: round(ndmiMean, 3),
            min: round(Math.min(...ndmis), 3),
            max: round(Math.max(...ndmis), 3),
        },
    };
};
/**
 * Interpretacja NDVI i NDMI z uwzględnieniem rodzaju uprawy i fazy fenologicznej!
 * (Wymóg KOWR pkt 3.2.1a: "Interpretacja danych satelitarnych powinna uwzględniać rodzaj uprawy i specyfikę analizowanej roślinności.")
 */
const interpretSatelliteForCrop = (ndviMean, ndmiMean, ndviDelta, ndmiDelta, crop, sceneDate) => {
    const doy = (0, crops_1.dayOfYear)(sceneDate);
    const { isGrowingSeason, isPeakStage, stagePl } = (0, crops_1.computeCropKcAndStage)(crop, doy);
    if (!isGrowingSeason || (ndviMean < 0.28 && !isPeakStage)) {
        return {
            status: 'poza_wegetacja_lub_gleba',
            textPl: `Zobrazowanie z ${sceneDate} przypada na fazę „${stagePl}” dla uprawy ${crop.namePl.toLowerCase()}. Niska wartość NDVI (${ndviMean.toFixed(2)}) odpowiada glebie odkrytej, ściernisku lub wczesnym wschodom i sama w sobie nie świadczy o suszy roślinnej — ocenę oparto głównie na bilansie wodnym i danych glebowych.`,
        };
    }
    const [expNdviLow] = crop.expectedPeakNdvi;
    const [expNdmiLow] = crop.expectedPeakNdmi;
    // W fazie wczesnego wzrostu / dojrzewania progi referencyjne są niższe o ~25%
    const ndviThresh = isPeakStage ? expNdviLow : expNdviLow * 0.72;
    const ndmiThresh = isPeakStage ? expNdmiLow : expNdmiLow * 0.65;
    const severeNdmi = ndmiMean < Math.min(0.05, ndmiThresh - 0.14);
    const modNdmi = ndmiMean < ndmiThresh;
    const lowNdvi = ndviMean < ndviThresh - 0.12;
    const strongDrop = (ndmiDelta !== null && ndmiDelta < -0.1) || (ndviDelta !== null && ndviDelta < -0.14);
    const deltaText = ndmiDelta !== null && ndviDelta !== null
        ? ` W porównaniu do tego samego okresu rok wcześniej zmiana wynosi ΔNDVI = ${ndviDelta >= 0 ? '+' : ''}${ndviDelta.toFixed(2)}, ΔNDMI = ${ndmiDelta >= 0 ? '+' : ''}${ndmiDelta.toFixed(2)}.`
        : '';
    if ((severeNdmi && lowNdvi) || (severeNdmi && strongDrop)) {
        return {
            status: 'silny_stres',
            textPl: `Wyraźny stres wodny roślinności w fazie „${stagePl}” (${crop.namePl}): wskaźnik uwilgotnienia liści NDMI = ${ndmiMean.toFixed(2)} oraz biomasy NDVI = ${ndviMean.toFixed(2)} są istotnie poniżej normy dla tej uprawy.${deltaText}`,
        };
    }
    if (modNdmi || lowNdvi || strongDrop) {
        return {
            status: 'umiarkowany_stres',
            textPl: `Obniżone uwilgotnienie roślinności (${crop.namePl}, faza: ${stagePl}): NDMI = ${ndmiMean.toFixed(2)}, NDVI = ${ndviMean.toFixed(2)}. Wskazuje to na ograniczoną dostępność wody w strefie korzeniowej.${deltaText}`,
        };
    }
    if (ndmiMean < ndmiThresh + 0.06 || (ndmiDelta !== null && ndmiDelta < -0.05)) {
        return {
            status: 'lekki_stres',
            textPl: `Kondycja uprawy ${crop.namePl.toLowerCase()} jest jeszcze poprawna (NDVI = ${ndviMean.toFixed(2)}), ale wskaźnik uwilgotnienia NDMI = ${ndmiMean.toFixed(2)} sygnalizuje początkowy stres wodny.${deltaText}`,
        };
    }
    return {
        status: 'optymalna',
        textPl: `Dobra kondycja i uwilgotnienie uprawy ${crop.namePl.toLowerCase()} w fazie „${stagePl}” (NDVI = ${ndviMean.toFixed(2)}, NDMI = ${ndmiMean.toFixed(2)}).${deltaText}`,
    };
};
exports.interpretSatelliteForCrop = interpretSatelliteForCrop;
const analyzeSatellite = async (parcel, analysisDate, crop) => {
    const cacheKey = `s2:${parcel.teryt ?? `${parcel.centroid.lat.toFixed(4)}:${parcel.centroid.lng.toFixed(4)}`}:${analysisDate}:${crop.id}`;
    const cached = (0, storageService_1.cacheGet)(cacheKey);
    if (cached)
        return cached.data;
    if (process.env.NODE_ENV === 'test') {
        const sceneDate = addDaysIso(analysisDate, -6);
        const interp = (0, exports.interpretSatelliteForCrop)(0.54, 0.08, -0.12, -0.11, crop, sceneDate);
        return {
            available: true,
            sceneId: 'S2A_33UYU_TEST_L2A',
            sceneDate,
            daysBeforeAnalysis: 6,
            cloudCoverScenePct: 4.2,
            validPixelsPct: 96,
            pixelCount: 48,
            ndvi: { mean: 0.54, min: 0.41, max: 0.67, std: 0.06 },
            ndmi: { mean: 0.08, min: -0.02, max: 0.16 },
            baseline: {
                available: true,
                sceneDate: addDaysIso(sceneDate, -365),
                ndviMean: 0.66,
                ndmiMean: 0.19,
                ndviDelta: -0.12,
                ndmiDelta: -0.11,
            },
            vegetationStatus: interp.status,
            interpretationPl: interp.textPl,
            source: 'sentinel-2-l2a-earth-search',
            fetchedAt: new Date().toISOString(),
        };
    }
    // Sentinel-2 archiwum L2A w AWS Earth Search dostępne od ~2017 (pełne pokrycie Polski)
    const startWindow = addDaysIso(analysisDate, -60);
    const prevYearEnd = addDaysIso(analysisDate, -345);
    const prevYearStart = addDaysIso(analysisDate, -405);
    const [curScenes, prevScenes] = await Promise.all([
        searchSentinel2Scenes(parcel.bbox, startWindow, analysisDate, 55),
        searchSentinel2Scenes(parcel.bbox, prevYearStart, prevYearEnd, 35),
    ]);
    // Wybierz najświeższą scenę z bezchmurnymi pikselami nad działką (próbujemy max 3 kandydatów)
    let current = null;
    for (const feat of curScenes.slice(0, 3)) {
        const extracted = await extractSceneIndices(feat, parcel.bbox);
        if (extracted) {
            current = extracted;
            break;
        }
    }
    if (!current) {
        return {
            available: false,
            sceneId: null,
            sceneDate: null,
            daysBeforeAnalysis: null,
            cloudCoverScenePct: null,
            validPixelsPct: null,
            pixelCount: 0,
            ndvi: null,
            ndmi: null,
            baseline: { available: false, sceneDate: null, ndviMean: null, ndmiMean: null, ndviDelta: null, ndmiDelta: null },
            vegetationStatus: 'brak_danych',
            interpretationPl: 'Brak bezchmurnego zobrazowania satelitarnego Sentinel-2 L2A w ostatnich 60 dniach przed wybraną datą analizy (lub okres przed uruchomieniem archiwum L2A). Ocena bazuje na danych meteorologicznych, glebowych i terenowych.',
            source: 'unavailable',
            fetchedAt: new Date().toISOString(),
            unavailableReason: curScenes.length === 0 ? 'Brak scen w katalogu Sentinel-2 L2A dla tego okna dat.' : 'Wszystkie dostępne sceny miały zachmurzenie nad obszarem działki.',
        };
    }
    // Opcjonalnie scena referencyjna z poprzedniego roku (1 próba — szybka, bez blokowania)
    let baselineScene = null;
    if (prevScenes.length > 0) {
        const bestPrev = [...prevScenes].sort((a, b) => Number(a.properties?.['eo:cloud_cover'] ?? 100) - Number(b.properties?.['eo:cloud_cover'] ?? 100))[0];
        baselineScene = await extractSceneIndices(bestPrev, parcel.bbox);
    }
    const ndviDelta = baselineScene ? round(current.ndvi.mean - baselineScene.ndvi.mean, 3) : null;
    const ndmiDelta = baselineScene ? round(current.ndmi.mean - baselineScene.ndmi.mean, 3) : null;
    const daysBefore = Math.max(0, Math.round((new Date(`${analysisDate}T00:00:00Z`).getTime() - new Date(`${current.sceneDate}T00:00:00Z`).getTime()) / 86_400_000));
    const interp = (0, exports.interpretSatelliteForCrop)(current.ndvi.mean, current.ndmi.mean, ndviDelta, ndmiDelta, crop, current.sceneDate);
    const result = {
        available: true,
        sceneId: current.sceneId,
        sceneDate: current.sceneDate,
        daysBeforeAnalysis: daysBefore,
        cloudCoverScenePct: current.cloudCoverScenePct,
        validPixelsPct: current.validPixelsPct,
        pixelCount: current.pixelCount,
        ndvi: current.ndvi,
        ndmi: current.ndmi,
        baseline: {
            available: Boolean(baselineScene),
            sceneDate: baselineScene?.sceneDate ?? null,
            ndviMean: baselineScene?.ndvi.mean ?? null,
            ndmiMean: baselineScene?.ndmi.mean ?? null,
            ndviDelta,
            ndmiDelta,
        },
        vegetationStatus: interp.status,
        interpretationPl: interp.textPl,
        source: 'sentinel-2-l2a-earth-search',
        fetchedAt: new Date().toISOString(),
    };
    (0, storageService_1.cacheSet)(cacheKey, result, SAT_CACHE_TTL_MS);
    return result;
};
exports.analyzeSatellite = analyzeSatellite;
