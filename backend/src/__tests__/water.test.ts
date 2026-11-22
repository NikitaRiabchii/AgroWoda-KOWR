import request from 'supertest';
import app from '../app';
import { computeFao56Et0 } from '../services/meteoService';
import { saxtonRawlsHydraulics, classifyIungCategory } from '../services/soilService';
import { parseCoordinates, parseWktPolygon } from '../services/parcelService';
import { CROPS, computeCropKcAndStage, dayOfYear } from '../data/crops';

describe('AgroWoda KOWR — Obliczenia naukowe i API', () => {
  test('FAO-56 Penman-Monteith ET0 zwraca fizycznie poprawne wartości dla lata i zimy w Polsce', () => {
    const et0Summer = computeFao56Et0({
      tMax: 28,
      tMin: 14,
      rhMean: 55,
      wind2m: 2.5,
      rsMjM2: 24,
      latDeg: 52.8,
      elevM: 90,
      doy: 172, // czerwiec
    });
    const et0Winter = computeFao56Et0({
      tMax: 2,
      tMin: -3,
      rhMean: 88,
      wind2m: 3.0,
      rsMjM2: 3.0,
      latDeg: 52.8,
      elevM: 90,
      doy: 15, // styczeń
    });
    expect(et0Summer).toBeGreaterThan(4.0);
    expect(et0Summer).toBeLessThan(7.5);
    expect(et0Winter).toBeGreaterThanOrEqual(0);
    expect(et0Winter).toBeLessThan(1.0);
  });

  test('Saxton & Rawls (2006) + klasyfikacja IUNG rozróżnia glebę piaszczystą (Kat. I) od gliniastej (Kat. IV)', () => {
    const sandy = saxtonRawlsHydraulics(82, 6, 1.2);
    const clayLoam = saxtonRawlsHydraulics(24, 30, 3.2);
    expect(sandy.awcMmPerM).toBeLessThan(clayLoam.awcMmPerM);
    expect(classifyIungCategory(82, 6, sandy.awcMmPerM).category).toBe(1);
    expect(classifyIungCategory(24, 30, clayLoam.awcMmPerM).category).toBe(4);
  });

  test('Parsowanie WKT POLYGON z ULDK zwraca poprawne wierzchołki [lat, lng]', () => {
    const wkt =
      'SRID=4326;POLYGON((18.250 52.850,18.252 52.850,18.252 52.852,18.250 52.852,18.250 52.850))';
    const poly = parseWktPolygon(wkt);
    expect(poly).not.toBeNull();
    expect(poly!.length).toBe(4);
    expect(poly![0]).toEqual([52.85, 18.25]);
  });

  test('Parser współrzędnych obsługuje kropki, przecinki, DMS, zamianę (lng, lat) i granice Polski', () => {
    expect(parseCoordinates('52.85, 18.25')).toEqual({ lat: 52.85, lng: 18.25, inPoland: true });
    expect(parseCoordinates('52,85; 18,25')).toEqual({ lat: 52.85, lng: 18.25, inPoland: true });
    expect(parseCoordinates('18.25 52.85')).toEqual({ lat: 52.85, lng: 18.25, inPoland: true });
    expect(parseCoordinates(`52°51'00"N 18°15'00"E`)?.inPoland).toBe(true);
    expect(parseCoordinates('40.71, -74.00')?.inPoland).toBe(false);
    expect(parseCoordinates('Inowrocław')).toBeNull();
    expect(parseCoordinates('040704_2.0007.68')).toBeNull();
  });

  test('Krzywa fenologiczna FAO-56 Kc poprawnie rozróżnia zimę od szczytu wegetacji', () => {
    const winterWheat = CROPS.find((c) => c.id === 'zboza_ozime')!;
    const winter = computeCropKcAndStage(winterWheat, dayOfYear('2025-01-20'));
    const june = computeCropKcAndStage(winterWheat, dayOfYear('2025-06-10'));
    expect(winter.isGrowingSeason).toBe(false);
    expect(june.isGrowingSeason).toBe(true);
    expect(june.kc).toBeGreaterThan(winter.kc);
  });

  test('GET /api/health i GET /api/crops działają poprawnie bez logowania', async () => {
    const health = await request(app).get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body.status).toBe('ok');

    const crops = await request(app).get('/api/crops');
    expect(crops.status).toBe(200);
    expect(Array.isArray(crops.body.crops)).toBe(true);
    expect(crops.body.crops.length).toBeGreaterThanOrEqual(12);
  });

  test('POST /api/analyze przeprowadza pełną 5-etapową analizę, zapisuje raport i eksportuje Excel', async () => {
    const res = await request(app).post('/api/analyze').send({
      parcelId: '040704_2.0007.68',
      cropId: 'zboza_ozime',
      analysisDate: '2025-06-15',
      options: { tillageType: 'orkowy', hasIrrigationSystem: false },
    });

    expect(res.status).toBe(200);
    const r = res.body.report;
    expect(r.id).toBeTruthy();
    expect(r.assessment.currentRiskScore).toBeGreaterThanOrEqual(0);
    expect(r.assessment.currentRiskScore).toBeLessThanOrEqual(100);
    expect(r.causes.length).toBeGreaterThanOrEqual(3);
    expect(r.causes.reduce((s: number, c: any) => s + c.contributionPct, 0)).toBe(100);
    expect(r.retentionRecommendations.length).toBeGreaterThanOrEqual(2);
    expect(r.agrotechRecommendations.length).toBeGreaterThanOrEqual(2);
    expect(r.irrigationAdvice.decision).toBeTruthy();
    expect(r.provenance.length).toBeGreaterThanOrEqual(5);
    expect(r.limitations.confidencePct).toBeGreaterThan(0);

    // Pobranie listy zapisanych raportów
    const list = await request(app).get('/api/reports');
    expect(list.status).toBe(200);
    expect(list.body.reports.some((x: any) => x.id === r.id)).toBe(true);

    // Pobranie szczegółów raportu
    const getOne = await request(app).get(`/api/reports/${r.id}`);
    expect(getOne.status).toBe(200);
    expect(getOne.body.report.id).toBe(r.id);

    // Eksport do Excel (.xlsx)
    const xlsx = await request(app).get(`/api/reports/${r.id}/export.xlsx`);
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');

    // Usunięcie raportu
    const del = await request(app).delete(`/api/reports/${r.id}`);
    expect(del.status).toBe(200);
    expect(del.body.deleted).toBe(true);
  });

  test('Walidacja odrzuca błędne daty spoza zakresu 10 lat oraz współrzędne spoza Polski', async () => {
    const oldDate = await request(app).post('/api/analyze').send({
      lat: 52.85,
      lng: 18.25,
      cropId: 'kukurydza',
      analysisDate: '2005-06-01',
    });
    expect(oldDate.status).toBe(400);

    const outsidePoland = await request(app).post('/api/analyze').send({
      lat: 40.0,
      lng: -3.7,
      cropId: 'kukurydza',
      analysisDate: '2025-06-15',
    });
    expect(outsidePoland.status).toBe(400);
  });
});
