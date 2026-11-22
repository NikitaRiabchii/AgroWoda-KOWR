/**
 * Moduł meteorologiczny i bilansu wodnego (10 lat historii + stan bieżący + prognoza 7-dniowa):
 * 1. NASA POWER Agroclimatology API (`community=AG`) — bezpłatna, bezkluczowa baza 10-letnia dzienna
 *    (T2M, T2M_MAX, T2M_MIN, PRECTOTCORR, ALLSKY_SFC_SW_DWN, RH2M, WS2M, GWETTOP, GWETROOT).
 * 2. Dokładne obliczenie ewapotranspiracji wskaźnikowej ET0 metodą FAO-56 Penman-Monteith (Allen et al., 1998/2025).
 * 3. Open-Meteo Forecast API (`past_days=92&forecast_days=14`) — uzupełnienie ostatnich dni (opóźnienie satelitarne NASA POWER)
 *    oraz 7-dniowa prognoza opadów i ET0 do decyzji o terminie nawadniania.
 * 4. Open-Meteo Archive API — automatyczny fallback w przypadku niedostępności NASA POWER.
 * 5. IMGW-PIB Dane Publiczne (`synop`) — weryfikacja z najbliższej polskiej stacji synoptycznej dla dat bieżących.
 */
import type {
  CropDefinition,
  DailyMeteoRecord,
  ForecastDay,
  ImgwSynopStation,
  MeteoAnalysis,
  MonthlyVulnerability,
  SoilCategoryIUNG,
  YearlyDroughtPoint,
} from '../types/water';
import { computeCropKcAndStage, dayOfYear } from '../data/crops';
import { haversineKm } from './geo';
import { cacheGet, cacheSet } from './storageService';

const NASA_POWER_URL = 'https://power.larc.nasa.gov/api/temporal/daily/point';
const OPEN_METEO_FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const OPEN_METEO_ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const IMGW_SYNOP_URL = 'https://danepubliczne.imgw.pl/api/data/synop';

const HISTORY_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
const FORECAST_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2h
const IMGW_SYNOP_TTL_MS = 30 * 60 * 1000; // 30 min

const MONTH_LABELS_PL: Record<number, string> = {
  1: 'Sty', 2: 'Lut', 3: 'Mar', 4: 'Kwi', 5: 'Maj', 6: 'Cze',
  7: 'Lip', 8: 'Sie', 9: 'Wrz', 10: 'Paź', 11: 'Lis', 12: 'Gru',
};
const MONTH_NAMES_GENITIVE_PL: Record<number, string> = {
  1: 'stycznia', 2: 'lutego', 3: 'marca', 4: 'kwietnia', 5: 'maja', 6: 'czerwca',
  7: 'lipca', 8: 'sierpnia', 9: 'września', 10: 'października', 11: 'listopada', 12: 'grudnia',
};

/** Przybliżone współrzędne głównych stacji synoptycznych IMGW-PIB (API synop nie podaje lat/lng) */
const IMGW_SYNOP_COORDS: Record<string, [number, number]> = {
  'Białystok': [53.107, 23.162], 'Bielsko-Biała': [49.807, 19.001], 'Chojnice': [53.715, 17.532],
  'Częstochowa': [50.812, 19.092], 'Elbląg': [54.172, 19.433], 'Gdańsk': [54.377, 18.466],
  'Gorzów': [52.742, 15.276], 'Hel': [54.603, 18.811], 'Jelenia Góra': [50.900, 15.788],
  'Kalisz': [51.781, 18.081], 'Kasprowy Wierch': [49.232, 19.982], 'Katowice': [50.240, 19.033],
  'Kętrzyn': [54.067, 21.367], 'Kielce': [50.810, 20.692], 'Kłodzko': [50.437, 16.614],
  'Koło': [52.200, 18.667], 'Kołobrzeg': [54.183, 15.583], 'Koszalin': [54.204, 16.155],
  'Kozienice': [51.565, 21.542], 'Kraków': [50.078, 19.785], 'Krosno': [49.683, 21.750],
  'Legnica': [51.193, 16.207], 'Lesko': [49.467, 22.342], 'Leszno': [51.835, 16.535],
  'Lębork': [54.553, 17.756], 'Lublin': [51.217, 22.393], 'Łeba': [54.753, 17.534],
  'Łódź': [51.722, 19.398], 'Mikołajki': [53.789, 21.589], 'Mława': [53.104, 20.361],
  'Nowy Sącz': [49.627, 20.688], 'Olsztyn': [53.768, 20.422], 'Opole': [50.627, 17.969],
  'Ostrołęka': [53.083, 21.567], 'Piła': [53.133, 16.750], 'Platforma': [55.480, 18.180],
  'Płock': [52.589, 19.726], 'Poznań': [52.417, 16.834], 'Przemyśl': [49.783, 22.767],
  'Racibórz': [50.058, 18.191], 'Resko': [53.767, 15.417], 'Rzeszów': [50.110, 22.042],
  'Sandomierz': [50.697, 21.716], 'Siedlce': [52.181, 22.245], 'Słubice': [52.348, 14.618],
  'Sulejów': [51.353, 19.866], 'Suwałki': [54.131, 22.949], 'Szczecin': [53.395, 14.622],
  'Śnieżka': [50.736, 15.740], 'Świnoujście': [53.923, 14.242], 'Tarnów': [50.030, 20.984],
  'Terespol': [52.078, 23.622], 'Toruń': [53.042, 18.595], 'Ustka': [54.588, 16.854],
  'Warszawa': [52.163, 20.961], 'Wieluń': [51.210, 18.556], 'Włodawa': [51.553, 23.529],
  'Wrocław': [51.103, 16.886], 'Zakopane': [49.294, 19.960], 'Zamość': [50.700, 23.250],
  'Zielona Góra': [51.930, 15.525],
};

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

interface RawDailyRow {
  date: string;
  tempMean: number;
  tempMax: number;
  tempMin: number;
  precipMm: number;
  et0Mm: number;
  soilWetnessTop?: number | null;
  soilWetnessRoot?: number | null;
}

/**
 * Pełny wzór FAO-56 Penman-Monteith na dobową ewapotranspirację wskaźnikową ET0 (mm/dzień).
 * Źródło: Allen, Pereira, Raes, Smith (FAO Irrigation and Drainage Paper No. 56, 1998/2025).
 */
export const computeFao56Et0 = (params: {
  tMax: number;
  tMin: number;
  rhMean: number; // %
  wind2m: number; // m/s
  rsMjM2: number; // MJ/m²/day
  latDeg: number;
  elevM: number;
  doy: number;
}): number => {
  const { tMax, tMin, rhMean, wind2m, rsMjM2, latDeg, elevM, doy } = params;
  const tMean = (tMax + tMin) / 2;

  // Ciśnienie atmosferyczne P (kPa) i stała psychrometryczna gamma (kPa/°C)
  const P = 101.3 * Math.pow((293 - 0.0065 * elevM) / 293, 5.26);
  const gamma = 0.000665 * P;

  // Prężność pary nasyconej es i rzeczywistej ea (kPa)
  const eT = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3));
  const es = (eT(tMax) + eT(tMin)) / 2;
  const ea = es * Math.max(0.05, Math.min(1, rhMean / 100));

  // Nachylenie krzywej prężności pary nasyconej Delta (kPa/°C)
  const delta = (4098 * eT(tMean)) / Math.pow(tMean + 237.3, 2);

  // Promieniowanie pozaatmosferyczne Ra (MJ/m²/d)
  const phi = (latDeg * Math.PI) / 180;
  const dr = 1 + 0.033 * Math.cos((2 * Math.PI * doy) / 365);
  const decl = 0.409 * Math.sin((2 * Math.PI * doy) / 365 - 1.39);
  const wsArg = Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(decl)));
  const ws = Math.acos(wsArg);
  const Ra =
    ((24 * 60) / Math.PI) *
    0.082 *
    dr *
    (ws * Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.sin(ws));

  const Rso = (0.75 + 2e-5 * elevM) * Ra;
  const Rs = Math.max(0, Math.min(Rso * 1.15, rsMjM2));
  const Rns = 0.77 * Rs; // Albedo 0.23

  // Promieniowanie długofalowe netto Rnl (MJ/m²/d)
  const sigma = 4.903e-9;
  const tMaxK4 = Math.pow(tMax + 273.16, 4);
  const tMinK4 = Math.pow(tMin + 273.16, 4);
  const relSun = Rso > 0.1 ? Math.max(0.2, Math.min(1.0, Rs / Rso)) : 0.5;
  const Rnl = sigma * ((tMaxK4 + tMinK4) / 2) * (0.34 - 0.14 * Math.sqrt(Math.max(0.01, ea))) * (1.35 * relSun - 0.35);

  const Rn = Rns - Rnl;
  const u2 = Math.max(0.3, Math.min(15, wind2m));

  const num = 0.408 * delta * Rn + gamma * (900 / (tMean + 273)) * u2 * Math.max(0, es - ea);
  const den = delta + gamma * (1 + 0.34 * u2);
  return Math.max(0, Math.min(14, num / den));
};

const toIsoDate = (d: Date): string => d.toISOString().slice(0, 10);

const addDaysIso = (iso: string, deltaDays: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return toIsoDate(d);
};

const compactYmd = (iso: string) => iso.replace(/-/g, '');
const expandYmd = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

/** Pobiera 10 lat dziennych danych agrometeorologicznych z NASA POWER Agroclimatology */
const fetchNasaPower10y = async (
  lat: number,
  lng: number,
  startIso: string,
  endIso: string,
  elevM: number
): Promise<RawDailyRow[] | null> => {
  const cacheKey = `nasa:${lat.toFixed(2)}:${lng.toFixed(2)}:${startIso}:${endIso}`;
  const cached = cacheGet<RawDailyRow[]>(cacheKey);
  if (cached) return cached.data;

  const params = 'T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,ALLSKY_SFC_SW_DWN,RH2M,WS2M,GWETTOP,GWETROOT';
  const url =
    `${NASA_POWER_URL}?parameters=${params}&community=AG` +
    `&longitude=${lng.toFixed(4)}&latitude=${lat.toFixed(4)}` +
    `&start=${compactYmd(startIso)}&end=${compactYmd(endIso)}&format=JSON`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'AgroWoda-KOWR/1.0' },
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    const p = json?.properties?.parameter;
    if (!p?.T2M || !p?.PRECTOTCORR) return null;

    const rows: RawDailyRow[] = [];
    const keys = Object.keys(p.T2M).sort();
    for (const k of keys) {
      const tMean = Number(p.T2M[k]);
      const tMax = Number(p.T2M_MAX?.[k]);
      const tMin = Number(p.T2M_MIN?.[k]);
      const precip = Number(p.PRECTOTCORR[k]);
      // NASA POWER oznacza brakujące dni (opóźnienie ostatnich 2–4 dni) jako -999
      if (tMean <= -900 || precip <= -900) continue;

      const date = expandYmd(k);
      const rs = Number(p.ALLSKY_SFC_SW_DWN?.[k]);
      const rh = Number(p.RH2M?.[k]);
      const ws = Number(p.WS2M?.[k]);
      const gTop = Number(p.GWETTOP?.[k]);
      const gRoot = Number(p.GWETROOT?.[k]);

      const validTMax = tMax > -900 ? tMax : tMean + 4;
      const validTMin = tMin > -900 ? tMin : tMean - 4;
      const validRs = rs > -900 ? rs : Math.max(2, 12 * Math.sin(((dayOfYear(date) - 80) * Math.PI) / 365) + 10);
      const validRh = rh > -900 ? rh : 72;
      const validWs = ws > -900 ? ws : 2.5;

      const et0 = computeFao56Et0({
        tMax: validTMax,
        tMin: validTMin,
        rhMean: validRh,
        wind2m: validWs,
        rsMjM2: validRs,
        latDeg: lat,
        elevM,
        doy: dayOfYear(date),
      });

      rows.push({
        date,
        tempMean: round(tMean, 1),
        tempMax: round(validTMax, 1),
        tempMin: round(validTMin, 1),
        precipMm: round(Math.max(0, precip), 1),
        et0Mm: round(et0, 2),
        soilWetnessTop: gTop > -900 ? round(gTop, 3) : null,
        soilWetnessRoot: gRoot > -900 ? round(gRoot, 3) : null,
      });
    }

    if (rows.length > 300) {
      cacheSet(cacheKey, rows, HISTORY_CACHE_TTL_MS);
      return rows;
    }
    return null;
  } catch {
    return null;
  }
};

/** Fallback 10-letni: Open-Meteo Archive API (ERA5) */
const fetchOpenMeteoArchive10y = async (
  lat: number,
  lng: number,
  startIso: string,
  endIso: string
): Promise<RawDailyRow[] | null> => {
  const cacheKey = `omarch:${lat.toFixed(2)}:${lng.toFixed(2)}:${startIso}:${endIso}`;
  const cached = cacheGet<RawDailyRow[]>(cacheKey);
  if (cached) return cached.data;

  try {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lng.toFixed(4),
      start_date: startIso,
      end_date: endIso,
      daily: 'temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration',
      timezone: 'Europe/Warsaw',
    });
    const res = await fetch(`${OPEN_METEO_ARCHIVE_URL}?${params.toString()}`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data: any = await res.json();
    const d = data?.daily;
    if (!Array.isArray(d?.time)) return null;

    const rows: RawDailyRow[] = [];
    for (let i = 0; i < d.time.length; i++) {
      if (d.temperature_2m_mean?.[i] == null || d.precipitation_sum?.[i] == null) continue;
      rows.push({
        date: d.time[i],
        tempMean: round(Number(d.temperature_2m_mean[i]), 1),
        tempMax: round(Number(d.temperature_2m_max?.[i] ?? d.temperature_2m_mean[i]), 1),
        tempMin: round(Number(d.temperature_2m_min?.[i] ?? d.temperature_2m_mean[i]), 1),
        precipMm: round(Math.max(0, Number(d.precipitation_sum[i])), 1),
        et0Mm: round(Math.max(0, Number(d.et0_fao_evapotranspiration?.[i] ?? 2)), 2),
      });
    }
    if (rows.length > 300) {
      cacheSet(cacheKey, rows, HISTORY_CACHE_TTL_MS);
      return rows;
    }
    return null;
  } catch {
    return null;
  }
};

interface OpenMeteoRecentResult {
  pastDays: RawDailyRow[];
  forecastDays: ForecastDay[];
  currentSoilTopPct: number | null;
  currentSoilRootPct: number | null;
}

/** Open-Meteo Forecast (`past_days=92&forecast_days=10`): świeże dni + prognoza 7-dniowa + bieżąca wilgotność gleby */
const fetchOpenMeteoRecentAndForecast = async (lat: number, lng: number): Promise<OpenMeteoRecentResult | null> => {
  const cacheKey = `omrecent:${lat.toFixed(2)}:${lng.toFixed(2)}:${toIsoDate(new Date())}`;
  const cached = cacheGet<OpenMeteoRecentResult>(cacheKey);
  if (cached) return cached.data;

  try {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lng.toFixed(4),
      past_days: '92',
      forecast_days: '8',
      daily: 'temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration',
      hourly: 'soil_moisture_0_to_1cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm',
      timezone: 'Europe/Warsaw',
    });
    const res = await fetch(`${OPEN_METEO_FORECAST_URL}?${params.toString()}`, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return null;
    const data: any = await res.json();
    const d = data?.daily;
    if (!Array.isArray(d?.time)) return null;

    const today = toIsoDate(new Date());
    const pastDays: RawDailyRow[] = [];
    const forecastDays: ForecastDay[] = [];

    for (let i = 0; i < d.time.length; i++) {
      const date: string = d.time[i];
      const precip = round(Math.max(0, Number(d.precipitation_sum?.[i] ?? 0)), 1);
      const et0 = round(Math.max(0, Number(d.et0_fao_evapotranspiration?.[i] ?? 0)), 2);
      const tMax = round(Number(d.temperature_2m_max?.[i] ?? 0), 1);
      const tMin = round(Number(d.temperature_2m_min?.[i] ?? 0), 1);
      const tMean = round(Number(d.temperature_2m_mean?.[i] ?? (tMax + tMin) / 2), 1);

      if (date <= today) {
        pastDays.push({ date, tempMean: tMean, tempMax: tMax, tempMin: tMin, precipMm: precip, et0Mm: et0 });
      } else {
        forecastDays.push({ date, tempMax: tMax, precipMm: precip, et0Mm: et0 });
      }
    }

    // Ostatni dostępny bieżący odczyt wilgotności objętościowej gleby (0..0.5 m³/m³ -> % relatywny 0..100%)
    let currentSoilTopPct: number | null = null;
    let currentSoilRootPct: number | null = null;
    const h = data?.hourly;
    if (Array.isArray(h?.time)) {
      const nowPrefix = new Date().toISOString().slice(0, 13);
      let idx = h.time.findIndex((t: string) => t.startsWith(nowPrefix));
      if (idx < 0) idx = Math.max(0, h.time.length - 180);
      const top = Number(h.soil_moisture_3_to_9cm?.[idx]);
      const mid = Number(h.soil_moisture_9_to_27cm?.[idx]);
      const deep = Number(h.soil_moisture_27_to_81cm?.[idx]);
      if (Number.isFinite(top)) currentSoilTopPct = Math.round(Math.min(100, Math.max(0, (top / 0.42) * 100)));
      if (Number.isFinite(mid) && Number.isFinite(deep)) {
        currentSoilRootPct = Math.round(Math.min(100, Math.max(0, (((mid + deep) / 2) / 0.42) * 100)));
      }
    }

    const result: OpenMeteoRecentResult = { pastDays, forecastDays: forecastDays.slice(0, 7), currentSoilTopPct, currentSoilRootPct };
    cacheSet(cacheKey, result, FORECAST_CACHE_TTL_MS);
    return result;
  } catch {
    return null;
  }
};

/** Najbliższa stacja synoptyczna IMGW-PIB (dla dat bieżących) */
const fetchNearestImgwSynop = async (lat: number, lng: number): Promise<ImgwSynopStation | null> => {
  try {
    let list = cacheGet<any[]>('imgw:synop:all')?.data ?? null;
    if (!list) {
      const res = await fetch(IMGW_SYNOP_URL, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      list = (await res.json()) as any[];
      if (Array.isArray(list)) cacheSet('imgw:synop:all', list, IMGW_SYNOP_TTL_MS);
    }
    if (!Array.isArray(list) || !list.length) return null;

    let best: { item: any; dist: number } | null = null;
    for (const item of list) {
      const coords = IMGW_SYNOP_COORDS[item.stacja];
      if (!coords) continue;
      const dist = haversineKm({ lat, lng }, { lat: coords[0], lng: coords[1] });
      if (!best || dist < best.dist) best = { item, dist };
    }
    if (!best) return null;
    const s = best.item;
    const toNum = (v: unknown) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
    return {
      id: String(s.id_stacji ?? ''),
      name: String(s.stacja ?? ''),
      distanceKm: round(best.dist, 1),
      measurementDate: `${s.data_pomiaru ?? ''} ${s.godzina_pomiaru ?? ''}:00`.trim(),
      temperatureC: toNum(s.temperatura),
      precipitationMm: toNum(s.suma_opadu),
      humidityPct: toNum(s.wilgotnosc_wzgledna),
      windSpeedMs: toNum(s.predkosc_wiatru),
    };
  } catch {
    return null;
  }
};

/** Generuje syntetyczne deterministyczne dane wyłącznie dla środowiska testów jednostkowych Jest */
const buildTestMeteoRows = (endIso: string): RawDailyRow[] => {
  const rows: RawDailyRow[] = [];
  const start = addDaysIso(endIso, -3655);
  let cur = start;
  while (cur <= endIso) {
    const doy = dayOfYear(cur);
    const year = Number(cur.slice(0, 4));
    const seasonal = Math.sin(((doy - 105) * 2 * Math.PI) / 365);
    const tMean = round(9 + 11 * seasonal, 1);
    const et0 = round(Math.max(0.4, 2.5 + 2.3 * seasonal), 2);
    // Symulacja okresów suszy w latach nieparzystych oraz ostatnich 45 dniach
    const isDryYear = year % 2 === 1;
    const isRecent = cur >= addDaysIso(endIso, -45);
    const precip = isRecent
      ? (doy % 11 === 0 ? 4.2 : 0)
      : isDryYear
        ? (doy % 9 === 0 ? 7.5 : 0)
        : (doy % 5 === 0 ? 9.0 : 0);
    rows.push({
      date: cur,
      tempMean: tMean,
      tempMax: round(tMean + 5.5, 1),
      tempMin: round(tMean - 4.5, 1),
      precipMm: precip,
      et0Mm: et0,
      soilWetnessTop: isRecent ? 0.34 : 0.62,
      soilWetnessRoot: isRecent ? 0.42 : 0.68,
    });
    cur = addDaysIso(cur, 1);
  }
  return rows;
};

/** Liczy najdłuższy ciąg dni bezopadowych (< 1 mm) i aktualny ciąg kończący się ostatniego dnia */
const drySpellStats = (rows: RawDailyRow[]) => {
  let maxSpell = 0;
  let curSpell = 0;
  for (const r of rows) {
    if (r.precipMm < 1.0) {
      curSpell += 1;
      if (curSpell > maxSpell) maxSpell = curSpell;
    } else {
      curSpell = 0;
    }
  }
  return { longestDrySpell: maxSpell, consecutiveDryDays: curSpell };
};

export const analyzeMeteo = async (params: {
  lat: number;
  lng: number;
  elevM: number;
  analysisDate: string;
  crop: CropDefinition;
  iungSoilCategory: SoilCategoryIUNG;
}): Promise<MeteoAnalysis> => {
  const { lat, lng, elevM, analysisDate, crop, iungSoilCategory } = params;
  const todayIso = toIsoDate(new Date());
  const effectiveEnd = analysisDate > todayIso ? todayIso : analysisDate;
  const diffDaysFromToday = Math.round(
    (new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${effectiveEnd}T00:00:00Z`).getTime()) / 86_400_000
  );
  const isHistoricalDate = diffDaysFromToday > 3;

  // Zakres 10 lat wstecz (+65 dni bufora na 60-dniowe okno pierwszego roku)
  const endYear = Number(effectiveEnd.slice(0, 4));
  const startIso = `${endYear - 10}-01-01`;

  const sources: string[] = [];
  let rawRows: RawDailyRow[] = [];
  let forecastDays: ForecastDay[] = [];
  let omSoilTopPct: number | null = null;
  let omSoilRootPct: number | null = null;
  let imgwSynop: ImgwSynopStation | null = null;

  if (process.env.NODE_ENV === 'test') {
    rawRows = buildTestMeteoRows(effectiveEnd);
    sources.push('NASA POWER Agroclimatology (tryb testowy)');
  } else {
    // Równoległe pobranie 10-letniej historii NASA POWER + (jeśli data z ostatnich 85 dni) Open-Meteo Forecast + IMGW Synop
    const needRecentStitch = diffDaysFromToday <= 85;
    const [nasaRows, recentOm, synop] = await Promise.all([
      fetchNasaPower10y(lat, lng, startIso, effectiveEnd, elevM),
      needRecentStitch ? fetchOpenMeteoRecentAndForecast(lat, lng) : Promise.resolve(null),
      !isHistoricalDate ? fetchNearestImgwSynop(lat, lng) : Promise.resolve(null),
    ]);

    imgwSynop = synop;

    if (nasaRows && nasaRows.length > 300) {
      rawRows = nasaRows;
      sources.push('NASA POWER Agroclimatology (FAO-56 Penman-Monteith, 10 lat)');
    } else {
      const omArchive = await fetchOpenMeteoArchive10y(lat, lng, startIso, effectiveEnd);
      if (omArchive && omArchive.length > 300) {
        rawRows = omArchive;
        sources.push('Open-Meteo ERA5 Archive (10 lat)');
      }
    }

    if (recentOm) {
      sources.push('Open-Meteo (ostatnie dni i prognoza 7-dniowa)');
      if (!isHistoricalDate) {
        forecastDays = recentOm.forecastDays;
        omSoilTopPct = recentOm.currentSoilTopPct;
        omSoilRootPct = recentOm.currentSoilRootPct;
      }
      // Doszyj świeże dni z Open-Meteo, których NASA POWER jeszcze nie opublikował (opóźnienie 2–4 dni)
      const byDate = new Map(rawRows.map((r) => [r.date, r]));
      for (const r of recentOm.pastDays) {
        if (r.date <= effectiveEnd && !byDate.has(r.date)) {
          byDate.set(r.date, r);
        }
      }
      rawRows = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    }

    if (imgwSynop) {
      sources.push(`IMGW-PIB Synop (stacja ${imgwSynop.name})`);
    }
  }

  if (rawRows.length < 60) {
    return {
      available: false,
      analysisDate: effectiveEnd,
      isHistoricalDate,
      yearsAnalyzed: 0,
      historyStart: startIso,
      historyEnd: effectiveEnd,
      current: {
        precip30dMm: 0, et030dMm: 0, etc30dMm: 0, kbw30dMm: 0, cropBalance30dMm: 0,
        precip60dMm: 0, et060dMm: 0, etc60dMm: 0, kbw60dMm: 0, cropBalance60dMm: 0,
        tempMean30d: 0, tempMax30d: 0, consecutiveDryDays: 0, longestDrySpell60d: 0,
        heavyRainDays60d: 0, heavyRainSharePct60d: 0, soilWetnessTopPct: null, soilWetnessRootPct: null,
        kcCurrent: crop.kc.mid, phenologyStagePl: 'Brak danych', isGrowingSeason: true,
      },
      anomalies: {
        precip60dNormalMm: 0, precip60dPctOfNormal: 100, kbw60dNormalMm: 0, kbw60dAnomalyMm: 0,
        kbw60dZScore: 0, temp30dNormalC: 0, temp30dAnomalyC: 0,
      },
      historical10y: {
        yearlySeries: [], monthlyProfile: [], droughtYearsCount: 0, droughtFrequencyPct: 0,
        worstYear: null, peakRiskMonths: [], peakRiskPeriodPl: 'Brak danych',
        avgAnnualPrecipMm: 0, avgAnnualHeavyRainDays: 0,
      },
      daily60d: [],
      forecast7d: { available: false, totalPrecipMm: 0, totalEt0Mm: 0, precipNext48hMm: 0, days: [], note: 'Brak danych prognozy.' },
      imgwSynop,
      sources,
      fetchedAt: new Date().toISOString(),
    };
  }

  // Indeks po dacie dla szybkich okien 30/60-dniowych
  const filtered = rawRows.filter((r) => r.date <= effectiveEnd);
  const lastRowDate = filtered[filtered.length - 1].date;
  const rows60 = filtered.slice(-60);
  const rows30 = filtered.slice(-30);

  const curPheno = computeCropKcAndStage(crop, dayOfYear(effectiveEnd));

  const daily60d: DailyMeteoRecord[] = rows60.map((r) => {
    const { kc } = computeCropKcAndStage(crop, dayOfYear(r.date));
    const etc = round(r.et0Mm * kc, 2);
    return {
      date: r.date,
      tempMean: r.tempMean,
      tempMax: r.tempMax,
      tempMin: r.tempMin,
      precipMm: r.precipMm,
      et0Mm: r.et0Mm,
      etcMm: etc,
      kbwDayMm: round(r.precipMm - r.et0Mm, 2),
      cropBalanceDayMm: round(r.precipMm - etc, 2),
      soilWetnessTop: r.soilWetnessTop ?? null,
      soilWetnessRoot: r.soilWetnessRoot ?? null,
    };
  });
  const daily30d = daily60d.slice(-30);

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const precip30dMm = round(sum(daily30d.map((r) => r.precipMm)), 1);
  const et030dMm = round(sum(daily30d.map((r) => r.et0Mm)), 1);
  const etc30dMm = round(sum(daily30d.map((r) => r.etcMm)), 1);
  const kbw30dMm = round(precip30dMm - et030dMm, 1);
  const cropBalance30dMm = round(precip30dMm - etc30dMm, 1);

  const precip60dMm = round(sum(daily60d.map((r) => r.precipMm)), 1);
  const et060dMm = round(sum(daily60d.map((r) => r.et0Mm)), 1);
  const etc60dMm = round(sum(daily60d.map((r) => r.etcMm)), 1);
  const kbw60dMm = round(precip60dMm - et060dMm, 1);
  const cropBalance60dMm = round(precip60dMm - etc60dMm, 1);

  const tempMean30d = round(sum(daily30d.map((r) => r.tempMean)) / Math.max(1, daily30d.length), 1);
  const tempMax30d = round(Math.max(...daily30d.map((r) => r.tempMax)), 1);
  const { longestDrySpell: longestDrySpell60d, consecutiveDryDays } = drySpellStats(rows60);

  const heavyRows60 = rows60.filter((r) => r.precipMm >= 20);
  const heavyRainDays60d = heavyRows60.length;
  const heavyRainSharePct60d = precip60dMm > 0 ? Math.round((sum(heavyRows60.map((r) => r.precipMm)) / precip60dMm) * 100) : 0;

  // Ostatnia znana wilgotność gleby z NASA POWER (lub Open-Meteo dla dziś)
  const latestTopNasa = [...rows30].reverse().find((r) => r.soilWetnessTop != null)?.soilWetnessTop ?? null;
  const latestRootNasa = [...rows30].reverse().find((r) => r.soilWetnessRoot != null)?.soilWetnessRoot ?? null;
  const soilWetnessTopPct = omSoilTopPct ?? (latestTopNasa !== null ? Math.round(latestTopNasa * 100) : null);
  const soilWetnessRootPct = omSoilRootPct ?? (latestRootNasa !== null ? Math.round(latestRootNasa * 100) : null);

  // Analiza wieloletnia: te same 60-dniowe okna kalendarzowe w każdym z ostatnich 10 lat
  const iungThresh = crop.iungKbwThresholdMm[iungSoilCategory];
  const mmdd = effectiveEnd.slice(5); // MM-DD
  const yearlySeries: YearlyDroughtPoint[] = [];

  for (let y = endYear - 9; y <= endYear; y++) {
    // Obsługa 29 lutego
    const safeMmdd = mmdd === '02-29' && y % 4 !== 0 ? '02-28' : mmdd;
    const wEnd = `${y}-${safeMmdd}`;
    const wStart = addDaysIso(wEnd, -59);
    const slice = filtered.filter((r) => r.date >= wStart && r.date <= wEnd);
    if (slice.length < 45) continue;

    const p60 = round(sum(slice.map((r) => r.precipMm)), 1);
    const e60 = round(sum(slice.map((r) => r.et0Mm)), 1);
    const k60 = round(p60 - e60, 1);
    const t60 = round(sum(slice.map((r) => r.tempMean)) / slice.length, 1);
    const ds = drySpellStats(slice);
    const hDays = slice.filter((r) => r.precipMm >= 20).length;

    yearlySeries.push({
      year: y,
      windowStart: wStart,
      windowEnd: wEnd,
      precip60dMm: p60,
      et060dMm: e60,
      kbw60dMm: k60,
      tempMean60d: t60,
      longestDrySpellDays: ds.longestDrySpell,
      heavyRainDays: hDays,
      exceedsIungThreshold: k60 <= iungThresh,
    });
  }

  // Anomalie względem 10-letniej normy dla tego samego okna
  const normPrecip60 = yearlySeries.length ? round(sum(yearlySeries.map((y) => y.precip60dMm)) / yearlySeries.length, 1) : precip60dMm;
  const normKbw60 = yearlySeries.length ? round(sum(yearlySeries.map((y) => y.kbw60dMm)) / yearlySeries.length, 1) : kbw60dMm;
  const kbwStd =
    yearlySeries.length >= 3
      ? Math.sqrt(yearlySeries.reduce((s, y) => s + (y.kbw60dMm - normKbw60) ** 2, 0) / yearlySeries.length)
      : 40;
  const kbwZ = round((kbw60dMm - normKbw60) / Math.max(15, kbwStd), 2);

  // Norma temperatury dla tego samego 30-dniowego okna
  const tempNormals: number[] = [];
  for (let y = endYear - 9; y <= endYear; y++) {
    const safeMmdd = mmdd === '02-29' && y % 4 !== 0 ? '02-28' : mmdd;
    const wEnd = `${y}-${safeMmdd}`;
    const wStart = addDaysIso(wEnd, -29);
    const sl = filtered.filter((r) => r.date >= wStart && r.date <= wEnd);
    if (sl.length >= 20) tempNormals.push(sum(sl.map((r) => r.tempMean)) / sl.length);
  }
  const temp30dNormalC = tempNormals.length ? round(sum(tempNormals) / tempNormals.length, 1) : tempMean30d;

  // Miesięczny profil ryzyka suszy (marzec–październik) w 10-leciu
  const monthlyProfile: MonthlyVulnerability[] = [];
  for (let m = 3; m <= 10; m++) {
    const mStr = String(m).padStart(2, '0');
    const byYear = new Map<number, RawDailyRow[]>();
    for (const r of filtered) {
      if (r.date.slice(5, 7) !== mStr) continue;
      const yr = Number(r.date.slice(0, 4));
      if (yr < endYear - 9 || yr > endYear) continue;
      if (!byYear.has(yr)) byYear.set(yr, []);
      byYear.get(yr)!.push(r);
    }
    const completeYears = Array.from(byYear.values()).filter((arr) => arr.length >= 20);
    if (!completeYears.length) continue;

    const avgP = round(sum(completeYears.map((arr) => sum(arr.map((r) => r.precipMm)))) / completeYears.length, 1);
    const avgE = round(sum(completeYears.map((arr) => sum(arr.map((r) => r.et0Mm)))) / completeYears.length, 1);
    const avgKbw = round(avgP - avgE, 1);
    // Miesięczny próg deficytu = połowa 60-dniowego progu IUNG
    const monthDroughtThreshold = iungThresh / 2;
    const droughtCount = completeYears.filter((arr) => sum(arr.map((r) => r.precipMm - r.et0Mm)) <= monthDroughtThreshold).length;
    const riskScore = Math.max(0, Math.min(100, Math.round(Math.max(0, -avgKbw) * 0.9 + (droughtCount / completeYears.length) * 35)));

    monthlyProfile.push({
      month: m,
      monthLabelPl: MONTH_LABELS_PL[m],
      avgPrecipMm: avgP,
      avgEt0Mm: avgE,
      avgKbwMm: avgKbw,
      droughtYearsCount: droughtCount,
      totalYears: completeYears.length,
      riskScore,
    });
  }

  // Wskazanie miesięcy szczytowego ryzyka (najniższy średni KBW)
  const sortedMonths = [...monthlyProfile].sort((a, b) => a.avgKbwMm - b.avgKbwMm);
  const peakMonths = sortedMonths
    .filter((m) => m.avgKbwMm < -20)
    .slice(0, 3)
    .map((m) => m.month)
    .sort((a, b) => a - b);

  const peakRiskPeriodPl =
    peakMonths.length >= 2
      ? `od ${MONTH_NAMES_GENITIVE_PL[peakMonths[0]]} do ${MONTH_NAMES_GENITIVE_PL[peakMonths[peakMonths.length - 1]]}`
      : peakMonths.length === 1
        ? `w miesiącu: ${MONTH_LABELS_PL[peakMonths[0]]}`
        : 'brak wyraźnego wieloletniego deficytu sezonowego';

  // Roczne statystyki opadów (ostatnie 10 pełnych lat)
  const byFullYear = new Map<number, RawDailyRow[]>();
  for (const r of filtered) {
    const yr = Number(r.date.slice(0, 4));
    if (!byFullYear.has(yr)) byFullYear.set(yr, []);
    byFullYear.get(yr)!.push(r);
  }
  const fullYears = Array.from(byFullYear.values()).filter((arr) => arr.length >= 340);
  const avgAnnualPrecipMm = fullYears.length ? Math.round(sum(fullYears.map((arr) => sum(arr.map((r) => r.precipMm)))) / fullYears.length) : 550;
  const avgAnnualHeavyRainDays = fullYears.length
    ? round(sum(fullYears.map((arr) => arr.filter((r) => r.precipMm >= 20).length)) / fullYears.length, 1)
    : 0;

  // Ile z ostatnich 10 lat miało suszę rolniczą w sezonie wegetacyjnym (min. jedno 60-dniowe okno IV–IX poniżej progu IUNG)
  const droughtSeasonYears = new Set<number>();
  for (let y = endYear - 9; y <= endYear; y++) {
    const seasonRows = filtered.filter((r) => r.date >= `${y}-03-01` && r.date <= `${y}-09-30`);
    if (seasonRows.length < 60) continue;
    let rolling = 0;
    for (let i = 0; i < seasonRows.length; i++) {
      rolling += seasonRows[i].precipMm - seasonRows[i].et0Mm;
      if (i >= 60) rolling -= seasonRows[i - 60].precipMm - seasonRows[i - 60].et0Mm;
      if (i >= 59 && rolling <= iungThresh) {
        droughtSeasonYears.add(y);
        break;
      }
    }
  }

  const yearsAnalyzed = Math.max(yearlySeries.length, fullYears.length);
  const droughtYearsCount = droughtSeasonYears.size;
  const droughtFrequencyPct = yearsAnalyzed > 0 ? Math.round((droughtYearsCount / Math.min(10, yearsAnalyzed)) * 100) : 0;
  const worstPt = yearlySeries.length ? yearlySeries.reduce((w, cur) => (cur.kbw60dMm < w.kbw60dMm ? cur : w), yearlySeries[0]) : null;

  return {
    available: true,
    analysisDate: effectiveEnd,
    isHistoricalDate,
    yearsAnalyzed,
    historyStart: filtered[0].date,
    historyEnd: lastRowDate,
    current: {
      precip30dMm,
      et030dMm,
      etc30dMm,
      kbw30dMm,
      cropBalance30dMm,
      precip60dMm,
      et060dMm,
      etc60dMm,
      kbw60dMm,
      cropBalance60dMm,
      tempMean30d,
      tempMax30d,
      consecutiveDryDays,
      longestDrySpell60d,
      heavyRainDays60d,
      heavyRainSharePct60d,
      soilWetnessTopPct,
      soilWetnessRootPct,
      kcCurrent: curPheno.kc,
      phenologyStagePl: curPheno.stagePl,
      isGrowingSeason: curPheno.isGrowingSeason,
    },
    anomalies: {
      precip60dNormalMm: normPrecip60,
      precip60dPctOfNormal: normPrecip60 > 0 ? Math.round((precip60dMm / normPrecip60) * 100) : 100,
      kbw60dNormalMm: normKbw60,
      kbw60dAnomalyMm: round(kbw60dMm - normKbw60, 1),
      kbw60dZScore: kbwZ,
      temp30dNormalC,
      temp30dAnomalyC: round(tempMean30d - temp30dNormalC, 1),
    },
    historical10y: {
      yearlySeries,
      monthlyProfile,
      droughtYearsCount,
      droughtFrequencyPct,
      worstYear: worstPt ? { year: worstPt.year, kbw60dMm: worstPt.kbw60dMm } : null,
      peakRiskMonths: peakMonths,
      peakRiskPeriodPl,
      avgAnnualPrecipMm,
      avgAnnualHeavyRainDays,
    },
    daily60d,
    forecast7d: {
      available: forecastDays.length > 0,
      totalPrecipMm: round(sum(forecastDays.map((d) => d.precipMm)), 1),
      totalEt0Mm: round(sum(forecastDays.map((d) => d.et0Mm)), 1),
      precipNext48hMm: round(sum(forecastDays.slice(0, 2).map((d) => d.precipMm)), 1),
      days: forecastDays,
      note: isHistoricalDate
        ? 'Analiza dotyczy daty historycznej — 7-dniowa prognoza pogody dotyczy wyłącznie analiz bieżących.'
        : forecastDays.length === 0
          ? 'Prognoza 7-dniowa była czasowo niedostępna.'
          : undefined,
    },
    imgwSynop,
    sources,
    fetchedAt: new Date().toISOString(),
  };
};
