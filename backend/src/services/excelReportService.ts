/**
 * Eksport raportu AgroWoda KOWR do wieloarkuszowego pliku Microsoft Excel (.xlsx) przez ExcelJS.
 * Zawiera 6 arkuszy: Podsumowanie, Przyczyny i Rekomendacje, Historia 10-letnia, Bilans 60-dniowy,
 * Dane Glebowe/Satelitarne/Terenowe/Hydrologiczne oraz Źródła Danych i Ograniczenia.
 */
import ExcelJS from 'exceljs';
import type { WaterAnalysisReport } from '../types/water';

const styleHeader = (sheet: ExcelJS.Worksheet, colorHex = 'FF047857') => {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colorHex } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 24;
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
};

export const buildWaterReportWorkbook = async (report: WaterAnalysisReport): Promise<ExcelJS.Workbook> => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AgroWoda KOWR — Inteligentny Asystent Gospodarowania Wodą';
  wb.created = new Date();

  // 1. Podsumowanie i Werdykt
  const s1 = wb.addWorksheet('Podsumowanie');
  s1.columns = [
    { header: 'Parametr', key: 'k', width: 42 },
    { header: 'Wartość', key: 'v', width: 78 },
  ];
  const loc = [report.parcel.region, report.parcel.commune, report.parcel.county, report.parcel.voivodeship]
    .filter(Boolean)
    .join(', ');
  const summaryRows: [string, string | number][] = [
    ['Identyfikator działki (TERYT)', report.parcel.teryt ?? 'Brak (przybliżony punkt)'],
    ['Lokalizacja administracyjna', loc || `${report.parcel.centroid.lat}, ${report.parcel.centroid.lng}`],
    ['Powierzchnia działki (ha)', report.parcel.areaHa],
    ['Współrzędne środka (lat, lng)', `${report.parcel.centroid.lat}, ${report.parcel.centroid.lng}`],
    ['Analizowana uprawa', report.cropNamePl],
    ['Data analizy', report.analysisDate],
    ['Data wygenerowania raportu', new Date(report.createdAt).toLocaleString('pl-PL')],
    ['Bieżąca ocena ryzyka suszy', `${report.assessment.currentRiskLabelPl} (${report.assessment.currentRiskScore}/100)`],
    ['Wieloletnia podatność (10 lat)', `${report.assessment.historicalRiskLabelPl} (${report.assessment.historicalRiskScore}/100)`],
    ['KBW 60-dniowy / Próg suszy IUNG-PIB', `${report.assessment.kbw60dMm ?? '—'} mm / ${report.assessment.iungThresholdUsedMm ?? '—'} mm`],
    ['Częstość suszy w 10-leciu', `${report.meteo.historical10y.droughtYearsCount} z ${Math.min(10, report.meteo.yearsAnalyzed)} lat (${report.meteo.historical10y.droughtFrequencyPct}%)`],
    ['Okres największego ryzyka', report.meteo.historical10y.peakRiskPeriodPl],
    ['Kategoria gleby IUNG-PIB', report.soil.iungCategoryLabelPl ?? 'Brak danych'],
    ['Retencja użyteczna gleby AWC (0–60 cm)', report.soil.awc60cmMm !== null ? `${report.soil.awc60cmMm} mm` : 'Brak danych'],
    ['Zawartość próchnicy', report.soil.humusPct !== null ? `${report.soil.humusPct}%` : 'Brak danych'],
    ['Średni / maks. spadek terenu (NMT)', report.elevation.available ? `${report.elevation.meanSlopePct}% / ${report.elevation.maxSlopePct}% (${report.elevation.aspectLabelPl})` : 'Brak danych'],
    ['Sentinel-2 NDVI / NDMI', report.satellite.available && report.satellite.ndvi && report.satellite.ndmi ? `NDVI ${report.satellite.ndvi.mean} / NDMI ${report.satellite.ndmi.mean} (${report.satellite.sceneDate})` : 'Brak bezchmurnej sceny'],
    ['Decyzja dot. nawadniania (opcjonalna)', report.irrigationAdvice.decisionLabelPl],
    ['Zalecana dawka polewowa (jeśli dotyczy)', report.irrigationAdvice.recommendedDoseMm ? `${report.irrigationAdvice.recommendedDoseMm} mm (${report.irrigationAdvice.recommendedVolumeM3PerHa} m³/ha; łącznie ${report.irrigationAdvice.totalParcelVolumeM3} m³)` : 'Nie dotyczy'],
    ['Poziom pewności raportu', report.limitations.confidenceLabelPl],
    ['Podsumowanie wykonawcze', report.assessment.executiveSummaryPl],
  ];
  summaryRows.forEach(([k, v]) => s1.addRow({ k, v }));
  s1.getColumn('v').alignment = { wrapText: true };
  styleHeader(s1);

  // 2. Przyczyny i Rekomendacje
  const s2 = wb.addWorksheet('Przyczyny i Rekomendacje');
  s2.columns = [
    { header: 'Etap analizy', key: 'stage', width: 24 },
    { header: 'Priorytet / Waga', key: 'prio', width: 16 },
    { header: 'Tytuł', key: 'title', width: 42 },
    { header: 'Opis działania / przyczyny', key: 'desc', width: 58 },
    { header: 'Uzasadnienie w danych', key: 'just', width: 55 },
    { header: 'Spodziewany efekt', key: 'eff', width: 38 },
  ];
  report.causes.forEach((c) =>
    s2.addRow({
      stage: `Etap 2: Przyczyna (${c.category})`,
      prio: `${c.severity} (${c.contributionPct}%)`,
      title: c.titlePl,
      desc: c.explanationPl,
      just: c.evidencePl.join(' | '),
      eff: '—',
    })
  );
  report.retentionRecommendations.forEach((r) =>
    s2.addRow({
      stage: r.stage === 'retencja_krajobrazowa' ? 'Etap 3: Retencja krajobrazowa' : 'Etap 3: Retencja glebowa',
      prio: r.priority,
      title: r.titlePl,
      desc: r.descriptionPl,
      just: r.dataJustificationPl,
      eff: r.expectedEffectPl,
    })
  );
  report.agrotechRecommendations.forEach((r) =>
    s2.addRow({
      stage: 'Etap 4: Agrotechnika',
      prio: r.priority,
      title: r.titlePl,
      desc: r.descriptionPl,
      just: r.dataJustificationPl,
      eff: r.expectedEffectPl,
    })
  );
  s2.addRow({
    stage: 'Etap 5: Nawadnianie (opcjonalne)',
    prio: report.irrigationAdvice.decision,
    title: report.irrigationAdvice.decisionLabelPl,
    desc: `${report.irrigationAdvice.headlinePl} ${report.irrigationAdvice.rationalePl}`,
    just: report.irrigationAdvice.forecastConsiderationPl,
    eff: report.irrigationAdvice.timingWindowPl,
  });
  s2.eachRow((row, idx) => {
    if (idx > 1) row.alignment = { vertical: 'top', wrapText: true };
  });
  styleHeader(s2, 'FF0369A1');

  // 3. Historia 10-letnia (KBW)
  const s3 = wb.addWorksheet('Historia 10-letnia');
  s3.columns = [
    { header: 'Rok', key: 'year', width: 10 },
    { header: 'Okno 60-dniowe', key: 'win', width: 25 },
    { header: 'Opady 60d (mm)', key: 'p', width: 16 },
    { header: 'ET₀ FAO-56 (mm)', key: 'et0', width: 16 },
    { header: 'KBW 60d (mm)', key: 'kbw', width: 16 },
    { header: 'Śr. temp. (°C)', key: 't', width: 15 },
    { header: 'Najdłuższy ciąg bez opadu (dni)', key: 'dry', width: 28 },
    { header: 'Dni z opadem ≥20 mm', key: 'hvy', width: 20 },
    { header: 'Przekroczony próg IUNG?', key: 'thr', width: 22 },
  ];
  report.meteo.historical10y.yearlySeries.forEach((y) =>
    s3.addRow({
      year: y.year,
      win: `${y.windowStart} → ${y.windowEnd}`,
      p: y.precip60dMm,
      et0: y.et060dMm,
      kbw: y.kbw60dMm,
      t: y.tempMean60d,
      dry: y.longestDrySpellDays,
      hvy: y.heavyRainDays,
      thr: y.exceedsIungThreshold ? 'TAK (susza)' : 'Nie',
    })
  );
  styleHeader(s3);

  // 4. Bilans 60-dniowy (dzienny)
  const s4 = wb.addWorksheet('Bilans 60-dniowy');
  s4.columns = [
    { header: 'Data', key: 'date', width: 14 },
    { header: 'Temp. śr. (°C)', key: 't', width: 14 },
    { header: 'Temp. max (°C)', key: 'tmax', width: 14 },
    { header: 'Opad (mm)', key: 'p', width: 12 },
    { header: 'ET₀ (mm)', key: 'et0', width: 12 },
    { header: 'ETc uprawy (mm)', key: 'etc', width: 16 },
    { header: 'KBW dnia (mm)', key: 'kbw', width: 14 },
    { header: 'Bilans uprawy (mm)', key: 'cb', width: 18 },
  ];
  report.meteo.daily60d.forEach((d) =>
    s4.addRow({
      date: d.date,
      t: d.tempMean,
      tmax: d.tempMax,
      p: d.precipMm,
      et0: d.et0Mm,
      etc: d.etcMm,
      kbw: d.kbwDayMm,
      cb: d.cropBalanceDayMm,
    })
  );
  styleHeader(s4, 'FF0284C7');

  // 5. Źródła danych i ograniczenia
  const s5 = wb.addWorksheet('Źródła i Ograniczenia');
  s5.columns = [
    { header: 'Kategoria', key: 'cat', width: 18 },
    { header: 'Źródło danych', key: 'name', width: 40 },
    { header: 'Status', key: 'status', width: 24 },
    { header: 'Zakres / Data', key: 'range', width: 32 },
    { header: 'Rozdzielczość', key: 'res', width: 32 },
    { header: 'Licencja', key: 'lic', width: 38 },
  ];
  report.provenance.forEach((p) =>
    s5.addRow({
      cat: p.category,
      name: p.name,
      status: p.statusLabelPl,
      range: p.dataRange,
      res: p.spatialResolution,
      lic: p.license,
    })
  );
  s5.addRow({});
  s5.addRow({ cat: 'OGRANICZENIA', name: 'Braki danych w raporcie', status: report.limitations.missingDataPl.join(' | ') || 'Brak krytycznych braków' });
  report.limitations.unmodeledFactorsPl.forEach((f, i) => s5.addRow({ cat: `Czynnik #${i + 1}`, name: f }));
  s5.eachRow((row, idx) => {
    if (idx > 1) row.alignment = { vertical: 'top', wrapText: true };
  });
  styleHeader(s5, 'FF334155');

  return wb;
};
