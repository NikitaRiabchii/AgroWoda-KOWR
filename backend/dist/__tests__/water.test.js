"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../app"));
const meteoService_1 = require("../services/meteoService");
const soilService_1 = require("../services/soilService");
const parcelService_1 = require("../services/parcelService");
const crops_1 = require("../data/crops");
describe('AgroWoda KOWR — Obliczenia naukowe i API', () => {
    test('FAO-56 Penman-Monteith ET0 zwraca fizycznie poprawne wartości dla lata i zimy w Polsce', () => {
        const et0Summer = (0, meteoService_1.computeFao56Et0)({
            tMax: 28,
            tMin: 14,
            rhMean: 55,
            wind2m: 2.5,
            rsMjM2: 24,
            latDeg: 52.8,
            elevM: 90,
            doy: 172, // czerwiec
        });
        const et0Winter = (0, meteoService_1.computeFao56Et0)({
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
        const sandy = (0, soilService_1.saxtonRawlsHydraulics)(82, 6, 1.2);
        const clayLoam = (0, soilService_1.saxtonRawlsHydraulics)(24, 30, 3.2);
        expect(sandy.awcMmPerM).toBeLessThan(clayLoam.awcMmPerM);
        expect((0, soilService_1.classifyIungCategory)(82, 6, sandy.awcMmPerM).category).toBe(1);
        expect((0, soilService_1.classifyIungCategory)(24, 30, clayLoam.awcMmPerM).category).toBe(4);
    });
    test('Parsowanie WKT POLYGON z ULDK zwraca poprawne wierzchołki [lat, lng]', () => {
        const wkt = 'SRID=4326;POLYGON((18.250 52.850,18.252 52.850,18.252 52.852,18.250 52.852,18.250 52.850))';
        const poly = (0, parcelService_1.parseWktPolygon)(wkt);
        expect(poly).not.toBeNull();
        expect(poly.length).toBe(4);
        expect(poly[0]).toEqual([52.85, 18.25]);
    });
    test('Parser współrzędnych obsługuje kropki, przecinki, DMS, zamianę (lng, lat) i granice Polski', () => {
        expect((0, parcelService_1.parseCoordinates)('52.85, 18.25')).toEqual({ lat: 52.85, lng: 18.25, inPoland: true });
        expect((0, parcelService_1.parseCoordinates)('52,85; 18,25')).toEqual({ lat: 52.85, lng: 18.25, inPoland: true });
        expect((0, parcelService_1.parseCoordinates)('18.25 52.85')).toEqual({ lat: 52.85, lng: 18.25, inPoland: true });
        expect((0, parcelService_1.parseCoordinates)(`52°51'00"N 18°15'00"E`)?.inPoland).toBe(true);
        expect((0, parcelService_1.parseCoordinates)('40.71, -74.00')?.inPoland).toBe(false);
        expect((0, parcelService_1.parseCoordinates)('Inowrocław')).toBeNull();
        expect((0, parcelService_1.parseCoordinates)('040704_2.0007.68')).toBeNull();
    });
    test('Krzywa fenologiczna FAO-56 Kc poprawnie rozróżnia zimę od szczytu wegetacji', () => {
        const winterWheat = crops_1.CROPS.find((c) => c.id === 'zboza_ozime');
        const winter = (0, crops_1.computeCropKcAndStage)(winterWheat, (0, crops_1.dayOfYear)('2025-01-20'));
        const june = (0, crops_1.computeCropKcAndStage)(winterWheat, (0, crops_1.dayOfYear)('2025-06-10'));
        expect(winter.isGrowingSeason).toBe(false);
        expect(june.isGrowingSeason).toBe(true);
        expect(june.kc).toBeGreaterThan(winter.kc);
    });
    test('GET /api/health i GET /api/crops działają poprawnie bez logowania', async () => {
        const health = await (0, supertest_1.default)(app_1.default).get('/api/health');
        expect(health.status).toBe(200);
        expect(health.body.status).toBe('ok');
        const crops = await (0, supertest_1.default)(app_1.default).get('/api/crops');
        expect(crops.status).toBe(200);
        expect(Array.isArray(crops.body.crops)).toBe(true);
        expect(crops.body.crops.length).toBeGreaterThanOrEqual(12);
    });
    test('POST /api/analyze przeprowadza pełną 5-etapową analizę, zapisuje raport i eksportuje Excel', async () => {
        const res = await (0, supertest_1.default)(app_1.default).post('/api/analyze').send({
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
        expect(r.causes.reduce((s, c) => s + c.contributionPct, 0)).toBe(100);
        expect(r.retentionRecommendations.length).toBeGreaterThanOrEqual(2);
        expect(r.agrotechRecommendations.length).toBeGreaterThanOrEqual(2);
        expect(r.irrigationAdvice.decision).toBeTruthy();
        expect(r.provenance.length).toBeGreaterThanOrEqual(5);
        expect(r.limitations.confidencePct).toBeGreaterThan(0);
        // Pobranie listy zapisanych raportów
        const list = await (0, supertest_1.default)(app_1.default).get('/api/reports');
        expect(list.status).toBe(200);
        expect(list.body.reports.some((x) => x.id === r.id)).toBe(true);
        // Pobranie szczegółów raportu
        const getOne = await (0, supertest_1.default)(app_1.default).get(`/api/reports/${r.id}`);
        expect(getOne.status).toBe(200);
        expect(getOne.body.report.id).toBe(r.id);
        // Eksport do Excel (.xlsx)
        const xlsx = await (0, supertest_1.default)(app_1.default).get(`/api/reports/${r.id}/export.xlsx`);
        expect(xlsx.status).toBe(200);
        expect(xlsx.headers['content-type']).toContain('spreadsheetml');
        // Usunięcie raportu
        const del = await (0, supertest_1.default)(app_1.default).delete(`/api/reports/${r.id}`);
        expect(del.status).toBe(200);
        expect(del.body.deleted).toBe(true);
    });
    test('Walidacja odrzuca błędne daty spoza zakresu 10 lat oraz współrzędne spoza Polski', async () => {
        const oldDate = await (0, supertest_1.default)(app_1.default).post('/api/analyze').send({
            lat: 52.85,
            lng: 18.25,
            cropId: 'kukurydza',
            analysisDate: '2005-06-01',
        });
        expect(oldDate.status).toBe(400);
        const outsidePoland = await (0, supertest_1.default)(app_1.default).post('/api/analyze').send({
            lat: 40.0,
            lng: -3.7,
            cropId: 'kukurydza',
            analysisDate: '2025-06-15',
        });
        expect(outsidePoland.status).toBe(400);
    });
});
