"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const routes_1 = __importDefault(require("./routes"));
const swagger_1 = require("./config/swagger");
const security_1 = require("./middleware/security");
const storageService_1 = require("./services/storageService");
const app = (0, express_1.default)();
app.use(security_1.securityHeaders);
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '1mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
// Dokumentacja Swagger UI pod /api-docs
(0, swagger_1.setupSwagger)(app);
// Główne endpointy REST API
app.use('/api', routes_1.default);
app.get('/', (_req, res) => {
    res.redirect('/api-docs');
});
app.get('/api/health', (_req, res) => {
    const storage = (0, storageService_1.getStorageInfo)();
    res.status(200).json({
        status: 'ok',
        service: 'AgroWoda KOWR API',
        storageMode: storage.mode,
        timestamp: new Date().toISOString(),
    });
});
exports.default = app;
