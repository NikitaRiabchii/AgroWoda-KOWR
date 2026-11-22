"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSwagger = exports.swaggerSpec = void 0;
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
exports.swaggerSpec = {
    openapi: '3.0.0',
    info: {
        title: 'AgroWoda KOWR — REST API',
        version: '1.0.0',
        description: 'API systemu wspomagania decyzji wodnych i retencyjnych dla polskich rolników (Zadanie konkursowe KOWR — HackNation 2026). Łączy dane GUGiK (ULDK/KIEG/NMT), NASA POWER (10 lat), Open-Meteo, Copernicus Sentinel-2 L2A, ISRIC SoilGrids, IMGW-PIB oraz OpenStreetMap.',
    },
    servers: [{ url: 'http://localhost:5000', description: 'Serwer lokalny' }],
    paths: {
        '/api/health': {
            get: {
                tags: ['System'],
                summary: 'Status działania API i pamięci trwałej',
                responses: { 200: { description: 'Serwer działa poprawnie' } },
            },
        },
        '/api/crops': {
            get: {
                tags: ['Katalog'],
                summary: 'Lista 12 upraw rolniczych z parametrami FAO-56 i progami suszowymi IUNG-PIB',
                responses: { 200: { description: 'Lista upraw' } },
            },
        },
        '/api/parcels/lookup': {
            get: {
                tags: ['Działki ewidencyjne'],
                summary: 'Pobranie granic i metadanych działki po TERYT (?id=...) lub współrzędnych (?lat=...&lng=...)',
                parameters: [
                    { in: 'query', name: 'id', schema: { type: 'string' }, example: '141201_1.0001.6509' },
                    { in: 'query', name: 'lat', schema: { type: 'number' }, example: 52.85 },
                    { in: 'query', name: 'lng', schema: { type: 'number' }, example: 18.25 },
                ],
                responses: { 200: { description: 'Geometria i dane działki' }, 404: { description: 'Nie znaleziono działki' } },
            },
        },
        '/api/parcels/search': {
            get: {
                tags: ['Działki ewidencyjne'],
                summary: 'Wyszukiwanie miejscowości / gminy (GUGiK UUG) lub identyfikatora działki',
                parameters: [{ in: 'query', name: 'q', required: true, schema: { type: 'string' }, example: 'Inowrocław' }],
                responses: { 200: { description: 'Lista dopasowań' } },
            },
        },
        '/api/analyze': {
            post: {
                tags: ['Analiza wodna KOWR'],
                summary: 'Pełna 5-etapowa analiza sytuacji wodnej i rekomendacji dla działki i daty (ostatnie 10 lat)',
                requestBody: {
                    required: true,
                    content: {
                        'application/json': {
                            schema: {
                                type: 'object',
                                required: ['cropId', 'analysisDate'],
                                properties: {
                                    parcelId: { type: 'string', example: '141201_1.0001.6509' },
                                    lat: { type: 'number', example: 52.85 },
                                    lng: { type: 'number', example: 18.25 },
                                    cropId: { type: 'string', example: 'zboza_ozime' },
                                    analysisDate: { type: 'string', example: '2025-06-15' },
                                    save: { type: 'boolean', default: true },
                                },
                            },
                        },
                    },
                },
                responses: { 200: { description: 'Pełny raport z analizy i rekomendacjami' }, 400: { description: 'Błąd walidacji' } },
            },
        },
        '/api/reports': {
            get: {
                tags: ['Zapisane raporty'],
                summary: 'Lista zapisanych raportów gospodarstwa',
                responses: { 200: { description: 'Lista podsumowań raportów' } },
            },
        },
        '/api/reports/{id}': {
            get: {
                tags: ['Zapisane raporty'],
                summary: 'Pobranie pełnego zapisanego raportu JSON',
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Raport' }, 404: { description: 'Nie znaleziono' } },
            },
            delete: {
                tags: ['Zapisane raporty'],
                summary: 'Usunięcie zapisanego raportu',
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Usunięto' } },
            },
        },
        '/api/reports/{id}/export.xlsx': {
            get: {
                tags: ['Zapisane raporty'],
                summary: 'Pobranie wieloarkuszowego raportu Excel (.xlsx)',
                parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
                responses: { 200: { description: 'Plik XLSX' } },
            },
        },
    },
};
const setupSwagger = (app) => {
    app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(exports.swaggerSpec, {
        customSiteTitle: 'AgroWoda KOWR — Dokumentacja API',
    }));
};
exports.setupSwagger = setupSwagger;
