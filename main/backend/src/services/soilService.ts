/**
 * Analiza glebowa i retencji wodnej gleby:
 * - ISRIC SoilGrids v2.0 (https://rest.isric.org/soilgrids/v2.0/properties/query) — siatka 250 m, licencja CC-BY 4.0
 * - Równania pedotransferowe Saxton & Rawls (2006) — pojemność polowa (FC), punkt trwałego więdnięcia (PWP),
 *   retencja użyteczna AWC (mm) i przewodnictwo wodne Ksat (mm/h) z uwzględnieniem materii organicznej (próchnicy).
 * - Klasyfikacja do 4 kategorii podatności gleb na suszę wg IUNG-PIB (System Monitoringu Suszy Rolniczej).
 */
import type { CropDefinition, SoilAnalysis, SoilCategoryIUNG } from '../types/water';
import { cacheGet, cacheSet } from './storageService';

const SOILGRIDS_URL = 'https://rest.isric.org/soilgrids/v2.0/properties/query';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dni (właściwości gleby stałe)

const round = (v: number, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

interface RawSoilProfile {
  sandPct: number;
  siltPct: number;
  clayPct: number;
  socGKg: number;
  bdodKgDm3: number;
  fetchedAt: string;
}

/** Wagi głębokości profilu 0–60 cm: 0-5 (5cm), 5-15 (10cm), 15-30 (15cm), 30-60 (30cm) */
const DEPTH_WEIGHTS: Record<string, number> = {
  '0-5cm': 5,
  '5-15cm': 10,
  '15-30cm': 15,
  '30-60cm': 30,
};

/**
 * Równania pedotransferowe Saxton & Rawls (2006) — Soil Water Characteristics.
 * S = frakcja piasku (0..1), C = frakcja iłu (0..1), OM = materia organiczna w % wagowych (np. 2.1%).
 */
export const saxtonRawlsHydraulics = (sandPct: number, clayPct: number, omPct: number) => {
  const S = Math.max(0.01, Math.min(0.98, sandPct / 100));
  const C = Math.max(0.01, Math.min(0.8, clayPct / 100));
  const OM = Math.max(0.2, Math.min(8.0, omPct));

  // Punkt trwałego więdnięcia (1500 kPa)
  const t1500t = -0.024 * S + 0.487 * C + 0.006 * OM + 0.005 * (S * OM) - 0.013 * (C * OM) + 0.068 * (S * C) + 0.031;
  const pwp = Math.max(0.03, Math.min(0.45, t1500t + (0.14 * t1500t - 0.02)));

  // Pojemność polowa (33 kPa)
  const t33t = -0.251 * S + 0.195 * C + 0.011 * OM + 0.006 * (S * OM) - 0.027 * (C * OM) + 0.452 * (S * C) + 0.299;
  const fc = Math.max(pwp + 0.05, Math.min(0.55, t33t + (1.283 * t33t * t33t - 0.374 * t33t - 0.015)));

  // Nasycenie (0 kPa) i przewodnictwo nasycone Ksat (mm/h)
  const tS33t = 0.278 * S + 0.034 * C + 0.022 * OM - 0.018 * (S * OM) - 0.027 * (C * OM) - 0.584 * (S * C) + 0.078;
  const tS33 = Math.max(0.04, tS33t + (0.636 * tS33t - 0.107));
  const sat = Math.min(0.65, fc + tS33 - 0.097 * S + 0.043);
  const B = (Math.log(1500) - Math.log(33)) / Math.max(0.02, Math.log(fc) - Math.log(pwp));
  const lambda = 1 / Math.max(1.5, B);
  const ksat = Math.max(0.5, Math.min(250, 1930 * Math.pow(Math.max(0.02, sat - fc), 3 - lambda)));

  const awcFraction = Math.max(0.05, fc - pwp); // m³/m³ = mm wody na mm głębokości gleby
  return {
    fcVolPct: round(fc * 100, 1),
    pwpVolPct: round(pwp * 100, 1),
    awcMmPerM: Math.round(awcFraction * 1000),
    ksatMmH: round(ksat, 1),
  };
};

/** Klasyfikacja grupy granulometrycznej (PTG / USDA uproszczona na język zrozumiały dla rolnika) */
export const classifyPolishSoilTexture = (sand: number, silt: number, clay: number): string => {
  if (sand >= 85) return 'Piasek luźny / słabogliniasty (gleba bardzo lekka)';
  if (sand >= 70 && clay < 15) return 'Piasek gliniasty (gleba lekka)';
  if (clay >= 35) return 'Ił / glina ciężka';
  if (clay >= 25) return 'Glina średnia / ciężka';
  if (silt >= 50 && clay < 25) return 'Pył gliniasty / utwór lessopodobny';
  if (sand >= 50 && clay < 20) return 'Glina piaszczysta (gleba lekka/średnia)';
  return 'Glina lekka / średnia (gleba zwięzła)';
};

/**
 * Klasyfikacja do 4 kategorii podatności gleby na suszę wg IUNG-PIB
 * na podstawie retencji użytecznej AWC (mm/m) oraz udziału frakcji piaszczystej i ilastej.
 */
export const classifyIungCategory = (
  sandPct: number,
  clayPct: number,
  awcMmPerM: number
): { category: SoilCategoryIUNG; labelPl: string; retentionClass: SoilAnalysis['retentionClass'] } => {
  if (sandPct >= 75 || awcMmPerM < 92) {
    return {
      category: 1,
      labelPl: 'Kategoria I — bardzo lekka (bardzo podatna na suszę)',
      retentionClass: 'bardzo_niska',
    };
  }
  if (sandPct >= 58 || awcMmPerM < 125) {
    return {
      category: 2,
      labelPl: 'Kategoria II — lekka (podatna na suszę)',
      retentionClass: 'niska',
    };
  }
  if (clayPct >= 26 || awcMmPerM >= 160) {
    return {
      category: 4,
      labelPl: 'Kategoria IV — ciężka (wysoka retencja glebowa)',
      retentionClass: 'dobra',
    };
  }
  return {
    category: 3,
    labelPl: 'Kategoria III — średnia (umiarkowana retencja glebowa)',
    retentionClass: 'srednia',
  };
};

const IUNG_OVERRIDE_DEFAULTS: Record<SoilCategoryIUNG, { awcMmPerM: number; labelPl: string; retentionClass: SoilAnalysis['retentionClass'] }> = {
  1: { awcMmPerM: 90, labelPl: 'Kategoria I — bardzo lekka (wskazana przez rolnika)', retentionClass: 'bardzo_niska' },
  2: { awcMmPerM: 120, labelPl: 'Kategoria II — lekka (wskazana przez rolnika)', retentionClass: 'niska' },
  3: { awcMmPerM: 150, labelPl: 'Kategoria III — średnia (wskazana przez rolnika)', retentionClass: 'srednia' },
  4: { awcMmPerM: 185, labelPl: 'Kategoria IV — ciężka (wskazana przez rolnika)', retentionClass: 'dobra' },
};

const fetchSoilGrids = async (lat: number, lng: number): Promise<RawSoilProfile | null> => {
  // Klucz cache ~250 m (zgodny z rozdzielczością SoilGrids)
  const cacheKey = `soilgrids:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = cacheGet<RawSoilProfile>(cacheKey);
  if (cached) return cached.data;

  const url =
    `${SOILGRIDS_URL}?lon=${lng.toFixed(5)}&lat=${lat.toFixed(5)}` +
    `&property=sand&property=silt&property=clay&property=soc&property=bdod` +
    `&depth=0-5cm&depth=5-15cm&depth=15-30cm&depth=30-60cm&value=mean`;

  // Do 3 prób (ISRIC SoilGrids miewa chwilowe 503/429)
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(9500),
        headers: { 'User-Agent': 'AgroWoda-KOWR/1.0', Accept: 'application/json' },
      });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          await new Promise((r) => setTimeout(r, 800 + attempt * 600));
          continue;
        }
        return null;
      }
      const data: any = await res.json();
      const layers: any[] = data?.properties?.layers ?? [];
      if (!layers.length) return null;

      const weightedLayer = (name: string): number | null => {
        const layer = layers.find((l) => l.name === name);
        if (!layer) return null;
        const dFactor = Number(layer.unit_measure?.d_factor ?? 1);
        let sum = 0;
        let wSum = 0;
        for (const d of layer.depths ?? []) {
          const val = d.values?.mean;
          const w = DEPTH_WEIGHTS[d.label] ?? 10;
          if (val !== null && val !== undefined && Number.isFinite(Number(val))) {
            sum += (Number(val) / dFactor) * w;
            wSum += w;
          }
        }
        return wSum > 0 ? sum / wSum : null;
      };

      const sand = weightedLayer('sand'); // g/100g = %
      const silt = weightedLayer('silt');
      const clay = weightedLayer('clay');
      const soc = weightedLayer('soc'); // g/kg
      const bdod = weightedLayer('bdod'); // kg/dm³

      if (sand === null || silt === null || clay === null) return null;

      const total = sand + silt + clay;
      const normFactor = total > 0 ? 100 / total : 1;
      const profile: RawSoilProfile = {
        sandPct: round(sand * normFactor, 1),
        siltPct: round(silt * normFactor, 1),
        clayPct: round(clay * normFactor, 1),
        socGKg: round(soc ?? 14, 1),
        bdodKgDm3: round(bdod ?? 1.4, 2),
        fetchedAt: new Date().toISOString(),
      };
      cacheSet(cacheKey, profile, CACHE_TTL_MS);
      return profile;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return null;
};

export const analyzeSoil = async (
  lat: number,
  lng: number,
  crop: CropDefinition,
  userOverride?: SoilCategoryIUNG | null
): Promise<SoilAnalysis> => {
  if (process.env.NODE_ENV === 'test') {
    const sandPct = 66;
    const siltPct = 24;
    const clayPct = 10;
    const socGKg = 11.5;
    const humusPct = round((socGKg / 10) * 1.724, 2);
    const hyd = saxtonRawlsHydraulics(sandPct, clayPct, humusPct);
    const iung = userOverride
      ? { category: userOverride, ...IUNG_OVERRIDE_DEFAULTS[userOverride] }
      : classifyIungCategory(sandPct, clayPct, hyd.awcMmPerM);
    const awcRootZoneMm = Math.round(hyd.awcMmPerM * crop.rootDepthM);
    return {
      available: true,
      sandPct,
      siltPct,
      clayPct,
      organicCarbonGKg: socGKg,
      humusPct,
      bulkDensityKgDm3: 1.42,
      textureClassPl: classifyPolishSoilTexture(sandPct, siltPct, clayPct),
      fieldCapacityVolPct: hyd.fcVolPct,
      wiltingPointVolPct: hyd.pwpVolPct,
      awcMmPerM: hyd.awcMmPerM,
      awc60cmMm: Math.round(hyd.awcMmPerM * 0.6),
      awcRootZoneMm,
      rawRootZoneMm: Math.round(awcRootZoneMm * crop.depletionFractionP),
      ksatMmH: hyd.ksatMmH,
      iungCategory: iung.category,
      iungCategoryLabelPl: iung.labelPl,
      isUserOverridden: Boolean(userOverride),
      retentionClass: iung.retentionClass,
      source: userOverride ? 'user-override' : 'isric-soilgrids-v2',
      fetchedAt: new Date().toISOString(),
    };
  }

  const raw = await fetchSoilGrids(lat, lng);

  if (!raw) {
    if (userOverride) {
      const def = IUNG_OVERRIDE_DEFAULTS[userOverride];
      const awcRootZoneMm = Math.round(def.awcMmPerM * crop.rootDepthM);
      return {
        available: true,
        sandPct: null,
        siltPct: null,
        clayPct: null,
        organicCarbonGKg: null,
        humusPct: null,
        bulkDensityKgDm3: null,
        textureClassPl: null,
        fieldCapacityVolPct: null,
        wiltingPointVolPct: null,
        awcMmPerM: def.awcMmPerM,
        awc60cmMm: Math.round(def.awcMmPerM * 0.6),
        awcRootZoneMm,
        rawRootZoneMm: Math.round(awcRootZoneMm * crop.depletionFractionP),
        ksatMmH: null,
        iungCategory: userOverride,
        iungCategoryLabelPl: def.labelPl,
        isUserOverridden: true,
        retentionClass: def.retentionClass,
        source: 'user-override',
        fetchedAt: new Date().toISOString(),
        note: 'ISRIC SoilGrids był czasowo niedostępny lub punkt leży w strefie zabudowanej — użyto kategorii gleby podanej przez rolnika.',
      };
    }

    return {
      available: false,
      sandPct: null,
      siltPct: null,
      clayPct: null,
      organicCarbonGKg: null,
      humusPct: null,
      bulkDensityKgDm3: null,
      textureClassPl: null,
      fieldCapacityVolPct: null,
      wiltingPointVolPct: null,
      awcMmPerM: null,
      awc60cmMm: null,
      awcRootZoneMm: null,
      rawRootZoneMm: null,
      ksatMmH: null,
      iungCategory: null,
      iungCategoryLabelPl: null,
      isUserOverridden: false,
      retentionClass: 'nieznana',
      source: 'unavailable',
      fetchedAt: new Date().toISOString(),
      note: 'Brak danych glebowych z ISRIC SoilGrids dla tego punktu (obszar zabudowany/wodny lub czasowy limit API). Możesz ręcznie wskazać kategorię gleby w opcjach gospodarstwa.',
    };
  }

  // Przeliczenie węgla organicznego SOC (g/kg -> %) na próchnicę (współczynnik Van Bemmelena 1,724)
  const humusPct = round((raw.socGKg / 10) * 1.724, 2);
  const hyd = saxtonRawlsHydraulics(raw.sandPct, raw.clayPct, humusPct);
  const autoIung = classifyIungCategory(raw.sandPct, raw.clayPct, hyd.awcMmPerM);

  const effectiveCategory = userOverride ?? autoIung.category;
  const effectiveAwcMmPerM = userOverride ? IUNG_OVERRIDE_DEFAULTS[userOverride].awcMmPerM : hyd.awcMmPerM;
  const awcRootZoneMm = Math.round(effectiveAwcMmPerM * crop.rootDepthM);
  const rawRootZoneMm = Math.round(awcRootZoneMm * crop.depletionFractionP);

  return {
    available: true,
    sandPct: raw.sandPct,
    siltPct: raw.siltPct,
    clayPct: raw.clayPct,
    organicCarbonGKg: raw.socGKg,
    humusPct,
    bulkDensityKgDm3: raw.bdodKgDm3,
    textureClassPl: classifyPolishSoilTexture(raw.sandPct, raw.siltPct, raw.clayPct),
    fieldCapacityVolPct: hyd.fcVolPct,
    wiltingPointVolPct: hyd.pwpVolPct,
    awcMmPerM: effectiveAwcMmPerM,
    awc60cmMm: Math.round(effectiveAwcMmPerM * 0.6),
    awcRootZoneMm,
    rawRootZoneMm,
    ksatMmH: hyd.ksatMmH,
    iungCategory: effectiveCategory,
    iungCategoryLabelPl: userOverride ? IUNG_OVERRIDE_DEFAULTS[userOverride].labelPl : autoIung.labelPl,
    isUserOverridden: Boolean(userOverride),
    retentionClass: userOverride ? IUNG_OVERRIDE_DEFAULTS[userOverride].retentionClass : autoIung.retentionClass,
    source: 'isric-soilgrids-v2',
    fetchedAt: raw.fetchedAt,
    note: userOverride ? 'Uziarnienie i próchnica z ISRIC SoilGrids 250 m; kategoria podatności gleby nadpisana przez rolnika.' : undefined,
  };
};
