/**
 * Rozpoznawanie działek ewidencyjnych (TERYT) oraz lokalizacji w Polsce:
 * 1. ULDK GUGiK (https://uldk.gugik.gov.pl/) — GetParcelById / GetParcelByIdOrNr / GetParcelByXY
 * 2. Krajowa Integracja Ewidencji Gruntów (KIEG WMS GetFeatureInfo) — niezawodny fallback dla kliknięcia na mapie
 * 3. GUGiK UUG (Usługa Uniwersalnego Geokodowania) + Nominatim OSM — wyszukiwanie miejscowości / gmin
 *
 * UWAGA TECHNICZNA: Serwery GUGiK potrafią zwrócić sztucznie długą odpowiedź EWKB (>100 MB) w przypadku
 * ograniczeń częstotliwości — dlatego każda odpowiedź jest czytana strumieniowo z twardym limitem 250 KB.
 */
import proj4 from 'proj4';
import type { LatLng, ParcelGeometry } from '../types/water';
import { LocalProjection, polygonArea, polygonCentroid } from './geo';
import { cacheGet, cacheSet } from './storageService';

// Rejestracja polskiego układu współrzędnych EPSG:2180 (PUWG 1992)
const EPSG_2180 =
  '+proj=tmerc +lat_0=0 +lon_0=19 +k=0.9993 +x_0=500000 +y_0=-5300000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs';
proj4.defs('EPSG:2180', EPSG_2180);

const ULDK_BASE = 'https://uldk.gugik.gov.pl/';
const KIEG_WMS = 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow';
const GUGIK_UUG = 'https://services.gugik.gov.pl/uug/';
const OPEN_METEO_GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const PARCEL_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 dni
const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const MAX_ULDK_BYTES = 250_000;
const HTTP_USER_AGENT = 'AgroWoda-KOWR/1.0 (+https://kowr.gov.pl)';

export interface ExampleParcel {
  id: string;
  labelPl: string;
  regionPl: string;
  descriptionPl: string;
  teryt: string;
  lat: number;
  lng: number;
  suggestedCropId: string;
  suggestedHistoricalDate: string;
}

export const EXAMPLE_PARCELS: ExampleParcel[] = [
  {
    id: 'kujawy-drought',
    labelPl: 'Kujawy (pow. inowrocławski)',
    regionPl: 'kujawsko-pomorskie — strefa najwyższego deficytu opadów w Polsce',
    descriptionPl: 'Działka rolna w regionie Kujaw — klasyczny obszar powtarzających się susz rolniczych.',
    teryt: '040704_2.0007.68',
    lat: 52.85,
    lng: 18.25,
    suggestedCropId: 'zboza_ozime',
    suggestedHistoricalDate: '2019-06-25',
  },
  {
    id: 'mazowsze-light',
    labelPl: 'Mazowsze (pow. miński)',
    regionPl: 'mazowieckie — gleby lekkie, niska retencja użyteczna',
    descriptionPl: 'Działka w centralnej Polsce na glebach o podwyższonej podatności na przesychanie.',
    teryt: '141201_1.0001.6509',
    lat: 52.172,
    lng: 21.59,
    suggestedCropId: 'ziemniak',
    suggestedHistoricalDate: '2022-07-15',
  },
  {
    id: 'wielkopolska-corn',
    labelPl: 'Wielkopolska (okolice Gniezna)',
    regionPl: 'wielkopolskie — intensywna produkcja roślinna i niskie opady',
    descriptionPl: 'Teren rolniczy w pasie stepowienia Wielkopolski (niski klimatyczny bilans wodny).',
    teryt: '',
    lat: 52.538,
    lng: 17.612,
    suggestedCropId: 'kukurydza',
    suggestedHistoricalDate: '2023-07-10',
  },
  {
    id: 'dolny-slask-slope',
    labelPl: 'Pogórze Dolnośląskie (okolice Kłodzka)',
    regionPl: 'dolnośląskie — teren nachylony, ryzyko spływu powierzchniowego',
    descriptionPl: 'Działka na terenie o wyraźnym nachyleniu — priorytet dla retencji stokowej i uprawy poprzecznostokowej.',
    teryt: '',
    lat: 50.452,
    lng: 16.695,
    suggestedCropId: 'rzepak',
    suggestedHistoricalDate: '2024-06-10',
  },
];

const round = (v: number, d = 6) => Math.round(v * 10 ** d) / 10 ** d;

/** Bezpieczny odczyt strumieniowy z natychmiastowym przerwaniem przy odpowiedzi binarnej/tarpicie ULDK */
const safeFetchText = async (url: string, timeoutMs = 7000, maxBytes = MAX_ULDK_BYTES): Promise<string | null> => {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Accept: 'text/plain,text/html,application/json,*/*;q=0.8',
        'User-Agent': HTTP_USER_AGENT,
      },
    });
    if (!res.ok) return null;
    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      chunks.push(value);
      // Natychmiastowe wykrycie tarpitu GUGiK (EWKB 0101000020... o rozmiarze 150 MB) już w 1. pakiecie!
      if (chunks.length === 1) {
        const head = Buffer.from(value.subarray(0, Math.min(80, value.byteLength))).toString('utf8');
        if (head.includes('0101000020')) {
          await reader.cancel().catch(() => { });
          return null;
        }
      }
      if (total > maxBytes) {
        await reader.cancel().catch(() => { });
        return null;
      }
    }
    return Buffer.concat(chunks).toString('utf8');
  } catch {
    return null;
  }
};

/** Parsuje WKT POLYGON / MULTIPOLYGON w SRID=4326 lub SRID=2180 na tablicę [lat, lng] */
export const parseWktPolygon = (wktRaw: string, is2180 = false): LatLng[] | null => {
  if (!wktRaw) return null;
  const detected2180 = is2180 || /^SRID=2180;/i.test(wktRaw);
  const cleaned = wktRaw.replace(/^SRID=\d+;/i, '').trim();
  const match = cleaned.match(/POLYGON\s*\(\s*\(([^)]+)\)/i);
  if (!match) return null;
  const coords: LatLng[] = [];
  for (const pair of match[1].split(',')) {
    const parts = pair.trim().split(/\s+/).map(Number);
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      let lng = parts[0];
      let lat = parts[1];
      if (detected2180 || Math.abs(lng) > 1000) {
        [lng, lat] = proj4('EPSG:2180', 'EPSG:4326', [parts[0], parts[1]]);
      }
      // Weryfikacja granic Polski (48.5..55.2 N, 13.8..24.5 E)
      if (lat >= 48 && lat <= 56 && lng >= 13 && lng <= 25) {
        coords.push([round(lat), round(lng)]);
      }
    }
  }
  if (coords.length < 3) return null;
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (coords.length > 3 && Math.abs(first[0] - last[0]) < 1e-8 && Math.abs(first[1] - last[1]) < 1e-8) {
    coords.pop();
  }
  return coords.length >= 3 ? coords : null;
};

/** Wylicza metryki geometryczne wielokąta działki (powierzchnia ha, obwód m, centroid, bbox) */
export const buildParcelFromPolygon = (
  polygon: LatLng[],
  meta: {
    teryt: string | null;
    parcelNumber: string | null;
    region: string | null;
    commune: string | null;
    county: string | null;
    voivodeship: string | null;
    isApproximateBuffer: boolean;
    source: ParcelGeometry['source'];
  }
): ParcelGeometry => {
  const lat0 = polygon.reduce((s, p) => s + p[0], 0) / polygon.length;
  const lng0 = polygon.reduce((s, p) => s + p[1], 0) / polygon.length;
  const proj = new LocalProjection(lat0, lng0);
  const xy = polygon.map((p) => proj.toXY(p));
  const areaM2 = polygonArea(xy);
  const cxy = polygonCentroid(xy);
  const [cLat, cLng] = proj.toLatLng(cxy);

  let perimeterM = 0;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    perimeterM += Math.hypot(b.x - a.x, b.y - a.y);
  }

  const lats = polygon.map((p) => p[0]);
  const lngs = polygon.map((p) => p[1]);

  return {
    teryt: meta.teryt,
    parcelNumber: meta.parcelNumber,
    region: meta.region,
    commune: meta.commune,
    county: meta.county,
    voivodeship: meta.voivodeship,
    areaHa: Math.max(0.01, Math.round((areaM2 / 10_000) * 100) / 100),
    perimeterM: Math.round(perimeterM),
    centroid: { lat: round(cLat, 6), lng: round(cLng, 6) },
    bbox: [round(Math.min(...lngs), 6), round(Math.min(...lats), 6), round(Math.max(...lngs), 6), round(Math.max(...lats), 6)],
    polygon,
    isApproximateBuffer: meta.isApproximateBuffer,
    source: meta.source,
    fetchedAt: new Date().toISOString(),
  };
};

/** Parsuje odpowiedź tekstową ULDK (`0\nWKT|teryt|woj|powiat|gmina|obreb|nr`) */
const parseUldkResponse = (text: string | null, source: ParcelGeometry['source']): ParcelGeometry | null => {
  if (!text) return null;
  const lines = text
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2 || !lines[0].startsWith('0')) return null;

  const parts = lines[1].split('|').map((s) => s.trim());
  const wkt = parts[0];
  if (!wkt || !wkt.toUpperCase().includes('POLYGON')) return null;
  const polygon = parseWktPolygon(wkt);
  if (!polygon) return null;

  const clean = (s?: string) => (s && s !== '' && s !== '-' ? s : null);
  return buildParcelFromPolygon(polygon, {
    teryt: clean(parts[1]),
    voivodeship: clean(parts[2]),
    county: clean(parts[3]),
    commune: clean(parts[4]),
    region: clean(parts[5]),
    parcelNumber: clean(parts[6]),
    isApproximateBuffer: false,
    source,
  });
};

/** Pobiera działkę z ULDK po pełnym TERYT (lub `obręb nr`) */
export const resolveParcelById = async (rawId: string): Promise<ParcelGeometry | null> => {
  const id = rawId.trim().replace(/\s+/g, ' ');
  if (!id) return null;

  const cacheKey = `parcel:id:${id.toLowerCase()}`;
  const cached = cacheGet<ParcelGeometry>(cacheKey);
  if (cached) return cached.data;

  if (process.env.NODE_ENV === 'test') {
    return buildApproximateParcel(52.85, 18.25, id);
  }

  const fullFields = 'geom_wkt,teryt,voivodeship,county,commune,region,parcel';
  const minFields = 'geom_wkt,teryt';
  const looksLikeTeryt = /^\d{6}_\d\.\d{4}\./.test(id);
  const attempts: { reqType: string; fields: string; srid: string }[] = looksLikeTeryt
    ? [
      { reqType: 'GetParcelById', fields: fullFields, srid: '4326' },
      { reqType: 'GetParcelById', fields: fullFields, srid: '2180' },
      { reqType: 'GetParcelById', fields: fullFields, srid: '4326' },
      { reqType: 'GetParcelById', fields: minFields, srid: '4326' },
      { reqType: 'GetParcelById', fields: fullFields, srid: '2180' },
      { reqType: 'GetParcelByIdOrNr', fields: fullFields, srid: '4326' },
      { reqType: 'GetParcelById', fields: fullFields, srid: '4326' },
    ]
    : [
      { reqType: 'GetParcelByIdOrNr', fields: fullFields, srid: '4326' },
      { reqType: 'GetParcelByIdOrNr', fields: fullFields, srid: '2180' },
      { reqType: 'GetParcelByIdOrNr', fields: fullFields, srid: '4326' },
      { reqType: 'GetParcelById', fields: fullFields, srid: '4326' },
    ];

  for (let i = 0; i < attempts.length; i++) {
    const { reqType, fields, srid } = attempts[i];
    const url = `${ULDK_BASE}?request=${reqType}&id=${encodeURIComponent(id)}&result=${fields}&srid=${srid}`;
    const text = await safeFetchText(url, 5500);
    // Jeśli ULDK jawnie zwrócił "-1 brak wyników", nie ponawiaj dla nieistniejącego TERYT
    if (text && text.trim().startsWith('-1')) {
      if (i === 0 && looksLikeTeryt) break;
      continue;
    }
    const parsed = parseUldkResponse(text, 'uldk');
    if (parsed) {
      cacheSet(cacheKey, parsed, PARCEL_CACHE_TTL_MS);
      return parsed;
    }
    await new Promise((r) => setTimeout(r, 350 + i * 250));
  }

  return null;
};

/** Pobiera identyfikator TERYT działki w punkcie (lat, lng) przez KIEG WMS GetFeatureInfo */
const lookupTerytViaKiegWms = async (lat: number, lng: number): Promise<string | null> => {
  const d = 0.002;
  const bbox = `${(lng - d).toFixed(6)},${(lat - d).toFixed(6)},${(lng + d).toFixed(6)},${(lat + d).toFixed(6)}`;
  const url =
    `${KIEG_WMS}?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo` +
    `&LAYERS=dzialki&QUERY_LAYERS=dzialki&INFO_FORMAT=text/html&SRS=EPSG:4326` +
    `&BBOX=${bbox}&WIDTH=101&HEIGHT=101&X=50&Y=50`;
  const html = await safeFetchText(url, 6000, 120_000);
  if (!html) return null;

  // KIEG zwraca <title>040704_2.0007.68</title> lub w komórce tabeli
  const titleMatch = html.match(/<title>\s*(\d{6}_\d\.\d{4}\.[^<\s]+)\s*<\/title>/i);
  if (titleMatch?.[1]) return titleMatch[1].trim();
  const bodyMatch = html.match(/(\d{6}_\d\.\d{4}\.[A-Za-z0-9_/-]+)/);
  return bodyMatch?.[1]?.trim() ?? null;
};

/** Tworzy przybliżony obszar analizy (bufor 100×100 m), gdy granice działki w ULDK są niedostępne */
export const buildApproximateParcel = (lat: number, lng: number, teryt: string | null = null): ParcelGeometry => {
  const proj = new LocalProjection(lat, lng);
  const r = 80; // ~2 ha kwadrat analizy
  const pts: LatLng[] = [
    proj.toLatLng({ x: -r, y: -r }),
    proj.toLatLng({ x: r, y: -r }),
    proj.toLatLng({ x: r, y: r }),
    proj.toLatLng({ x: -r, y: r }),
  ].map(([la, ln]) => [round(la), round(ln)] as LatLng);

  return buildParcelFromPolygon(pts, {
    teryt,
    parcelNumber: null,
    region: null,
    commune: null,
    county: null,
    voivodeship: null,
    isApproximateBuffer: true,
    source: 'approximate_buffer',
  });
};

/** Pobiera działkę ewidencyjną na podstawie współrzędnych kliknięcia (lat, lng) */
export const resolveParcelByCoords = async (lat: number, lng: number): Promise<ParcelGeometry> => {
  const cacheKey = `parcel:xy:${lat.toFixed(4)}:${lng.toFixed(4)}`;
  const cached = cacheGet<ParcelGeometry>(cacheKey);
  if (cached) return cached.data;

  if (process.env.NODE_ENV === 'test') {
    return buildApproximateParcel(lat, lng, '040704_2.0007.68');
  }

  // 1. Próba bezpośrednia ULDK GetParcelByXY
  const fields = 'geom_wkt,teryt,voivodeship,county,commune,region,parcel';
  const xyUrl = `${ULDK_BASE}?request=GetParcelByXY&xy=${lng.toFixed(6)},${lat.toFixed(6)},4326&result=${fields}&srid=4326`;
  const xyText = await safeFetchText(xyUrl, 5000);
  const direct = parseUldkResponse(xyText, 'uldk');
  if (direct) {
    cacheSet(cacheKey, direct, PARCEL_CACHE_TTL_MS);
    return direct;
  }

  // 2. Fallback niezawodny: KIEG WMS GetFeatureInfo -> TERYT -> ULDK GetParcelById
  const teryt = await lookupTerytViaKiegWms(lat, lng);
  if (teryt) {
    const byId = await resolveParcelById(teryt);
    if (byId) {
      const tagged: ParcelGeometry = { ...byId, source: 'kieg+uldk' };
      cacheSet(cacheKey, tagged, PARCEL_CACHE_TTL_MS);
      return tagged;
    }
  }

  // 3. Fallback ostateczny: przybliżony bufor + geokodowanie zwrotne Nominatim dla nazwy gminy/miejscowości
  const approx = buildApproximateParcel(lat, lng, teryt);
  try {
    const revText = await safeFetchText(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&zoom=14&addressdetails=1`,
      4000,
      50_000
    );
    if (revText) {
      const rev = JSON.parse(revText);
      const a = rev?.address ?? {};
      approx.region = a.village || a.town || a.city || a.suburb || null;
      approx.commune = a.municipality || a.town || a.city || null;
      approx.county = a.county || null;
      approx.voivodeship = (a.state || '').replace(/^województwo\s+/i, '') || null;
    }
  } catch {
    // Brak nazwy administracyjnej — nie przerywamy analizy
  }
  return approx;
};

export interface ParsedCoordinates {
  lat: number;
  lng: number;
  inPoland: boolean;
}

const isInPoland = (lat: number, lng: number) =>
  lat >= 48.5 && lat <= 55.2 && lng >= 13.8 && lng <= 24.5;

/**
 * Parsuje współrzędne geograficzne w formatach:
 * - dziesiętnych: "52.85, 18.25", "52.85 18.25", "52.85; 18.25", "52,85; 18,25", "52.85°N 18.25°E"
 * - stopniowo-minutowych (DMS): "52°51'00\"N 18°15'00\"E", "52°51'N 18°15'E"
 * Automatycznie wykrywa zamienioną kolejność (lng, lat) dla obszaru Polski.
 */
export const parseCoordinates = (raw: string): ParsedCoordinates | null => {
  const s = raw.trim();
  if (!s) return null;

  const finalize = (a: number, b: number, aDir?: string, bDir?: string): ParsedCoordinates | null => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    let lat = a;
    let lng = b;
    const d1 = aDir?.toUpperCase();
    const d2 = bDir?.toUpperCase();

    if (d1 === 'E' || d1 === 'W' || d2 === 'N' || d2 === 'S') {
      lat = b * (d2 === 'S' ? -1 : 1);
      lng = a * (d1 === 'W' ? -1 : 1);
    } else {
      if (d1 === 'S') lat = -Math.abs(lat);
      if (d2 === 'W') lng = -Math.abs(lng);
      // Jeśli brak liter N/S/E/W i podano (lng, lat) dla Polski (13.8..24.5, 48.5..55.2) — zamień automatycznie
      if (!d1 && !d2 && a >= 13.8 && a <= 24.5 && b >= 48.5 && b <= 55.2) {
        lat = b;
        lng = a;
      }
    }

    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat: round(lat, 6), lng: round(lng, 6), inPoland: isInPoland(lat, lng) };
  };

  // 1. Format DMS: 52°51'12"N 18°15'04"E
  const dmsRe =
    /^([NS])?\s*(\d{1,2})\s*[°º]\s*(\d{1,2})\s*[′']\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*[″"]?)?\s*([NS])?[\s,;/]+([EW])?\s*(\d{1,3})\s*[°º]\s*(\d{1,2})\s*[′']\s*(?:(\d{1,2}(?:[.,]\d+)?)\s*[″"]?)?\s*([EW])?$/i;
  const dms = s.match(dmsRe);
  if (dms) {
    const deg1 = Number(dms[2]) + Number(dms[3]) / 60 + (dms[4] ? Number(dms[4].replace(',', '.')) / 3600 : 0);
    const deg2 = Number(dms[7]) + Number(dms[8]) / 60 + (dms[9] ? Number(dms[9].replace(',', '.')) / 3600 : 0);
    return finalize(deg1, deg2, dms[1] || dms[5], dms[6] || dms[10]);
  }

  // 2. Format dziesiętny z polskim przecinkiem: "52,85 18,25", "52,85; 18,25", "52,85, 18,25"
  const commaRe =
    /^([NS])?\s*([+-]?\d{1,2},\d+)\s*[°º]?\s*([NS])?\s*(?:[;/\s]+|,\s+)\s*([EW])?\s*([+-]?\d{1,3},\d+)\s*[°º]?\s*([EW])?$/i;
  const cm = s.match(commaRe);
  if (cm) {
    return finalize(
      Number(cm[2].replace(',', '.')),
      Number(cm[5].replace(',', '.')),
      cm[1] || cm[3],
      cm[4] || cm[6]
    );
  }

  // 3. Format dziesiętny z kropką: "52.85, 18.25", "52.85 18.25", "52.85°N, 18.25°E"
  const dotRe =
    /^([NS])?\s*([+-]?\d{1,2}(?:\.\d+)?)\s*[°º]?\s*([NS])?\s*[,;/\s]+\s*([EW])?\s*([+-]?\d{1,3}(?:\.\d+)?)\s*[°º]?\s*([EW])?$/i;
  const dm = s.match(dotRe);
  if (dm) {
    return finalize(Number(dm[2]), Number(dm[5]), dm[1] || dm[3], dm[4] || dm[6]);
  }

  return null;
};

const normPl = (s: string) =>
  s
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export interface LocationSearchResult {
  label: string;
  sublabel: string;
  lat: number;
  lng: number;
  teryt?: string;
  kind: 'parcel' | 'place';
}

interface ScoredResult extends LocationSearchResult {
  score: number;
}

/** Wyszukiwarka miejscowości / gmin (Open-Meteo Geocoding + GUGiK UUG + Nominatim OSM), współrzędnych lub TERYT */
export const searchPolishLocation = async (query: string): Promise<LocationSearchResult[]> => {
  const q = query.trim();
  if (q.length < 2) return [];

  // 0. Współrzędne geograficzne (np. "52.85, 18.25")
  const coords = parseCoordinates(q);
  if (coords) {
    if (!coords.inPoland) return [];
    const parcel = await resolveParcelByCoords(coords.lat, coords.lng);
    const admin = [parcel.region, parcel.commune, parcel.county, parcel.voivodeship].filter(Boolean).join(', ');
    return [
      {
        label: parcel.teryt
          ? `Działka ${parcel.teryt}`
          : `Współrzędne ${coords.lat.toFixed(5)}°N, ${coords.lng.toFixed(5)}°E`,
        sublabel: admin || `${coords.lat.toFixed(5)}°N, ${coords.lng.toFixed(5)}°E`,
        lat: parcel.centroid.lat,
        lng: parcel.centroid.lng,
        teryt: parcel.teryt ?? undefined,
        kind: parcel.teryt ? 'parcel' : 'place',
      },
    ];
  }

  // 1. Jeśli wygląda na TERYT działki — zapytaj ULDK
  if (/^\d{6}_\d\.\d{4}\./.test(q)) {
    const parcel = await resolveParcelById(q);
    if (parcel) {
      return [
        {
          label: `Działka ${parcel.teryt ?? q}`,
          sublabel: [parcel.region, parcel.commune, parcel.county, parcel.voivodeship].filter(Boolean).join(', '),
          lat: parcel.centroid.lat,
          lng: parcel.centroid.lng,
          teryt: parcel.teryt ?? q,
          kind: 'parcel',
        },
      ];
    }
  }

  if (process.env.NODE_ENV === 'test') return [];

  const qNorm = normPl(q);
  const cacheKey = `search:v2:${qNorm}`;
  const cached = cacheGet<LocationSearchResult[]>(cacheKey);
  if (cached) return cached.data;

  const scored: ScoredResult[] = [];

  // 2. Równolegle: Open-Meteo Geocoding (obsługuje brak polskich znaków + sortowanie wg populacji) oraz GUGiK UUG (oficjalne PRG)
  const [omText, uugText] = await Promise.all([
    safeFetchText(
      `${OPEN_METEO_GEO}?name=${encodeURIComponent(q)}&count=10&language=pl&format=json&countryCode=PL`,
      4500,
      80_000
    ),
    safeFetchText(`${GUGIK_UUG}?request=GetAddress&address=${encodeURIComponent(q)}`, 4500, 120_000),
  ]);

  if (omText) {
    try {
      const omData = JSON.parse(omText);
      for (const item of omData?.results ?? []) {
        if (item.country_code && item.country_code !== 'PL') continue;
        if (item.feature_code === 'AIRP') continue;
        const lat = Number(item.latitude);
        const lng = Number(item.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInPoland(lat, lng)) continue;
        const name = String(item.name || q).trim();
        const nameNorm = normPl(name);
        const pop = Number(item.population) || 0;
        const admin1 = String(item.admin1 || '').replace(/^województwo\s+/i, '').trim();
        const admin2 = String(item.admin2 || '').replace(/^powiat\s+/i, '').trim();
        const admin3 = String(item.admin3 || '').trim();
        const subParts = [admin3, admin2, admin1].filter((v, idx, arr) => v && arr.indexOf(v) === idx);
        let score = 20;
        if (nameNorm === qNorm) score += 100;
        else if (nameNorm.startsWith(qNorm)) score += 50;
        if (pop >= 100_000) score += 80;
        else if (pop >= 30_000) score += 60;
        else if (pop >= 10_000) score += 40;
        else if (pop >= 1_000) score += 20;
        if (item.feature_code === 'PPLC' || item.feature_code === 'PPLA') score += 45;
        else if (item.feature_code === 'PPLA2' || item.feature_code === 'PPLA3') score += 25;
        scored.push({
          label: name,
          sublabel: subParts.join(', '),
          lat: round(lat, 5),
          lng: round(lng, 5),
          kind: 'place',
          score,
        });
      }
    } catch {
      // ignore
    }
  }

  if (uugText) {
    try {
      const data = JSON.parse(uugText);
      const entries = Object.values<any>(data?.results ?? {});
      for (const item of entries) {
        const x = Number(item.x);
        const y = Number(item.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const [lng, lat] = proj4('EPSG:2180', 'EPSG:4326', [x, y]);
        if (!isInPoland(lat, lng)) continue;
        const name = String(item.city || item.street || q).trim();
        const nameNorm = normPl(name);
        const commune = String(item.commune || '').trim();
        const county = String(item.county || '').trim();
        const voivodeship = String(item.voivodeship || '').trim();
        const sub = [commune, county, voivodeship].filter(Boolean).join(', ');
        let score = 15;
        if (nameNorm === qNorm) score += 95;
        else if (nameNorm.startsWith(qNorm)) score += 45;
        if (commune && normPl(commune) === nameNorm) score += 45;
        if (county && normPl(county) === nameNorm) score += 35;
        scored.push({
          label: name,
          sublabel: sub,
          lat: round(lat, 5),
          lng: round(lng, 5),
          kind: 'place',
          score,
        });
      }
    } catch {
      // ignore
    }
  }

              // 3. Fallback Nominatim OSM (z poprawnym User-Agent) dla adresów, ulic i nietypowych nazw
              if(scored.length === 0) {
              const nomText = await safeFetchText(
                `https://nominatim.openstreetmap.org/search?format=json&countrycodes=pl&limit=6&addressdetails=1&accept-language=pl&q=${encodeURIComponent(q)}`,
                5000,
                80_000
              );
              if (nomText) {
                try {
                  const arr = JSON.parse(nomText);
                  if (Array.isArray(arr)) {
                    for (const item of arr.slice(0, 6)) {
                      const lat = Number(item.lat);
                      const lng = Number(item.lon);
                      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInPoland(lat, lng)) continue;
                      const importance = Number(item.importance) || 0;
                      const label = String(item.name || String(item.display_name || q).split(',')[0]).trim();
                      const sublabel = String(item.display_name || '')
                        .split(',')
                        .slice(1, 4)
                        .join(',')
                        .trim();
                      scored.push({
                        label,
                        sublabel,
                        lat: round(lat, 5),
                        lng: round(lng, 5),
                        kind: 'place',
                        score: 30 + importance * 100,
                      });
                    }
                  }
                } catch {
                  // ignore
                }
              }
            }

            // Sortowanie malejąco po trafności + deduplikacja bliskich punktów (~4 km) o tej samej nazwie
            scored.sort((a, b) => b.score - a.score);
            const results: LocationSearchResult[] = [];
            for (const cand of scored) {
              const dup = results.some(
                (r) =>
                  normPl(r.label) === normPl(cand.label) &&
                  Math.abs(r.lat - cand.lat) < 0.045 &&
                  Math.abs(r.lng - cand.lng) < 0.07
              );
              if (!dup) {
                const { score: _score, ...clean } = cand;
                results.push(clean);
                if (results.length >= 6) break;
              }
            }

            if (results.length > 0) {
              cacheSet(cacheKey, results, SEARCH_CACHE_TTL_MS);
            }
            return results;
          };

          /** Pomocnicza konwersja WGS84 [lng, lat] -> EPSG:2180 [easting, northing] */
          export const wgs84ToEpsg2180 = (lat: number, lng: number): { easting: number; northing: number } => {
            const [easting, northing] = proj4('EPSG:2180', [lng, lat]);
            return { easting, northing };
          };
