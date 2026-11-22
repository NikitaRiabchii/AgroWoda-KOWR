import type { LatLng } from '../types/water';

export interface XY {
  x: number;
  y: number;
}

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_EQ = 111_320;

/**
 * Lokalna projekcja równoodległościowa (metry) wokół punktu odniesienia.
 * Dla obszarów o rozmiarze kilkunastu km błąd jest pomijalny.
 */
export class LocalProjection {
  private readonly cosLat: number;

  constructor(private readonly lat0: number, private readonly lng0: number) {
    this.cosLat = Math.cos((lat0 * Math.PI) / 180);
  }

  toXY([lat, lng]: LatLng): XY {
    return {
      x: (lng - this.lng0) * this.cosLat * M_PER_DEG_LNG_EQ,
      y: (lat - this.lat0) * M_PER_DEG_LAT,
    };
  }

  toLatLng({ x, y }: XY): LatLng {
    return [this.lat0 + y / M_PER_DEG_LAT, this.lng0 + x / (this.cosLat * M_PER_DEG_LNG_EQ)];
  }
}

export const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};

export const signedArea = (poly: XY[]): number => {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
};

export const polygonArea = (poly: XY[]): number => (poly.length < 3 ? 0 : Math.abs(signedArea(poly)));

export const polygonCentroid = (poly: XY[]): XY => {
  const a = signedArea(poly);
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
};

export const pointInPolygon = (p: XY, poly: XY[]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};
