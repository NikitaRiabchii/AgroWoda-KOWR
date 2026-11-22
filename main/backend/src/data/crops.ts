import type { CropDefinition, CropId } from '../types/water';

/**
 * Katalog 12 głównych upraw rolniczych w Polsce zgodny z:
 * - FAO Irrigation and Drainage Paper No. 56 (Allen, Pereira, Smith, 1998/2025) — współczynniki Kc, głębokość korzeni Zr, próg p
 * - IUNG-PIB System Monitoringu Suszy Rolniczej (Doroszewski et al., 2012; susza.iung.pulawy.pl) — progi 60-dniowego KBW dla kategorii gleb I–IV
 */
export const CROPS: CropDefinition[] = [
  {
    id: 'zboza_ozime',
    namePl: 'Zboża ozime',
    nameEn: 'Winter cereals',
    shortDescPl: 'Pszenica ozima, żyto, jęczmień ozimy, pszenżyto ozime',
    examplesPl: 'Pszenica ozima, pszenżyto, żyto, jęczmień ozimy',
    icon: 'wheat',
    kc: { ini: 0.4, mid: 1.15, end: 0.35, dormant: 0.3 },
    phenology: { startDoy: 80, devEndDoy: 125, midEndDoy: 185, harvestDoy: 215, isWinterCrop: true },
    rootDepthM: 1.2,
    depletionFractionP: 0.55,
    criticalMonths: [4, 5, 6],
    criticalStagesPl: 'Strzelanie w źdźbło, kłoszenie i nalewanie ziarna (kwiecień–czerwiec)',
    iungKbwThresholdMm: { 1: -140, 2: -170, 3: -210, 4: -250 },
    expectedPeakNdvi: [0.68, 0.88],
    expectedPeakNdmi: [0.18, 0.45],
    droughtSensitivity: 3,
    recommendedCoverCropsPl: ['gorczyca biała', 'facelia błękitna', 'łubin wąskolistny', 'mieszanka z wyką'],
    droughtAlternativesPl: 'Żyto ozime, pszenżyto ozime lub odmiany pszenicy o podwyższonej tolerancji na suszę i wczesnym kłoszeniu.',
  },
  {
    id: 'zboza_jare',
    namePl: 'Zboża jare',
    nameEn: 'Spring cereals',
    shortDescPl: 'Jęczmień jary, pszenica jara, owies, mieszanki zbożowe',
    examplesPl: 'Jęczmień jary, owies, pszenica jara',
    icon: 'sprout',
    kc: { ini: 0.35, mid: 1.15, end: 0.3, dormant: 0.25 },
    phenology: { startDoy: 95, devEndDoy: 135, midEndDoy: 190, harvestDoy: 220 },
    rootDepthM: 0.9,
    depletionFractionP: 0.5,
    criticalMonths: [5, 6],
    criticalStagesPl: 'Krzewienie, strzelanie w źdźbło i kłoszenie (maj–czerwiec)',
    iungKbwThresholdMm: { 1: -120, 2: -150, 3: -190, 4: -230 },
    expectedPeakNdvi: [0.62, 0.84],
    expectedPeakNdmi: [0.15, 0.42],
    droughtSensitivity: 4,
    recommendedCoverCropsPl: ['facelia błękitna', 'rzodkiew oleista', 'wyka ozima z żytem'],
    droughtAlternativesPl: 'Zastąpienie części zbóż jarych formami ozimymi (lepiej wykorzystującymi zapasy wody pozimowej) lub prosowatymi.',
  },
  {
    id: 'kukurydza',
    namePl: 'Kukurydza (ziarno / kiszonka)',
    nameEn: 'Maize (grain / silage)',
    shortDescPl: 'Wysokie zapotrzebowanie wodne w lipcu i sierpniu (kwitnienie)',
    examplesPl: 'Kukurydza na ziarno, kukurydza kiszonkowa',
    icon: 'corn',
    kc: { ini: 0.3, mid: 1.2, end: 0.55, dormant: 0.25 },
    phenology: { startDoy: 118, devEndDoy: 165, midEndDoy: 235, harvestDoy: 280 },
    rootDepthM: 1.1,
    depletionFractionP: 0.55,
    criticalMonths: [6, 7, 8],
    criticalStagesPl: 'Wiechowanie, kwitnienie i nalewanie ziarna (koniec czerwca–sierpień)',
    iungKbwThresholdMm: { 1: -140, 2: -170, 3: -210, 4: -250 },
    expectedPeakNdvi: [0.7, 0.9],
    expectedPeakNdmi: [0.22, 0.48],
    droughtSensitivity: 4,
    recommendedCoverCropsPl: ['żyto ozime (międzyplon ozimy)', 'wyka ozima', 'rzodkiew oleista'],
    droughtAlternativesPl: 'Odmiany o niższym FAO (wcześniejsze), sorgo na glebach bardzo lekkich lub uprawa pasowa (strip-till).',
  },
  {
    id: 'rzepak',
    namePl: 'Rzepak i rzepik',
    nameEn: 'Oilseed rape',
    shortDescPl: 'Głęboki korzeń palowy, wrażliwy na suszę przy wschodach (sierpień) i kwitnieniu',
    examplesPl: 'Rzepak ozimy, rzepak jary',
    icon: 'flower',
    kc: { ini: 0.45, mid: 1.15, end: 0.35, dormant: 0.35 },
    phenology: { startDoy: 75, devEndDoy: 115, midEndDoy: 175, harvestDoy: 205, isWinterCrop: true },
    rootDepthM: 1.3,
    depletionFractionP: 0.55,
    criticalMonths: [4, 5, 8],
    criticalStagesPl: 'Kwitnienie, zawiązywanie łuszczyn (kwiecień–maj) oraz wschody po siewie (sierpień)',
    iungKbwThresholdMm: { 1: -140, 2: -170, 3: -210, 4: -250 },
    expectedPeakNdvi: [0.68, 0.88],
    expectedPeakNdmi: [0.2, 0.46],
    droughtSensitivity: 3,
    recommendedCoverCropsPl: ['bobik/groch w płodozmianie', 'facelia', 'gryka (przedplon bez kapustowatych)'],
    droughtAlternativesPl: 'Siew bezpośredni/strip-till po żniwach ograniczający przesuszenie łoża siewnego w sierpniu.',
  },
  {
    id: 'ziemniak',
    namePl: 'Ziemniak',
    nameEn: 'Potato',
    shortDescPl: 'Bardzo płytki system korzeniowy — wysoka wrażliwość na niedobory wody',
    examplesPl: 'Ziemniak jadalny, skrobiowy, wczesny',
    icon: 'potato',
    kc: { ini: 0.45, mid: 1.15, end: 0.7, dormant: 0.25 },
    phenology: { startDoy: 110, devEndDoy: 150, midEndDoy: 225, harvestDoy: 265 },
    rootDepthM: 0.55,
    depletionFractionP: 0.35,
    criticalMonths: [6, 7, 8],
    criticalStagesPl: 'Tuberyzacja, kwitnienie i intensywny przyrost bulw (czerwiec–sierpień)',
    iungKbwThresholdMm: { 1: -115, 2: -145, 3: -185, 4: -225 },
    expectedPeakNdvi: [0.65, 0.86],
    expectedPeakNdmi: [0.2, 0.45],
    droughtSensitivity: 5,
    recommendedCoverCropsPl: ['facelia błękitna', 'owies szorstki', 'łubin żółty', 'seradela'],
    droughtAlternativesPl: 'Odmiany wczesne wykorzystujące wodę wiosenną; ściółkowanie międzyrzędzi; precyzyjne nawadnianie kropelkowe/deszczowniane.',
  },
  {
    id: 'burak_cukrowy',
    namePl: 'Burak cukrowy',
    nameEn: 'Sugar beet',
    shortDescPl: 'Długi okres wegetacji i wysokie zapotrzebowanie wodne latem',
    examplesPl: 'Burak cukrowy, burak pastewny',
    icon: 'carrot',
    kc: { ini: 0.35, mid: 1.2, end: 0.7, dormant: 0.25 },
    phenology: { startDoy: 100, devEndDoy: 155, midEndDoy: 255, harvestDoy: 295 },
    rootDepthM: 1.1,
    depletionFractionP: 0.55,
    criticalMonths: [6, 7, 8],
    criticalStagesPl: 'Zwieranie międzyrzędzi i przyrost masy korzenia (czerwiec–sierpień)',
    iungKbwThresholdMm: { 1: -150, 2: -180, 3: -220, 4: -260 },
    expectedPeakNdvi: [0.72, 0.9],
    expectedPeakNdmi: [0.25, 0.5],
    droughtSensitivity: 3,
    recommendedCoverCropsPl: ['gorczyca mątwikobójcza', 'rzodkiew oleista', 'facelia (mulcz mrozoodporny)'],
    droughtAlternativesPl: 'Siew w mulcz z międzyplonu wymarzającego (ogranicza zaskorupianie i parowanie w kwietniu–maju).',
  },
  {
    id: 'straczkowe',
    namePl: 'Rośliny strączkowe',
    nameEn: 'Legumes / Pulses',
    shortDescPl: 'Groch, bobik, łubin, soja — wrażliwe podczas kwitnienia i zawiązywania strąków',
    examplesPl: 'Groch siewny, bobik, łubin wąskolistny/żółty, soja',
    icon: 'bean',
    kc: { ini: 0.4, mid: 1.15, end: 0.4, dormant: 0.25 },
    phenology: { startDoy: 95, devEndDoy: 135, midEndDoy: 195, harvestDoy: 230 },
    rootDepthM: 0.85,
    depletionFractionP: 0.45,
    criticalMonths: [5, 6, 7],
    criticalStagesPl: 'Kwitnienie i zawiązywanie strąków (maj–lipiec)',
    iungKbwThresholdMm: { 1: -125, 2: -155, 3: -195, 4: -235 },
    expectedPeakNdvi: [0.65, 0.86],
    expectedPeakNdmi: [0.18, 0.44],
    droughtSensitivity: 4,
    recommendedCoverCropsPl: ['gorczyca biała', 'facelia', 'gryka (bez bobowatych po sobie)'],
    droughtAlternativesPl: 'Na glebach lekkich preferowany łubin żółty lub wąskolistny zamiast bobiku; wczesny termin siewu.',
  },
  {
    id: 'warzywa_gruntowe',
    namePl: 'Warzywa gruntowe',
    nameEn: 'Field vegetables',
    shortDescPl: 'Kapusta, marchew, cebula, ogórek, pomidor gruntowy — bardzo wrażliwe na suszę',
    examplesPl: 'Marchew, cebula, kapusta, kalafior, ogórek, burak ćwikłowy',
    icon: 'salad',
    kc: { ini: 0.5, mid: 1.05, end: 0.8, dormant: 0.25 },
    phenology: { startDoy: 105, devEndDoy: 145, midEndDoy: 235, harvestDoy: 275 },
    rootDepthM: 0.5,
    depletionFractionP: 0.3,
    criticalMonths: [5, 6, 7, 8],
    criticalStagesPl: 'Wschody, przyrost części jadalnych i zawiązywanie owoców (maj–sierpień)',
    iungKbwThresholdMm: { 1: -105, 2: -135, 3: -175, 4: -215 },
    expectedPeakNdvi: [0.58, 0.84],
    expectedPeakNdmi: [0.18, 0.46],
    droughtSensitivity: 5,
    recommendedCoverCropsPl: ['facelia', 'wyka siewna', 'aksamitka/gorczyca fitosanitarna'],
    droughtAlternativesPl: 'Ściółkowanie międzyrzędzi, mikronawadnianie (linie kroplujące) połączone ze zbiornikiem retencyjnym wody opadowej.',
  },
  {
    id: 'sady_drzewa',
    namePl: 'Drzewa owocowe (sady)',
    nameEn: 'Orchards (fruit trees)',
    shortDescPl: 'Jabłoń, grusza, śliwa, wiśnia, czereśnia — uprawa wieloletnia',
    examplesPl: 'Jabłonie, grusze, wiśnie, czereśnie, śliwy',
    icon: 'trees',
    kc: { ini: 0.5, mid: 1.0, end: 0.7, dormant: 0.35 },
    phenology: { startDoy: 95, devEndDoy: 145, midEndDoy: 245, harvestDoy: 290, isPerennial: true },
    rootDepthM: 1.2,
    depletionFractionP: 0.5,
    criticalMonths: [5, 6, 7, 8],
    criticalStagesPl: 'Zawiązywanie i dorastanie owoców oraz zakładanie pąków kwiatowych (maj–sierpień)',
    iungKbwThresholdMm: { 1: -145, 2: -175, 3: -215, 4: -255 },
    expectedPeakNdvi: [0.65, 0.85],
    expectedPeakNdmi: [0.18, 0.42],
    droughtSensitivity: 3,
    recommendedCoverCropsPl: ['murawa w międzyrzędziach (kostrzewa/koniczyna biała)', 'ściółkowanie rzędów zrębkami/słomą'],
    droughtAlternativesPl: 'Ściółkowanie pasów herbicydowych korą/zrębkami + zbiornik retencyjny do fertygacji kropelkowej.',
  },
  {
    id: 'krzewy_owocowe',
    namePl: 'Krzewy owocowe',
    nameEn: 'Berry bushes',
    shortDescPl: 'Malina, porzeczka, borówka, aronia — płytki system korzeniowy',
    examplesPl: 'Porzeczka, malina, borówka wysoka, agrest, aronia',
    icon: 'cherry',
    kc: { ini: 0.45, mid: 1.05, end: 0.65, dormant: 0.3 },
    phenology: { startDoy: 95, devEndDoy: 140, midEndDoy: 225, harvestDoy: 265, isPerennial: true },
    rootDepthM: 0.6,
    depletionFractionP: 0.4,
    criticalMonths: [5, 6, 7],
    criticalStagesPl: 'Kwitnienie i dojrzewanie owoców (maj–lipiec)',
    iungKbwThresholdMm: { 1: -115, 2: -145, 3: -185, 4: -225 },
    expectedPeakNdvi: [0.62, 0.84],
    expectedPeakNdmi: [0.18, 0.44],
    droughtSensitivity: 4,
    recommendedCoverCropsPl: ['ściółka z trocin/zrębków w rzędach', 'niska murawa z koniczyną w międzyrzędziach'],
    droughtAlternativesPl: 'Głębokie ściółkowanie rzędów (ogranicza parowanie o 30–50%) i precyzyjna linia kroplująca.',
  },
  {
    id: 'truskawki',
    namePl: 'Truskawka',
    nameEn: 'Strawberry',
    shortDescPl: 'Bardzo płytkie korzenie (20–35 cm) — ekstremalna wrażliwość na suszę powierzchniową',
    examplesPl: 'Truskawka deserowa i przemysłowa',
    icon: 'strawberry',
    kc: { ini: 0.45, mid: 0.9, end: 0.7, dormant: 0.3 },
    phenology: { startDoy: 90, devEndDoy: 130, midEndDoy: 185, harvestDoy: 240, isPerennial: true },
    rootDepthM: 0.35,
    depletionFractionP: 0.25,
    criticalMonths: [5, 6, 7],
    criticalStagesPl: 'Kwitnienie, dorastanie owoców i wiązanie pąków po zbiorze (maj–lipiec)',
    iungKbwThresholdMm: { 1: -100, 2: -130, 3: -170, 4: -210 },
    expectedPeakNdvi: [0.55, 0.8],
    expectedPeakNdmi: [0.16, 0.4],
    droughtSensitivity: 5,
    recommendedCoverCropsPl: ['ściółkowanie słomą międzyrzędzi', 'przedplon fitosanitarny z gryki/aksamitki'],
    droughtAlternativesPl: 'Ściółkowanie słomą oraz nawadnianie kropelkowe (nie deszczowanie w trakcie owocowania).',
  },
  {
    id: 'uzytki_zielone',
    namePl: 'Łąki, pastwiska i motylkowate (TUZ)',
    nameEn: 'Grasslands & forage',
    shortDescPl: 'Trwałe użytki zielone, koniczyna, lucerna — wysoka zdolność retencyjna gleby',
    examplesPl: 'Łąki kośne, pastwiska, mieszanki traw z koniczyną, lucerna',
    icon: 'leaf',
    kc: { ini: 0.75, mid: 1.0, end: 0.85, dormant: 0.45 },
    phenology: { startDoy: 80, devEndDoy: 115, midEndDoy: 260, harvestDoy: 300, isPerennial: true },
    rootDepthM: 0.85,
    depletionFractionP: 0.5,
    criticalMonths: [5, 6, 7, 8],
    criticalStagesPl: 'Odrost I, II i III pokosu (maj–sierpień)',
    iungKbwThresholdMm: { 1: -130, 2: -160, 3: -200, 4: -240 },
    expectedPeakNdvi: [0.68, 0.88],
    expectedPeakNdmi: [0.2, 0.45],
    droughtSensitivity: 3,
    recommendedCoverCropsPl: ['podsiew traw głębokokorzeniących (kupkówka, kostrzewa trzcinowa)', 'lucerna/koniczyna czerwona'],
    droughtAlternativesPl: 'Zwiększenie udziału gatunków odpornych na suszę (lucerna, kupkówka, esparceta) i wyższe koszenie (7–8 cm) ograniczające przesychanie darni.',
  },
];

export const CROP_MAP: Record<CropId, CropDefinition> = CROPS.reduce(
  (acc, c) => {
    acc[c.id] = c;
    return acc;
  },
  {} as Record<CropId, CropDefinition>
);

export const getCrop = (id: string): CropDefinition | null => (id in CROP_MAP ? CROP_MAP[id as CropId] : null);

/** Dzień roku (1..366) z daty YYYY-MM-DD */
export const dayOfYear = (dateStr: string): number => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const start = new Date(Date.UTC(y, 0, 1));
  return Math.floor((dt.getTime() - start.getTime()) / 86_400_000) + 1;
};

/**
 * Oblicza współczynnik uprawowy FAO-56 Kc oraz opis fazy fenologicznej dla danej uprawy i dnia roku (DOY).
 */
export const computeCropKcAndStage = (
  crop: CropDefinition,
  doy: number
): { kc: number; stagePl: string; isGrowingSeason: boolean; isPeakStage: boolean } => {
  const p = crop.phenology;

  if (doy < p.startDoy) {
    return {
      kc: crop.kc.dormant,
      stagePl: p.isWinterCrop
        ? 'Spoczynek zimowy / przedwiośnie'
        : p.isPerennial
          ? 'Spoczynek zimowy roślinności wieloletniej'
          : 'Okres przed siewem / pole nieobsiane',
      isGrowingSeason: false,
      isPeakStage: false,
    };
  }

  if (doy < p.devEndDoy) {
    const frac = (doy - p.startDoy) / Math.max(1, p.devEndDoy - p.startDoy);
    const kc = crop.kc.ini + frac * (crop.kc.mid - crop.kc.ini);
    return {
      kc: Math.round(kc * 100) / 100,
      stagePl: p.isWinterCrop ? 'Ruszenie wegetacji i intensywny wzrost wiosenny' : 'Wschody i intensywny rozwój biomasy',
      isGrowingSeason: true,
      isPeakStage: frac > 0.65,
    };
  }

  if (doy <= p.midEndDoy) {
    return {
      kc: crop.kc.mid,
      stagePl: 'Pełnia wegetacji — krytyczne zapotrzebowanie na wodę',
      isGrowingSeason: true,
      isPeakStage: true,
    };
  }

  if (doy <= p.harvestDoy) {
    const frac = (doy - p.midEndDoy) / Math.max(1, p.harvestDoy - p.midEndDoy);
    const kc = crop.kc.mid - frac * (crop.kc.mid - crop.kc.end);
    return {
      kc: Math.round(kc * 100) / 100,
      stagePl: 'Dojrzewanie i zbiór',
      isGrowingSeason: true,
      isPeakStage: false,
    };
  }

  // Po zbiorze / jesień
  if (p.isWinterCrop && doy >= 255 && doy <= 320) {
    return {
      kc: crop.kc.ini,
      stagePl: 'Siew jesienny i wschody ozimin',
      isGrowingSeason: true,
      isPeakStage: false,
    };
  }

  return {
    kc: crop.kc.dormant,
    stagePl: p.isPerennial ? 'Okres posezonowy / przygotowanie do spoczynku' : 'Okres pożniwny (ściernisko / międzyplon / uprawa pożniwna)',
    isGrowingSeason: false,
    isPeakStage: false,
  };
};
