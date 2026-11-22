export type LatLng = [number, number];

export type CropId =
  | 'zboza_ozime'
  | 'zboza_jare'
  | 'kukurydza'
  | 'rzepak'
  | 'ziemniak'
  | 'burak_cukrowy'
  | 'straczkowe'
  | 'warzywa_gruntowe'
  | 'sady_drzewa'
  | 'krzewy_owocowe'
  | 'truskawki'
  | 'uzytki_zielone';

export type SoilCategoryIUNG = 1 | 2 | 3 | 4;
export type RiskLevel = 'optymalny' | 'umiarkowany' | 'podwyzszony' | 'wysoki' | 'krytyczny';

export interface CropDefinition {
  id: CropId;
  namePl: string;
  nameEn: string;
  shortDescPl: string;
  examplesPl: string;
  icon: string;
  rootDepthM: number;
  criticalMonths: number[];
  criticalStagesPl: string;
  iungKbwThresholdMm: Record<SoilCategoryIUNG, number>;
  droughtSensitivity: 1 | 2 | 3 | 4 | 5;
}

export interface ExampleParcel {
  id: string;
  labelPl: string;
  regionPl: string;
  descriptionPl: string;
  teryt: string;
  lat: number;
  lng: number;
  suggestedCropId: CropId;
  suggestedHistoricalDate: string;
}

export interface LocationSearchResult {
  label: string;
  sublabel: string;
  lat: number;
  lng: number;
  teryt?: string;
  kind: 'parcel' | 'place';
}

export interface FarmOptions {
  hasIrrigationSystem?: boolean;
  tillageType?: 'orkowy' | 'uproszczony' | 'bezorkowy';
  soilCategoryOverride?: SoilCategoryIUNG | null;
}

export interface ParcelGeometry {
  teryt: string | null;
  parcelNumber: string | null;
  region: string | null;
  commune: string | null;
  county: string | null;
  voivodeship: string | null;
  areaHa: number;
  perimeterM: number;
  centroid: { lat: number; lng: number };
  bbox: [number, number, number, number];
  polygon: LatLng[];
  isApproximateBuffer: boolean;
  source: 'uldk' | 'kieg+uldk' | 'approximate_buffer';
  fetchedAt: string;
}

export interface ElevationProfile {
  available: boolean;
  minM: number | null;
  maxM: number | null;
  meanM: number | null;
  reliefM: number | null;
  meanSlopePct: number | null;
  maxSlopePct: number | null;
  aspectDeg: number | null;
  aspectLabelPl: string | null;
  runoffRisk: 'niski' | 'umiarkowany' | 'wysoki' | 'nieznany';
  lowestPoint: { lat: number; lng: number; elevationM: number } | null;
  highestPoint: { lat: number; lng: number; elevationM: number } | null;
  flowVector: [LatLng, LatLng] | null;
  sampleCount: number;
  source: 'gugik-nmt-1m' | 'open-meteo-dem' | 'unavailable';
  resolutionM: number | null;
  fetchedAt: string;
  note?: string;
}

export interface DailyMeteoRecord {
  date: string;
  tempMean: number;
  tempMax: number;
  tempMin: number;
  precipMm: number;
  et0Mm: number;
  etcMm: number;
  kbwDayMm: number;
  cropBalanceDayMm: number;
}

export interface YearlyDroughtPoint {
  year: number;
  windowStart: string;
  windowEnd: string;
  precip60dMm: number;
  et060dMm: number;
  kbw60dMm: number;
  tempMean60d: number;
  longestDrySpellDays: number;
  heavyRainDays: number;
  exceedsIungThreshold: boolean;
}

export interface MonthlyVulnerability {
  month: number;
  monthLabelPl: string;
  avgPrecipMm: number;
  avgEt0Mm: number;
  avgKbwMm: number;
  droughtYearsCount: number;
  totalYears: number;
  riskScore: number;
}

export interface MeteoAnalysis {
  available: boolean;
  analysisDate: string;
  isHistoricalDate: boolean;
  yearsAnalyzed: number;
  historyStart: string;
  historyEnd: string;
  current: {
    precip30dMm: number;
    et030dMm: number;
    etc30dMm: number;
    kbw30dMm: number;
    cropBalance30dMm: number;
    precip60dMm: number;
    et060dMm: number;
    etc60dMm: number;
    kbw60dMm: number;
    cropBalance60dMm: number;
    tempMean30d: number;
    tempMax30d: number;
    consecutiveDryDays: number;
    longestDrySpell60d: number;
    heavyRainDays60d: number;
    heavyRainSharePct60d: number;
    soilWetnessTopPct: number | null;
    soilWetnessRootPct: number | null;
    kcCurrent: number;
    phenologyStagePl: string;
    isGrowingSeason: boolean;
  };
  anomalies: {
    precip60dNormalMm: number;
    precip60dPctOfNormal: number;
    kbw60dNormalMm: number;
    kbw60dAnomalyMm: number;
    kbw60dZScore: number;
    temp30dNormalC: number;
    temp30dAnomalyC: number;
  };
  historical10y: {
    yearlySeries: YearlyDroughtPoint[];
    monthlyProfile: MonthlyVulnerability[];
    droughtYearsCount: number;
    droughtFrequencyPct: number;
    worstYear: { year: number; kbw60dMm: number } | null;
    peakRiskMonths: number[];
    peakRiskPeriodPl: string;
    avgAnnualPrecipMm: number;
    avgAnnualHeavyRainDays: number;
  };
  daily60d: DailyMeteoRecord[];
  forecast7d: {
    available: boolean;
    totalPrecipMm: number;
    totalEt0Mm: number;
    precipNext48hMm: number;
    days: { date: string; tempMax: number; precipMm: number; et0Mm: number }[];
    note?: string;
  };
  imgwSynop: {
    id: string;
    name: string;
    distanceKm: number;
    measurementDate: string;
    temperatureC: number | null;
    precipitationMm: number | null;
    humidityPct: number | null;
    windSpeedMs: number | null;
  } | null;
  sources: string[];
  fetchedAt: string;
}

export interface SatelliteAnalysis {
  available: boolean;
  sceneId: string | null;
  sceneDate: string | null;
  daysBeforeAnalysis: number | null;
  cloudCoverScenePct: number | null;
  validPixelsPct: number | null;
  pixelCount: number;
  ndvi: { mean: number; min: number; max: number; std: number } | null;
  ndmi: { mean: number; min: number; max: number } | null;
  baseline: {
    available: boolean;
    sceneDate: string | null;
    ndviMean: number | null;
    ndmiMean: number | null;
    ndviDelta: number | null;
    ndmiDelta: number | null;
  };
  vegetationStatus:
    | 'optymalna'
    | 'lekki_stres'
    | 'umiarkowany_stres'
    | 'silny_stres'
    | 'poza_wegetacja_lub_gleba'
    | 'brak_danych';
  interpretationPl: string;
  source: 'sentinel-2-l2a-earth-search' | 'unavailable';
  fetchedAt: string;
  unavailableReason?: string;
}

export interface SoilAnalysis {
  available: boolean;
  sandPct: number | null;
  siltPct: number | null;
  clayPct: number | null;
  organicCarbonGKg: number | null;
  humusPct: number | null;
  bulkDensityKgDm3: number | null;
  textureClassPl: string | null;
  fieldCapacityVolPct: number | null;
  wiltingPointVolPct: number | null;
  awcMmPerM: number | null;
  awc60cmMm: number | null;
  awcRootZoneMm: number | null;
  rawRootZoneMm: number | null;
  ksatMmH: number | null;
  iungCategory: SoilCategoryIUNG | null;
  iungCategoryLabelPl: string | null;
  isUserOverridden: boolean;
  retentionClass: 'bardzo_niska' | 'niska' | 'srednia' | 'dobra' | 'nieznana';
  source: 'isric-soilgrids-v2' | 'user-override' | 'unavailable';
  fetchedAt: string;
  note?: string;
}

export interface NearbyHydroFeature {
  kind: 'ditch' | 'drain' | 'stream' | 'river' | 'canal' | 'pond' | 'wetland' | 'tree_row' | 'wood';
  labelPl: string;
  name: string | null;
  distanceM: number;
  lat: number;
  lng: number;
}

export interface HydrologyAnalysis {
  osmAvailable: boolean;
  imgwAvailable: boolean;
  imgwApplicableToDate: boolean;
  nearestDitchOrDrain: NearbyHydroFeature | null;
  nearestWatercourse: NearbyHydroFeature | null;
  nearestPondOrWetland: NearbyHydroFeature | null;
  waterwaysCount1500m: number;
  ditchesCount1500m: number;
  pondsAndWetlandsCount1000m: number;
  shelterbeltsAndWoodsCount1000m: number;
  featuresForMap: NearbyHydroFeature[];
  nearestImgwStations: {
    id: string;
    station: string;
    river: string;
    voivodeship: string;
    distanceKm: number;
    waterLevelCm: number | null;
    warningLevelCm: number | null;
    alarmLevelCm: number | null;
    flowM3s: number | null;
    measuredAt: string | null;
    statusPl: string;
  }[];
  landscapeRetentionPotential: 'wysoki' | 'umiarkowany' | 'niski' | 'nieznany';
  summaryPl: string;
  fetchedAt: string;
  note?: string;
}

export interface WaterDeficitCause {
  id: string;
  category: 'klimat' | 'gleba' | 'topografia' | 'krajobraz' | 'uprawa';
  titlePl: string;
  severity: 'wysoka' | 'srednia' | 'niska';
  contributionPct: number;
  explanationPl: string;
  evidencePl: string[];
}

export interface Recommendation {
  id: string;
  stage: 'retencja_krajobrazowa' | 'retencja_glebowa' | 'agrotechnika';
  priority: 'wysoki' | 'sredni' | 'uzupelniajacy';
  titlePl: string;
  descriptionPl: string;
  dataJustificationPl: string;
  expectedEffectPl: string;
  horizonPl: 'natychmiast' | 'ten_sezon' | 'wieloletnie';
  mapLocation?: { lat: number; lng: number; labelPl: string } | null;
}

export interface IrrigationAdvice {
  decision: 'niezalecane' | 'wstrzymaj_opad' | 'monitoruj' | 'zalecane';
  decisionLabelPl: string;
  headlinePl: string;
  rationalePl: string;
  recommendedDoseMm: number | null;
  recommendedVolumeM3PerHa: number | null;
  totalParcelVolumeM3: number | null;
  timingWindowPl: string;
  forecastConsiderationPl: string;
  priorityNotePl: string;
  legalNotePl: string;
}

export interface DataSourceProvenance {
  id: string;
  name: string;
  category: 'przestrzenne' | 'meteorologiczne' | 'satelitarne' | 'glebowe' | 'hydrologiczne';
  status: 'live' | 'cached' | 'partial' | 'unavailable';
  statusLabelPl: string;
  fetchedAt: string;
  dataRange: string;
  spatialResolution: string;
  license: string;
  url: string;
  notePl?: string;
}

export interface WaterAnalysisReport {
  id: string;
  createdAt: string;
  analysisDate: string;
  cropId: CropId;
  cropNamePl: string;
  farmOptions: FarmOptions;
  executionTimeMs: number;
  parcel: ParcelGeometry;
  elevation: ElevationProfile;
  meteo: MeteoAnalysis;
  satellite: SatelliteAnalysis;
  soil: SoilAnalysis;
  hydrology: HydrologyAnalysis;
  assessment: {
    currentRiskScore: number;
    currentRiskLevel: RiskLevel;
    currentRiskLabelPl: string;
    historicalRiskScore: number;
    historicalRiskLevel: RiskLevel;
    historicalRiskLabelPl: string;
    iungThresholdUsedMm: number | null;
    kbw60dMm: number | null;
    kbwMarginToThresholdMm: number | null;
    exceedsIungDroughtThreshold: boolean;
    estimatedSoilMoistureReservePct: number | null;
    executiveSummaryPl: string;
    keyFindingsPl: string[];
  };
  causes: WaterDeficitCause[];
  retentionRecommendations: Recommendation[];
  agrotechRecommendations: Recommendation[];
  irrigationAdvice: IrrigationAdvice;
  provenance: DataSourceProvenance[];
  limitations: {
    confidencePct: number;
    confidenceLevel: 'wysoka' | 'srednia' | 'obnizona';
    confidenceLabelPl: string;
    missingDataPl: string[];
    uncertaintyReasonsPl: string[];
    unmodeledFactorsPl: string[];
    scientificBasisPl: string[];
  };
}

export interface SavedReportSummary {
  id: string;
  createdAt: string;
  analysisDate: string;
  teryt: string | null;
  locationLabel: string;
  areaHa: number;
  cropId: CropId;
  cropNamePl: string;
  currentRiskScore: number;
  currentRiskLevel: RiskLevel;
  currentRiskLabelPl: string;
  historicalRiskScore: number;
  confidencePct: number;
  kbw60dMm: number | null;
  iungCategory: SoilCategoryIUNG | null;
}

export const RISK_STYLES: Record<RiskLevel, { badge: string; bar: string; border: string; bgSoft: string; text: string }> = {
  optymalny: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    bar: 'bg-emerald-500',
    border: 'border-emerald-200',
    bgSoft: 'bg-emerald-50/70',
    text: 'text-emerald-700',
  },
  umiarkowany: {
    badge: 'bg-sky-50 text-sky-700 border-sky-200',
    bar: 'bg-sky-500',
    border: 'border-sky-200',
    bgSoft: 'bg-sky-50/70',
    text: 'text-sky-700',
  },
  podwyzszony: {
    badge: 'bg-amber-50 text-amber-800 border-amber-200',
    bar: 'bg-amber-500',
    border: 'border-amber-200',
    bgSoft: 'bg-amber-50/70',
    text: 'text-amber-800',
  },
  wysoki: {
    badge: 'bg-orange-50 text-orange-800 border-orange-200',
    bar: 'bg-orange-500',
    border: 'border-orange-200',
    bgSoft: 'bg-orange-50/70',
    text: 'text-orange-800',
  },
  krytyczny: {
    badge: 'bg-red-50 text-red-700 border-red-200',
    bar: 'bg-red-600',
    border: 'border-red-200',
    bgSoft: 'bg-red-50/70',
    text: 'text-red-700',
  },
};

export const apiError = (err: unknown, fallback = 'Wystąpił błąd komunikacji z serwerem.'): string => {
  const anyErr = err as any;
  return anyErr?.response?.data?.error || anyErr?.message || fallback;
};
