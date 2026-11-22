import dotenv from 'dotenv';
import app from './app';
import { initStorage } from './services/storageService';

dotenv.config();

const PORT = Number(process.env.PORT) || 5000;

const startServer = () => {
  try {
    const storage = initStorage();
    console.log(`✅ Zainicjalizowano magazyn danych (${storage.mode}): ${storage.path}`);

    app.listen(PORT, () => {
      console.log(`🌱 AgroWoda KOWR API uruchomione na porcie ${PORT}`);
      console.log(`📑 Dokumentacja Swagger UI: http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('❌ Błąd podczas uruchamiania serwera:', error);
    process.exit(1);
  }
};

startServer();
