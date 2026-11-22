import crypto from 'crypto';
import type { Request, Response } from 'express';
import { CROPS, getCrop } from '../data/crops';
import type { AnalyzeRequest, FarmOptions, SoilCategoryIUNG, WaterAnalysisReport } from '../types/water';
import { EXAMPLE_PARCELS, parseCoordinates, resolveParcelByCoords, resolveParcelById, searchPolishLocation } from '../services/parcelService';
import { analyzeElevation } from '../services/elevationService';
import { analyzeSoil } from '../services/soilService';
import { analyzeMeteo } from '../services/meteoService';
import { analyzeSatellite } from '../services/satelliteService';
import { analyzeHydrology } from '../services/hydrologyService';
import {
  buildIrrigationAdvice,
  buildProvenanceAndLimitations,
  buildRecommendations,
  buildWaterAssessment,
  identifyCauses,
} from '../services/waterEngine';
import { buildWaterReportWorkbook } from '../services/excelReportService';
import { deleteReportById, getReportById, listReports, saveReport } from '../services/storageService';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isValidAnalysisDate = (dateStr: string): { ok: boolean; normalized?: string; error?: string } => {
  if (!ISO_DATE_RE.test(dateStr)) {
    return { ok: false, error: 'Nieprawidłowy format daty analizy. Użyj formatu RRRR-MM-DD (np. 2025-06-15).' };
  }
  const dt = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== dateStr) {
    return { ok: false, error: 'Podana data kalendarzowa nie istnieje.' };
  }
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);
  const minYear = today.getUTCFullYear() - 10;
  const minIso = `${minYear}-01-01`;
  if (dateStr > todayIso) {
    return { ok: false, error: `Data analizy nie może być z przyszłości (maks. ${todayIso}).` };
  }
  if (dateStr < minIso) {
    return { ok: false, error: `Analiza obsługuje daty z ostatnich 10 lat (od ${minIso}).` };
  }
  return { ok: true, normalized: dateStr };
};

export const getCropsHandler = (_req: Request, res: Response) => {
  res.json({ crops: CROPS });
};

export const getExampleParcelsHandler = (_req: Request, res: Response) => {
  res.json({ examples: EXAMPLE_PARCELS });
};

export const searchLocationHandler = async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim();
  if (q.length < 2 || q.length > 120) {
    res.status(400).json({ error: 'Podaj frazę wyszukiwania (od 2 do 120 znaków).' });
    return;
  }
  const parsedCoords = parseCoordinates(q);
  if (parsedCoords && !parsedCoords.inPoland) {
    res.status(400).json({
      error: 'Podane współrzędne leżą poza obszarem Polski (48.5–55.2°N, 13.8–24.5°E).',
    });
    return;
  }
  try {
    const results = await searchPolishLocation(q);
    res.json({ results });
  } catch {
    res.status(502).json({ error: 'Wyszukiwarka lokalizacji jest chwilowo niedostępna.' });
  }
};

export const lookupParcelHandler = async (req: Request, res: Response) => {
  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  const lat = req.query.lat !== undefined ? Number(req.query.lat) : NaN;
  const lng = req.query.lng !== undefined ? Number(req.query.lng) : NaN;

  try {
    if (id) {
      if (id.length > 80) {
        res.status(400).json({ error: 'Identyfikator działki jest zbyt długi.' });
        return;
      }
      const parcel = await resolveParcelById(id);
      if (!parcel) {
        res.status(404).json({
          error: `Nie znaleziono działki o identyfikatorze „${id}” w usłudze ULDK GUGiK. Sprawdź format (np. 141201_1.0001.6509) lub wskaż działkę bezpośrednio na mapie.`,
        });
        return;
      }
      res.json({ parcel });
      return;
    }

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      if (lat < 48.5 || lat > 55.2 || lng < 13.8 || lng > 24.5) {
        res.status(400).json({ error: 'Wskazane współrzędne leżą poza obszarem Polski.' });
        return;
      }
      const parcel = await resolveParcelByCoords(lat, lng);
      res.json({ parcel });
      return;
    }

    res.status(400).json({ error: 'Podaj parametr id (numer TERYT działki) lub współrzędne lat i lng.' });
  } catch (err: any) {
    console.error('Błąd wyszukiwania działki:', err);
    res.status(500).json({ error: 'Wystąpił błąd podczas wyszukiwania działki ewidencyjnej.' });
  }
};

/**
 * Główny endpoint analizy działki — orkiestruje równoległe pobranie 5 kategorii danych
 * i wykonuje ścisłą 5-etapową procedurę decyzyjną KOWR w czasie docelowo < 10–15 s.
 */
export const analyzeParcelHandler = async (req: Request, res: Response) => {
  const t0 = Date.now();
  const body = req.body as Partial<AnalyzeRequest>;

  const crop = getCrop(String(body.cropId ?? ''));
  if (!crop) {
    res.status(400).json({ error: 'Wybierz prawidłową uprawę z katalogu upraw.' });
    return;
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const rawDate = body.analysisDate ? String(body.analysisDate).trim() : todayIso;
  const dateCheck = isValidAnalysisDate(rawDate);
  if (!dateCheck.ok || !dateCheck.normalized) {
    res.status(400).json({ error: dateCheck.error });
    return;
  }
  const analysisDate = dateCheck.normalized;

  const parcelId = typeof body.parcelId === 'string' ? body.parcelId.trim() : '';
  const lat = body.lat !== undefined ? Number(body.lat) : NaN;
  const lng = body.lng !== undefined ? Number(body.lng) : NaN;

  if (!parcelId && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
    res.status(400).json({ error: 'Wskaż identyfikator działki ewidencyjnej (TERYT) lub wybierz punkt na mapie.' });
    return;
  }

  if (Number.isFinite(lat) && Number.isFinite(lng) && (lat < 48.5 || lat > 55.2 || lng < 13.8 || lng > 24.5)) {
    res.status(400).json({ error: 'Analiza dotyczy działek ewidencyjnych z obszaru Polski (48.5–55.2°N, 13.8–24.5°E).' });
    return;
  }

  const options: FarmOptions = {
    hasIrrigationSystem: Boolean(body.options?.hasIrrigationSystem),
    tillageType:
      body.options?.tillageType && ['orkowy', 'uproszczony', 'bezorkowy'].includes(body.options.tillageType)
        ? body.options.tillageType
        : undefined,
    soilCategoryOverride:
      body.options?.soilCategoryOverride && [1, 2, 3, 4].includes(Number(body.options.soilCategoryOverride))
        ? (Number(body.options.soilCategoryOverride) as SoilCategoryIUNG)
        : null,
  };

  try {
    // 1. Rozpoznanie geometrii działki (ULDK / KIEG)
    let parcel = parcelId ? await resolveParcelById(parcelId) : null;
    if (!parcel && Number.isFinite(lat) && Number.isFinite(lng)) {
      parcel = await resolveParcelByCoords(lat, lng);
    }
    if (!parcel) {
      res.status(404).json({
        error: `Nie znaleziono działki o identyfikatorze „${parcelId}” w bazie ULDK GUGiK. Sprawdź poprawność numeru TERYT (np. 141201_1.0001.6509) lub kliknij działkę na mapie.`,
      });
      return;
    }

    const { lat: cLat, lng: cLng } = parcel.centroid;
    const diffDaysFromToday = Math.round(
      (new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${analysisDate}T00:00:00Z`).getTime()) / 86_400_000
    );
    const isHistoricalDate = diffDaysFromToday > 3;

    // 2. Równoległe pobranie danych: NMT + Gleba + Satelita Sentinel-2 + Hydrologia + 10-letnia Meteorologia
    // Najpierw NMT i gleba są szybkie, ale żeby zmieścić się pewnie < 10-15s, uruchamiamy WSZYSTKO równolegle!
    // (Próg IUNG do zliczania lat suszy w meteo zaktualizujemy po poznaniu kategorii gleby z SoilGrids)
    const [elevation, soil, satellite, hydrology, meteoRaw] = await Promise.all([
      analyzeElevation(parcel),
      analyzeSoil(cLat, cLng, crop, options.soilCategoryOverride),
      analyzeSatellite(parcel, analysisDate, crop),
      analyzeHydrology(cLat, cLng, isHistoricalDate),
      analyzeMeteo({
        lat: cLat,
        lng: cLng,
        elevM: 120,
        analysisDate,
        crop,
        iungSoilCategory: options.soilCategoryOverride ?? 2,
      }),
    ]);

    // Jeśli poznaliśmy dokładną kategorię gleby IUNG inną niż domyślna 2, przeliczamy progi w serii 10-letniej
    let meteo = meteoRaw;
    if (meteo.available && soil.iungCategory && soil.iungCategory !== (options.soilCategoryOverride ?? 2)) {
      const iungThr = crop.iungKbwThresholdMm[soil.iungCategory];
      const yearlySeries = meteo.historical10y.yearlySeries.map((y) => ({
        ...y,
        exceedsIungThreshold: y.kbw60dMm <= iungThr,
      }));
      const droughtYearsCount = yearlySeries.filter((y) => y.exceedsIungThreshold).length;
      const monthlyProfile = meteo.historical10y.monthlyProfile.map((m) => ({
        ...m,
        riskScore: Math.max(
          0,
          Math.min(100, Math.round(Math.max(0, -m.avgKbwMm) * (soil.iungCategory === 1 ? 1.05 : soil.iungCategory === 4 ? 0.72 : 0.9) + (m.droughtYearsCount / Math.max(1, m.totalYears)) * 35))
        ),
      }));
      meteo = {
        ...meteo,
        historical10y: {
          ...meteo.historical10y,
          yearlySeries,
          monthlyProfile,
          droughtYearsCount: Math.max(droughtYearsCount, soil.iungCategory === 1 ? meteo.historical10y.droughtYearsCount : Math.min(meteo.historical10y.droughtYearsCount, yearlySeries.length)),
          droughtFrequencyPct:
            yearlySeries.length > 0
              ? Math.round((Math.max(droughtYearsCount, meteo.historical10y.droughtYearsCount * (soil.iungCategory === 1 ? 1.15 : soil.iungCategory === 4 ? 0.65 : 0.9)) / Math.min(10, Math.max(1, meteo.yearsAnalyzed))) * 100)
              : meteo.historical10y.droughtFrequencyPct,
        },
      };
      meteo.historical10y.droughtFrequencyPct = Math.min(100, meteo.historical10y.droughtFrequencyPct);
      meteo.historical10y.droughtYearsCount = Math.min(10, Math.round((meteo.historical10y.droughtFrequencyPct / 100) * Math.min(10, Math.max(1, meteo.yearsAnalyzed))));
    }

    // 3. Ścisła sekwencja wnioskowania KOWR: Etap 1 → Etap 2 → Etap 3 → Etap 4 → Etap 5 → Etap 6
    const assessment = buildWaterAssessment({ parcel, crop, meteo, soil, satellite, elevation });
    const causes = identifyCauses({ crop, meteo, soil, elevation, hydrology, satellite });
    const { retention, agrotech } = buildRecommendations({
      parcel,
      crop,
      meteo,
      soil,
      elevation,
      hydrology,
      assessment,
      farmOptions: options,
    });
    const irrigationAdvice = buildIrrigationAdvice({
      parcel,
      crop,
      meteo,
      soil,
      hydrology,
      assessment,
      farmOptions: options,
    });
    const { provenance, limitations } = buildProvenanceAndLimitations({
      parcel,
      elevation,
      meteo,
      satellite,
      soil,
      hydrology,
    });

    const report: WaterAnalysisReport = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      analysisDate,
      cropId: crop.id,
      cropNamePl: crop.namePl,
      farmOptions: options,
      executionTimeMs: Date.now() - t0,
      parcel,
      elevation,
      meteo,
      satellite,
      soil,
      hydrology,
      assessment,
      causes,
      retentionRecommendations: retention,
      agrotechRecommendations: agrotech,
      irrigationAdvice,
      provenance,
      limitations,
    };

    // Zapis w bazie (domyślnie true, chyba że użytkownik wyraźnie wyłączył)
    if (body.save !== false) {
      saveReport(report);
    }

    res.status(200).json({ report });
  } catch (err: any) {
    console.error('❌ Błąd analizy działki:', err);
    res.status(500).json({ error: 'Wystąpił nieoczekiwany błąd podczas przeprowadzania analizy wodnej.' });
  }
};

export const listReportsHandler = (_req: Request, res: Response) => {
  res.json({ reports: listReports(100) });
};

export const getReportHandler = (req: Request, res: Response) => {
  const report = getReportById(req.params.id);
  if (!report) {
    res.status(404).json({ error: 'Nie znaleziono zapisanego raportu.' });
    return;
  }
  res.json({ report });
};

export const deleteReportHandler = (req: Request, res: Response) => {
  const deleted = deleteReportById(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Nie znaleziono raportu do usunięcia.' });
    return;
  }
  res.json({ deleted: true });
};

export const exportReportExcelHandler = async (req: Request, res: Response) => {
  const report = getReportById(req.params.id);
  if (!report) {
    res.status(404).json({ error: 'Nie znaleziono raportu do eksportu.' });
    return;
  }
  try {
    const wb = await buildWaterReportWorkbook(report);
    const safeName = (report.parcel.teryt ?? 'dzialka').replace(/[^A-Za-z0-9_.-]+/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="AgroWoda_${safeName}_${report.analysisDate}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Błąd eksportu Excel:', err);
    res.status(500).json({ error: 'Nie udało się wygenerować pliku Excel.' });
  }
};

export const getMethodologyHandler = (_req: Request, res: Response) => {
  res.json({
    title: 'AgroWoda KOWR — Metodyka naukowa i źródła danych',
    sequence: [
      '1. Ocena sytuacji wodnej (bieżąca + 10-letnia podatność historyczna)',
      '2. Identyfikacja przyczyn ograniczonej dostępności wody',
      '3. Rekomendacje retencyjne (retencja krajobrazowa NWRM i glebowa)',
      '4. Działania agrotechniczne (ograniczanie strat wilgoci)',
      '5. Opcjonalne rekomendacje nawadniania (FAO-56 + prognoza 7-dniowa)',
    ],
    sources: [
      { category: 'Dane przestrzenne (działki)', name: 'GUGiK ULDK + KIEG WMS + UUG', resolution: 'Granice EGiB', license: 'Otwarte dane publiczne GUGiK', url: 'https://uldk.gugik.gov.pl/' },
      { category: 'Dane przestrzenne (teren)', name: 'GUGiK NMT (zapasowo Open-Meteo DEM)', resolution: '1 m (Polska) / 30 m', license: 'Otwarte dane publiczne GUGiK / CC-BY 4.0', url: 'https://www.geoportal.gov.pl/' },
      { category: 'Dane meteorologiczne (10 lat)', name: 'NASA POWER Agroclimatology + Open-Meteo + IMGW-PIB Synop', resolution: 'Dzienne serie 10-letnie + prognoza 7d', license: 'Public Domain / CC-BY 4.0 / Dane Publiczne IMGW', url: 'https://power.larc.nasa.gov/' },
      { category: 'Dane satelitarne', name: 'Copernicus Sentinel-2 L2A (AWS Earth Search STAC)', resolution: '10 m (NDVI) / 20 m (NDMI, SCL)', license: 'Copernicus Free & Open Data', url: 'https://earth-search.aws.element84.com/v1' },
      { category: 'Dane glebowe', name: 'ISRIC SoilGrids v2.0 + Saxton & Rawls (2006) + klasy IUNG I–IV', resolution: '250 m (0–60 cm)', license: 'CC-BY 4.0 (ISRIC)', url: 'https://soilgrids.org/' },
      { category: 'Dane hydrologiczne', name: 'IMGW-PIB Hydro + OpenStreetMap Overpass', resolution: 'Stacje wodowskazowe + sieć rowów/cieków 1,5 km', license: 'Dane Publiczne IMGW / ODbL (OSM)', url: 'https://danepubliczne.imgw.pl/' },
    ],
  });
};
