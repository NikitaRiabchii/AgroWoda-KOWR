/**
 * Podstawowe mechanizmy cyberbezpieczeństwa zgodne z wymaganiem KOWR §5.6:
 * - nagłówki bezpieczeństwa HTTP (bez zbędnych zależności),
 * - ograniczanie liczby zapytań (in-memory sliding window per IP chroniące zewnętrzne API),
 * - walidacja i sanityzacja danych wejściowych, brak gromadzenia danych osobowych.
 */
import type { NextFunction, Request, Response } from 'express';

export const securityHeaders = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.removeHeader('X-Powered-By');
  next();
};

const buckets = new Map<string, number[]>();

export const createRateLimiter = (maxRequests: number, windowMs: number) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV === 'test') return next();
    const ip = req.ip || req.socket.remoteAddress || 'local';
    const now = Date.now();
    const arr = (buckets.get(ip) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= maxRequests) {
      res.status(429).json({
        error: 'Przekroczono limit zapytań. Odczekaj chwilę przed uruchomieniem kolejnej analizy.',
      });
      return;
    }
    arr.push(now);
    buckets.set(ip, arr);
    next();
  };
};
