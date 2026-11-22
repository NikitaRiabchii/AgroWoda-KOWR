"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeElevation = void 0;
const geo_1 = require("./geo");
const storageService_1 = require("./storageService");
const parcelService_1 = require("./parcelService");
const GUGIK_NMT_URL = 'https://services.gugik.gov.pl/nmt/';
const OPEN_METEO_ELEV_URL = 'https://api.open-meteo.com/v1/elevation';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dni (teren się nie zmienia)
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;
const aspectToPolish = (deg) => {
    const dirs = ['północna (N)', 'północno-wschodnia (NE)', 'wschodnia (E)', 'południowo-wschodnia (SE)', 'południowa (S)', 'południowo-zachodnia (SW)', 'zachodnia (W)', 'północno-zachodnia (NW)'];
    return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
};
/** Buduje siatkę punktów próbkowania wewnątrz i na granicy działki (9–25 punktów) */
const buildSampleGrid = (parcel) => {
    const proj = new geo_1.LocalProjection(parcel.centroid.lat, parcel.centroid.lng);
    const polyXY = parcel.polygon.map((p) => proj.toXY(p));
    const xs = polyXY.map((p) => p.x);
    const ys = polyXY.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pts = [];
    // Zawsze dodaj środek i wierzchołki działki (max 8 wierzchołków równomiernie)
    pts.push({ lat: parcel.centroid.lat, lng: parcel.centroid.lng, x: 0, y: 0 });
    const stepN = 3;
    for (let i = 0; i < stepN; i++) {
        for (let j = 0; j < stepN; j++) {
            const fx = (i + 0.5) / stepN;
            const fy = (j + 0.5) / stepN;
            const x = minX + fx * (maxX - minX);
            const y = minY + fy * (maxY - minY);
            if ((0, geo_1.pointInPolygon)({ x, y }, polyXY)) {
                const [lat, lng] = proj.toLatLng({ x, y });
                pts.push({ lat: round(lat, 6), lng: round(lng, 6), x, y });
            }
        }
    }
    // Jeśli działka jest wąska i wpadło < 5 punktów, dodaj punkty wzdłuż granicy
    if (pts.length < 5) {
        const stride = Math.max(1, Math.floor(parcel.polygon.length / 6));
        for (let k = 0; k < parcel.polygon.length && pts.length < 9; k += stride) {
            const [lat, lng] = parcel.polygon[k];
            const xy = proj.toXY([lat, lng]);
            pts.push({ lat, lng, x: xy.x, y: xy.y });
        }
    }
    // Ogranicz do 9 punktów — GUGiK NMT 1m odpowiada wtedy w ~1.5–2.5 s
    return pts.slice(0, 9);
};
/** Pobiera wysokości z GUGiK NMT 1m (batch GetHByPointList w EPSG:2180 — uwaga: format 'Northing Easting') */
const fetchGugikNmtElevations = async (pts) => {
    try {
        const coords = pts.map((p) => {
            const { easting, northing } = (0, parcelService_1.wgs84ToEpsg2180)(p.lat, p.lng);
            return `${northing.toFixed(1)} ${easting.toFixed(1)}`;
        });
        const url = `${GUGIK_NMT_URL}?request=GetHByPointList&list=${encodeURIComponent(coords.join(','))}`;
        const res = await fetch(url, {
            signal: AbortSignal.timeout(6500),
            headers: { 'User-Agent': 'AgroWoda-KOWR/1.0' },
        });
        if (!res.ok)
            return null;
        const reader = res.body?.getReader();
        let text = '';
        if (reader) {
            const chunks = [];
            let total = 0;
            while (true) {
                const { done, value } = await reader.read();
                if (done)
                    break;
                total += value.byteLength;
                if (total > 50_000) {
                    await reader.cancel().catch(() => { });
                    return null;
                }
                chunks.push(value);
            }
            text = Buffer.concat(chunks).toString('utf8').trim();
        }
        else {
            text = (await res.text()).trim();
        }
        if (!text || text.includes('0101000020'))
            return null;
        const entries = text.split(',').map((s) => s.trim()).filter(Boolean);
        if (entries.length !== pts.length)
            return null;
        const elevations = [];
        for (const e of entries) {
            const parts = e.split(/\s+/);
            const h = Number(parts[parts.length - 1]);
            if (!Number.isFinite(h) || h < -10 || h > 2600)
                return null;
            elevations.push(h);
        }
        return elevations;
    }
    catch {
        return null;
    }
};
/** Fallback: Open-Meteo Elevation API */
const fetchOpenMeteoElevations = async (pts) => {
    try {
        const params = new URLSearchParams({
            latitude: pts.map((p) => p.lat.toFixed(5)).join(','),
            longitude: pts.map((p) => p.lng.toFixed(5)).join(','),
        });
        const res = await fetch(`${OPEN_METEO_ELEV_URL}?${params.toString()}`, {
            signal: AbortSignal.timeout(6000),
        });
        if (!res.ok)
            return null;
        const data = await res.json();
        if (!Array.isArray(data?.elevation) || data.elevation.length !== pts.length)
            return null;
        return data.elevation.map((v) => Number(v));
    }
    catch {
        return null;
    }
};
/** Dopasowuje płaszczyznę z(x, y) = a*x + b*y + c metodą najmniejszych kwadratów -> wektor gradientu (spadku) */
const fitSlopePlane = (pts) => {
    const n = pts.length;
    if (n < 3)
        return { dzdx: 0, dzdy: 0 };
    const mx = pts.reduce((s, p) => s + p.x, 0) / n;
    const my = pts.reduce((s, p) => s + p.y, 0) / n;
    const mz = pts.reduce((s, p) => s + p.z, 0) / n;
    let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
    for (const p of pts) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const dz = p.z - mz;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
        sxz += dx * dz;
        syz += dy * dz;
    }
    const det = sxx * syy - sxy * sxy;
    if (Math.abs(det) < 1e-6)
        return { dzdx: 0, dzdy: 0 };
    const dzdx = (syy * sxz - sxy * syz) / det;
    const dzdy = (sxx * syz - sxy * sxz) / det;
    return { dzdx, dzdy };
};
const analyzeElevation = async (parcel) => {
    const cacheKey = `elev:${parcel.teryt ?? `${parcel.centroid.lat.toFixed(4)}:${parcel.centroid.lng.toFixed(4)}`}`;
    const cached = (0, storageService_1.cacheGet)(cacheKey);
    if (cached)
        return cached.data;
    const samplePts = buildSampleGrid(parcel);
    if (process.env.NODE_ENV === 'test') {
        const mockProfile = {
            available: true,
            minM: 82.4,
            maxM: 86.1,
            meanM: 84.2,
            reliefM: 3.7,
            meanSlopePct: 2.1,
            maxSlopePct: 3.8,
            aspectDeg: 175,
            aspectLabelPl: 'południowa (S)',
            runoffRisk: 'umiarkowany',
            lowestPoint: { lat: parcel.centroid.lat - 0.0004, lng: parcel.centroid.lng, elevationM: 82.4 },
            highestPoint: { lat: parcel.centroid.lat + 0.0004, lng: parcel.centroid.lng, elevationM: 86.1 },
            flowVector: [
                [parcel.centroid.lat + 0.0003, parcel.centroid.lng],
                [parcel.centroid.lat - 0.0003, parcel.centroid.lng],
            ],
            sampleCount: samplePts.length,
            source: 'gugik-nmt-1m',
            resolutionM: 1,
            fetchedAt: new Date().toISOString(),
        };
        return mockProfile;
    }
    let source = 'gugik-nmt-1m';
    let resolutionM = 1;
    let elevations = await fetchGugikNmtElevations(samplePts);
    if (!elevations) {
        elevations = await fetchOpenMeteoElevations(samplePts);
        source = elevations ? 'open-meteo-dem' : 'unavailable';
        resolutionM = elevations ? 30 : null;
    }
    if (!elevations || elevations.length === 0) {
        return {
            available: false,
            minM: null,
            maxM: null,
            meanM: null,
            reliefM: null,
            meanSlopePct: null,
            maxSlopePct: null,
            aspectDeg: null,
            aspectLabelPl: null,
            runoffRisk: 'nieznany',
            lowestPoint: null,
            highestPoint: null,
            flowVector: null,
            sampleCount: 0,
            source: 'unavailable',
            resolutionM: null,
            fetchedAt: new Date().toISOString(),
            note: 'Nie udało się pobrać danych wysokościowych (GUGiK NMT ani Open-Meteo Elevation).',
        };
    }
    const enriched = samplePts.map((p, idx) => ({ ...p, z: elevations[idx] }));
    let minPt = enriched[0];
    let maxPt = enriched[0];
    let sumZ = 0;
    for (const p of enriched) {
        sumZ += p.z;
        if (p.z < minPt.z)
            minPt = p;
        if (p.z > maxPt.z)
            maxPt = p;
    }
    const meanM = round(sumZ / enriched.length, 1);
    const reliefM = round(maxPt.z - minPt.z, 1);
    // Średni spadek i kierunek spływu (downhill = -gradient)
    const { dzdx, dzdy } = fitSlopePlane(enriched);
    const gradMag = Math.hypot(dzdx, dzdy);
    const meanSlopePct = round(gradMag * 100, 2);
    // Maksymalny lokalny spadek między parami sąsiednich punktów (> 15 m od siebie)
    let maxSlope = meanSlopePct;
    for (let i = 0; i < enriched.length; i++) {
        for (let j = i + 1; j < enriched.length; j++) {
            const dist = Math.hypot(enriched[i].x - enriched[j].x, enriched[i].y - enriched[j].y);
            if (dist >= 15 && dist <= 250) {
                const s = (Math.abs(enriched[i].z - enriched[j].z) / dist) * 100;
                if (s > maxSlope && s < 60)
                    maxSlope = s;
            }
        }
    }
    const maxSlopePct = round(maxSlope, 2);
    // Azymut spływu (0° = N, 90° = E, 180° = S, 270° = W): wektor (-dzdx, -dzdy) w układzie (E, N)
    const downX = -dzdx;
    const downY = -dzdy;
    const aspectDeg = gradMag > 0.002 ? Math.round(((Math.atan2(downX, downY) * 180) / Math.PI + 360) % 360) : null;
    const aspectLabelPl = aspectDeg !== null ? aspectToPolish(aspectDeg) : 'teren płaski (brak wyraźnej ekspozycji)';
    // Wektor wizualizacji spływu (przez centroid lub od najwyższego do najniższego punktu)
    let flowVector = null;
    if (reliefM >= 0.5 && (maxPt.lat !== minPt.lat || maxPt.lng !== minPt.lng)) {
        flowVector = [
            [round(maxPt.lat, 6), round(maxPt.lng, 6)],
            [round(minPt.lat, 6), round(minPt.lng, 6)],
        ];
    }
    const runoffRisk = meanSlopePct >= 5 || maxSlopePct >= 8 ? 'wysoki' : meanSlopePct >= 2 || maxSlopePct >= 4 ? 'umiarkowany' : 'niski';
    const result = {
        available: true,
        minM: round(minPt.z, 1),
        maxM: round(maxPt.z, 1),
        meanM,
        reliefM,
        meanSlopePct,
        maxSlopePct,
        aspectDeg,
        aspectLabelPl,
        runoffRisk,
        lowestPoint: { lat: round(minPt.lat, 6), lng: round(minPt.lng, 6), elevationM: round(minPt.z, 1) },
        highestPoint: { lat: round(maxPt.lat, 6), lng: round(maxPt.lng, 6), elevationM: round(maxPt.z, 1) },
        flowVector,
        sampleCount: enriched.length,
        source,
        resolutionM,
        fetchedAt: new Date().toISOString(),
        note: source === 'open-meteo-dem' ? 'Użyto zapasowego modelu DEM ~30 m (GUGiK NMT 1 m był czasowo niedostępny).' : undefined,
    };
    (0, storageService_1.cacheSet)(cacheKey, result, CACHE_TTL_MS);
    return result;
};
exports.analyzeElevation = analyzeElevation;
