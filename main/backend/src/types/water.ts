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

export interface CropDefinition {
  id: CropId;
  namePl: string;
  nameEn: string;
  shortDescPl: string;
  examplesPl: string;
  icon: string;
  /** FAO-56 współczynniki uprawowe Kc (Allen et al., 1998/2025) */
  kc: { ini: number; mid: number; end: number; dormant: number };
  /** Fazy fenologiczne (dzień roku DOY dla warunków Polski) */
  phenology: {
    startDoy: number;
    devEndDoy: number;
    midEndDoy: number;
    harvestDoy: number;
    isPerennial?: boolean;
    isWinterCrop?: boolean;
  };
  /** Efektywna głębokość systemu korzeniowego Zr (m) wg FAO-56 */
  rootDepthM: number;
  /** Współczynnik dopuszczalnego wyczerpania wody łatwo dostępnej p (FAO-56) */
  depletionFractionP: number;
  /** Krytyczne okresy zapotrzebowania na wodę (miesiące 1-12) */
  criticalMonths: number[];
  criticalStagesPl: string;
  /**
   * Krytyczne progi 60-dniowego Klimatycznego Bilansu Wodnego KBW (mm) wg IUNG-PIB
   * (System Monitoringu Suszy Rolniczej) dla kategorii gleb I–IV w okresie krytycznym.
   */
  iungKbwThresholdMm: Record<SoilCategoryIUNG, number>;
  /** Oczekiwany zakres NDVI dla zdrowej uprawy w szczycie wegetacji (mid-season) */
  expectedPeakNdvi: [number, number];
  /** Oczekiwany zakres NDMI dla dobrze uwilgotnionej uprawy w szczycie wegetacji */
  expectedPeakNdmi: [number, number];
  /** Wrażliwość na suszę 1-5 */
  droughtSensitivity: 1 | 2 | 3 | 4 | 5;
  /** Zalecane międzyplony / alternatywy */
  recommendedCoverCropsPl: string[];
  droughtAlternativesPl: string;
}

export interface FarmOptions {
  hasIrrigationSystem?: boolean;
  tillageType?: 'orkowy' | 'uproszczony' | 'bezorkowy';
  soilCategoryOverride?: SoilCategoryIUNG | null;
}

export interface AnalyzeRequest {
  parcelId?: string;
  lat?: number;
  lng?: number;
  cropId: CropId;
  /** YYYY-MM-DD (dziś lub data historyczna z ostatnich 10 lat) */
  analysisDate: string;
  options?: FarmOptions;
  save?: boolean;
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
  bbox: [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]
  polygon: LatLng[];
  isApproximateBuffer: boolean;
  source: 'uldk' | 'kieg+uldk' | 'approximate_buffer';
  fetchedAt: string;
}

export interface ElevationPoint {
  lat: number;
  lng: number;
  elevationM: number;
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
  lowestPoint: ElevationPoint | null;
  highestPoint: ElevationPoint | null;
  /** Wektor kierunku spływu powierzchniowego [od, do] do wizualizacji na mapie */
  flowVector: [LatLng, LatLng] | null;
  sampleCount: number;
  source: 'gugik-nmt-1m' | 'open-meteo-dem' | 'unavailable';
  resolutionM: number | null;
  fetchedAt: string;
  note?: string;
}

export interface DailyMeteoRecord {
  date: string; // YYYY-MM-DD
  tempMean: number;
  tempMax: number;
  tempMin: number;
  precipMm: number;
  et0Mm: number;
  etcMm: number;
  kbwDayMm: number; // precip - et0
  cropBalanceDayMm: number; // precip - etc
  soilWetnessTop?: number | null; // 0..1
  soilWetnessRoot?: number | null; // 0..1
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
  month: number; // 3..10
  monthLabelPl: string;
  avgPrecipMm: number;
  avgEt0Mm: number;
  avgKbwMm: number;
  droughtYearsCount: number;
  totalYears: number;
  riskScore: number; // 0..100
}

export interface ForecastDay {
  date: string;
  tempMax: number;
  precipMm: number;
  et0Mm: number;
}

export interface ImgwSynopStation {
  id: string;
  name: string;
  distanceKm: number;
  measurementDate: string;
  temperatureC: number | null;
  precipitationMm: number | null;
  humidityPct: number | null;
  windSpeedMs: number | null;
}

export interface MeteoAnalysis {
  available: boolean;
  analysisDate: string;
  isHistoricalDate: boolean;
  yearsAnalyzed: number;
  historyStart: string;
  historyEnd: string;
  /** Bieżący stan (okna kończące się na analysisDate) */
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
    heavyRainDays60d: number; // > 20 mm/d
    heavyRainSharePct60d: number;
    soilWetnessTopPct: number | null;
    soilWetnessRootPct: number | null;
    kcCurrent: number;
    phenologyStagePl: string;
    isGrowingSeason: boolean;
  };
  /** Anomalie względem 10-letniej normy dla tego samego okna kalendarzowego */
  anomalies: {
    precip60dNormalMm: number;
    precip60dPctOfNormal: number;
    kbw60dNormalMm: number;
    kbw60dAnomalyMm: number;
    kbw60dZScore: number;
    temp30dNormalC: number;
    temp30dAnomalyC: number;
  };
  /** Podatność wieloletnia (10 lat) */
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
  /** Ostatnie 60 dni do wykresu */
  daily60d: DailyMeteoRecord[];
  /** Prognoza 7-dniowa (tylko dla dat bieżących) */
  forecast7d: {
    available: boolean;
    totalPrecipMm: number;
    totalEt0Mm: number;
    precipNext48hMm: number;
    days: ForecastDay[];
    note?: string;
  };
  imgwSynop: ImgwSynopStation | null;
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
  /** Porównanie z tym samym okresem z poprzedniego roku (lub 2 lat wcześniej) */
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
  /** Saxton & Rawls (2006) parametry wodne */
  fieldCapacityVolPct: number | null;
  wiltingPointVolPct: number | null;
  awcMmPerM: number | null;
  awc60cmMm: number | null;
  awcRootZoneMm: number | null;
  rawRootZoneMm: number | null; // Readily Available Water = p * TAW
  ksatMmH: number | null; // Przepuszczalność wodna
  /** Kategoria podatności gleby na suszę wg IUNG-PIB (I–IV) */
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

export interface ImgwHydroStation {
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
  statusPl: 'niski' | 'sredni' | 'wysoki' | 'ostrzegawczy' | 'alarmowy' | 'brak_danych';
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
  nearestImgwStations: ImgwHydroStation[];
  landscapeRetentionPotential: 'wysoki' | 'umiarkowany' | 'niski' | 'nieznany';
  summaryPl: string;
  fetchedAt: string;
  note?: string;
}

export type RiskLevel = 'optymalny' | 'umiarkowany' | 'podwyzszony' | 'wysoki' | 'krytyczny';

export interface WaterStatusAssessment {
  currentRiskScore: number; // 0..100
  currentRiskLevel: RiskLevel;
  currentRiskLabelPl: string;
  historicalRiskScore: number; // 0..100
  historicalRiskLevel: RiskLevel;
  historicalRiskLabelPl: string;
  iungThresholdUsedMm: number | null;
  kbw60dMm: number | null;
  kbwMarginToThresholdMm: number | null; // < 0 oznacza przekroczenie progu suszy IUNG
  exceedsIungDroughtThreshold: boolean;
  estimatedSoilMoistureReservePct: number | null;
  executiveSummaryPl: string;
  keyFindingsPl: string[];
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

export interface ReportLimitations {
  confidencePct: number;
  confidenceLevel: 'wysoka' | 'srednia' | 'obnizona';
  confidenceLabelPl: string;
  missingDataPl: string[];
  uncertaintyReasonsPl: string[];
  unmodeledFactorsPl: string[];
  scientificBasisPl: string[];
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
  /** Sekwencja KOWR: 1 → 2 → 3 → 4 → 5 → 6 */
  assessment: WaterStatusAssessment;
  causes: WaterDeficitCause[];
  retentionRecommendations: Recommendation[];
  agrotechRecommendations: Recommendation[];
  irrigationAdvice: IrrigationAdvice;
  provenance: DataSourceProvenance[];
  limitations: ReportLimitations;
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
