/**
 * Lekka warstwa trwałości i pamięci podręcznej (cache API + zapisane raporty gospodarstwa).
 * - Na Node.js >= 22 korzysta z wbudowanego modułu `node:sqlite` (zero kompilacji C++ na Windows!).
 * - Na starszych wersjach Node automatycznie przełącza się na bezpieczny zapis JSON.
 * - W trybie testowym (NODE_ENV=test) działa w pamięci (in-memory).
 */
import fs from 'fs';
import path from 'path';
import type { SavedReportSummary, WaterAnalysisReport } from '../types/water';

const IS_TEST = () => process.env.NODE_ENV === 'test';
const DB_DIR = path.resolve(__dirname, '../..');
const SQLITE_PATH = process.env.DB_STORAGE
  ? path.resolve(DB_DIR, process.env.DB_STORAGE)
  : path.resolve(DB_DIR, 'database.sqlite');
const JSON_FALLBACK_PATH = path.resolve(DB_DIR, 'database.json');

interface SqliteDbLike {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: any[]): any;
    get(...params: any[]): any;
    all(...params: any[]): any[];
  };
}

let sqliteDb: SqliteDbLike | null = null;
let initialized = false;
let storageMode: 'node-sqlite' | 'json-file' | 'memory' = 'memory';

// Fallback in-memory / JSON maps
const memReports = new Map<string, WaterAnalysisReport>();
const memCache = new Map<string, { value: string; expiresAt: number; fetchedAt: string }>();

const loadJsonFallback = () => {
  try {
    if (!fs.existsSync(JSON_FALLBACK_PATH)) return;
    const raw = JSON.parse(fs.readFileSync(JSON_FALLBACK_PATH, 'utf8'));
    for (const r of raw.reports ?? []) memReports.set(r.id, r);
    const now = Date.now();
    for (const [k, v] of Object.entries<any>(raw.cache ?? {})) {
      if (v && v.expiresAt > now) memCache.set(k, v);
    }
  } catch (err) {
    console.warn('⚠️ Nie udało się odczytać pliku database.json:', err);
  }
};

const persistJsonFallback = () => {
  if (storageMode !== 'json-file') return;
  try {
    const payload = {
      reports: Array.from(memReports.values()),
      cache: Object.fromEntries(memCache.entries()),
    };
    const tmp = `${JSON_FALLBACK_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8');
    fs.renameSync(tmp, JSON_FALLBACK_PATH);
  } catch (err) {
    console.warn('⚠️ Błąd zapisu database.json:', err);
  }
};

export const initStorage = (): { mode: string; path: string } => {
  if (initialized) {
    return {
      mode: storageMode,
      path: storageMode === 'node-sqlite' ? SQLITE_PATH : storageMode === 'json-file' ? JSON_FALLBACK_PATH : ':memory:',
    };
  }
  initialized = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeSqlite = require('node:sqlite');
    if (typeof nodeSqlite?.DatabaseSync === 'function') {
      const target = IS_TEST() ? ':memory:' : SQLITE_PATH;
      const db: SqliteDbLike = new nodeSqlite.DatabaseSync(target);
      db.exec(`
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY,
          created_at TEXT NOT NULL,
          analysis_date TEXT NOT NULL,
          teryt TEXT,
          location_label TEXT NOT NULL,
          area_ha REAL NOT NULL,
          crop_id TEXT NOT NULL,
          crop_name_pl TEXT NOT NULL,
          current_risk_score INTEGER NOT NULL,
          current_risk_level TEXT NOT NULL,
          current_risk_label_pl TEXT NOT NULL,
          historical_risk_score INTEGER NOT NULL,
          confidence_pct INTEGER NOT NULL,
          kbw_60d_mm REAL,
          iung_category INTEGER,
          payload_json TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS api_cache (
          cache_key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL,
          fetched_at TEXT NOT NULL,
          expires_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_cache_expires ON api_cache(expires_at);
      `);
      sqliteDb = db;
      storageMode = IS_TEST() ? 'memory' : 'node-sqlite';
      return { mode: storageMode, path: target };
    }
  } catch {
    // Fallback poniżej
  }

  if (IS_TEST()) {
    storageMode = 'memory';
    return { mode: 'memory', path: ':memory:' };
  }
  storageMode = 'json-file';
  loadJsonFallback();
  return { mode: 'json-file', path: JSON_FALLBACK_PATH };
};

export const getStorageInfo = () => initStorage();

export const cacheGet = <T>(key: string): { data: T; fetchedAt: string } | null => {
  initStorage();
  const now = Date.now();
  if (sqliteDb) {
    try {
      const row = sqliteDb.prepare('SELECT value_json, fetched_at, expires_at FROM api_cache WHERE cache_key = ?').get(key);
      if (!row) return null;
      if (Number(row.expires_at) <= now) {
        sqliteDb.prepare('DELETE FROM api_cache WHERE cache_key = ?').run(key);
        return null;
      }
      return { data: JSON.parse(row.value_json) as T, fetchedAt: String(row.fetched_at) };
    } catch {
      return null;
    }
  }
  const hit = memCache.get(key);
  if (!hit || hit.expiresAt <= now) {
    memCache.delete(key);
    return null;
  }
  return { data: JSON.parse(hit.value) as T, fetchedAt: hit.fetchedAt };
};

export const cacheSet = <T>(key: string, data: T, ttlMs: number): void => {
  initStorage();
  const fetchedAt = new Date().toISOString();
  const expiresAt = Date.now() + ttlMs;
  const serialized = JSON.stringify(data);
  if (sqliteDb) {
    try {
      sqliteDb
        .prepare(
          'INSERT INTO api_cache (cache_key, value_json, fetched_at, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET value_json=excluded.value_json, fetched_at=excluded.fetched_at, expires_at=excluded.expires_at'
        )
        .run(key, serialized, fetchedAt, expiresAt);
    } catch (err) {
      console.warn('⚠️ Błąd zapisu do api_cache:', err);
    }
    return;
  }
  memCache.set(key, { value: serialized, expiresAt, fetchedAt });
  persistJsonFallback();
};

const formatLocationLabel = (r: WaterAnalysisReport): string => {
  const parts = [r.parcel.region, r.parcel.commune, r.parcel.county].filter(Boolean);
  if (parts.length > 0) return parts.slice(0, 2).join(', ');
  if (r.parcel.teryt) return r.parcel.teryt;
  return `${r.parcel.centroid.lat.toFixed(4)}, ${r.parcel.centroid.lng.toFixed(4)}`;
};

export const saveReport = (report: WaterAnalysisReport): SavedReportSummary => {
  initStorage();
  const locationLabel = formatLocationLabel(report);
  const summary: SavedReportSummary = {
    id: report.id,
    createdAt: report.createdAt,
    analysisDate: report.analysisDate,
    teryt: report.parcel.teryt,
    locationLabel,
    areaHa: report.parcel.areaHa,
    cropId: report.cropId,
    cropNamePl: report.cropNamePl,
    currentRiskScore: report.assessment.currentRiskScore,
    currentRiskLevel: report.assessment.currentRiskLevel,
    currentRiskLabelPl: report.assessment.currentRiskLabelPl,
    historicalRiskScore: report.assessment.historicalRiskScore,
    confidencePct: report.limitations.confidencePct,
    kbw60dMm: report.assessment.kbw60dMm,
    iungCategory: report.soil.iungCategory,
  };

  if (sqliteDb) {
    sqliteDb
      .prepare(
        `INSERT INTO reports (
          id, created_at, analysis_date, teryt, location_label, area_ha,
          crop_id, crop_name_pl, current_risk_score, current_risk_level,
          current_risk_label_pl, historical_risk_score, confidence_pct,
          kbw_60d_mm, iung_category, payload_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET payload_json=excluded.payload_json`
      )
      .run(
        summary.id,
        summary.createdAt,
        summary.analysisDate,
        summary.teryt,
        summary.locationLabel,
        summary.areaHa,
        summary.cropId,
        summary.cropNamePl,
        summary.currentRiskScore,
        summary.currentRiskLevel,
        summary.currentRiskLabelPl,
        summary.historicalRiskScore,
        summary.confidencePct,
        summary.kbw60dMm,
        summary.iungCategory,
        JSON.stringify(report)
      );
    return summary;
  }

  memReports.set(report.id, report);
  persistJsonFallback();
  return summary;
};

export const listReports = (limit = 50): SavedReportSummary[] => {
  initStorage();
  if (sqliteDb) {
    const rows = sqliteDb
      .prepare(
        `SELECT id, created_at, analysis_date, teryt, location_label, area_ha,
                crop_id, crop_name_pl, current_risk_score, current_risk_level,
                current_risk_label_pl, historical_risk_score, confidence_pct,
                kbw_60d_mm, iung_category
         FROM reports ORDER BY created_at DESC LIMIT ?`
      )
      .all(limit);
    return rows.map((r: any) => ({
      id: r.id,
      createdAt: r.created_at,
      analysisDate: r.analysis_date,
      teryt: r.teryt ?? null,
      locationLabel: r.location_label,
      areaHa: Number(r.area_ha),
      cropId: r.crop_id,
      cropNamePl: r.crop_name_pl,
      currentRiskScore: Number(r.current_risk_score),
      currentRiskLevel: r.current_risk_level,
      currentRiskLabelPl: r.current_risk_label_pl,
      historicalRiskScore: Number(r.historical_risk_score),
      confidencePct: Number(r.confidence_pct),
      kbw60dMm: r.kbw_60d_mm === null || r.kbw_60d_mm === undefined ? null : Number(r.kbw_60d_mm),
      iungCategory: r.iung_category === null || r.iung_category === undefined ? null : Number(r.iung_category) as any,
    }));
  }

  return Array.from(memReports.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      analysisDate: r.analysisDate,
      teryt: r.parcel.teryt,
      locationLabel: formatLocationLabel(r),
      areaHa: r.parcel.areaHa,
      cropId: r.cropId,
      cropNamePl: r.cropNamePl,
      currentRiskScore: r.assessment.currentRiskScore,
      currentRiskLevel: r.assessment.currentRiskLevel,
      currentRiskLabelPl: r.assessment.currentRiskLabelPl,
      historicalRiskScore: r.assessment.historicalRiskScore,
      confidencePct: r.limitations.confidencePct,
      kbw60dMm: r.assessment.kbw60dMm,
      iungCategory: r.soil.iungCategory,
    }));
};

export const getReportById = (id: string): WaterAnalysisReport | null => {
  initStorage();
  if (sqliteDb) {
    const row = sqliteDb.prepare('SELECT payload_json FROM reports WHERE id = ?').get(id);
    if (!row) return null;
    return JSON.parse(row.payload_json) as WaterAnalysisReport;
  }
  return memReports.get(id) ?? null;
};

export const deleteReportById = (id: string): boolean => {
  initStorage();
  if (sqliteDb) {
    const res = sqliteDb.prepare('DELETE FROM reports WHERE id = ?').run(id);
    return Number(res?.changes ?? 0) > 0;
  }
  const existed = memReports.delete(id);
  if (existed) persistJsonFallback();
  return existed;
};
