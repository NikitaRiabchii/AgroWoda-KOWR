"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const app_1 = __importDefault(require("./app"));
const storageService_1 = require("./services/storageService");
dotenv_1.default.config();
const PORT = Number(process.env.PORT) || 5000;
const startServer = () => {
    try {
        const storage = (0, storageService_1.initStorage)();
        console.log(`✅ Zainicjalizowano magazyn danych (${storage.mode}): ${storage.path}`);
        app_1.default.listen(PORT, () => {
            console.log(`🌱 AgroWoda KOWR API uruchomione na porcie ${PORT}`);
            console.log(`📑 Dokumentacja Swagger UI: http://localhost:${PORT}/api-docs`);
        });
    }
    catch (error) {
        console.error('❌ Błąd podczas uruchamiania serwera:', error);
        process.exit(1);
    }
};
startServer();
