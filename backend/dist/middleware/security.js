"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRateLimiter = exports.securityHeaders = void 0;
const securityHeaders = (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    res.removeHeader('X-Powered-By');
    next();
};
exports.securityHeaders = securityHeaders;
const buckets = new Map();
const createRateLimiter = (maxRequests, windowMs) => {
    return (req, res, next) => {
        if (process.env.NODE_ENV === 'test')
            return next();
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
exports.createRateLimiter = createRateLimiter;
