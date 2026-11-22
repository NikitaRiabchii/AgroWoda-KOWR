import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import routes from './routes';
import { setupSwagger } from './config/swagger';
import { securityHeaders } from './middleware/security';
import { getStorageInfo } from './services/storageService';

const app: Application = express();

app.use(securityHeaders);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Dokumentacja Swagger UI pod /api-docs
setupSwagger(app);

// Główne endpointy REST API
app.use('/api', routes);

app.get('/', (_req: Request, res: Response) => {
  res.redirect('/api-docs');
});

app.get('/api/health', (_req: Request, res: Response) => {
  const storage = getStorageInfo();
  res.status(200).json({
    status: 'ok',
    service: 'AgroWoda KOWR API',
    storageMode: storage.mode,
    timestamp: new Date().toISOString(),
  });
});

export default app;
