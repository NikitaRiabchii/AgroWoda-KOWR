import React from 'react';
import type { DailyMeteoRecord, MonthlyVulnerability, YearlyDroughtPoint } from '../types/water';

export const TealWaveChart: React.FC<{ daily: DailyMeteoRecord[]; yearly: YearlyDroughtPoint[] }> = ({ daily, yearly }) => {
  const rawValues: number[] =
    yearly.length >= 4
      ? yearly.map((y) => Math.max(5, y.precip60dMm))
      : daily.length >= 6
        ? daily.filter((_, i) => i % 4 === 0).map((d) => d.precipMm + 2)
        : [20, 45, 30, 70, 55, 85, 40, 60];

  const W = 360;
  const H = 96;
  const padY = 10;
  const minV = Math.min(...rawValues);
  const maxV = Math.max(...rawValues, minV + 10);

  const pts = rawValues.map((v, i) => ({
    x: (i / Math.max(1, rawValues.length - 1)) * W,
    y: H - padY - ((v - minV) / (maxV - minV)) * (H - padY * 2),
  }));

  let linePath = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = Math.max(3, Math.min(H - 3, p1.y + (p2.y - p0.y) / 6));
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = Math.max(3, Math.min(H - 3, p2.y - (p3.y - p1.y) / 6));
    linePath += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  const areaPath = `${linePath} L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-[98px] block">
      <defs>
        <linearGradient id="flatAbleTealGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1abc9c" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#1abc9c" stopOpacity="0.06" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#flatAbleTealGrad)" />
      <path d={linePath} fill="none" stroke="#1abc9c" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
};

export const History10yChart: React.FC<{
  series: YearlyDroughtPoint[];
  iungThresholdMm: number | null;
  highlightYear: number;
}> = ({ series, iungThresholdMm, highlightYear }) => {
  if (!series.length) return null;

  const W = 600;
  const H = 230;
  const padL = 46;
  const padR = 16;
  const padT = 18;
  const padB = 34;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const vals = series.map((s) => s.kbw60dMm);
  if (iungThresholdMm !== null) vals.push(iungThresholdMm);
  const maxVal = Math.max(30, ...vals);
  const minVal = Math.min(-180, ...vals);
  const range = Math.max(10, maxVal - minVal);
  const yOf = (v: number) => padT + ((maxVal - v) / range) * innerH;
  const yZero = yOf(0);
  const barW = Math.min(34, (innerW / series.length) * 0.6);

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[400px]">
        {[-250, -200, -150, -100, -50, 0, 50]
          .filter((v) => v >= minVal - 15 && v <= maxVal + 15)
          .map((v) => (
            <g key={v}>
              <line x1={padL} x2={W - padR} y1={yOf(v)} y2={yOf(v)} stroke={v === 0 ? '#95a5a6' : '#ecf0f5'} strokeWidth={1.2} />
              <text x={padL - 8} y={yOf(v) + 4} textAnchor="end" fontSize="11.5" fill="#7f8c8d">
                {v}
              </text>
            </g>
          ))}

        {series.map((pt, i) => {
          const cx = padL + ((i + 0.5) * innerW) / series.length;
          const yVal = yOf(pt.kbw60dMm);
          const top = Math.min(yZero, yVal);
          const h = Math.max(3, Math.abs(yVal - yZero));
          const isHl = pt.year === highlightYear;
          const fill = pt.exceedsIungThreshold ? '#e74c3c' : pt.kbw60dMm < -60 ? '#f39c12' : '#1abc9c';
          return (
            <g key={pt.year}>
              <rect
                x={cx - barW / 2}
                y={top}
                width={barW}
                height={h}
                rx={2}
                fill={fill}
                opacity={isHl ? 1 : 0.84}
                stroke={isHl ? '#2c3e50' : 'none'}
                strokeWidth={isHl ? 2 : 0}
              />
              <text x={cx} y={H - 8} textAnchor="middle" fontSize="11.5" fontWeight={isHl ? '700' : '600'} fill={isHl ? '#2c3e50' : '#7f8c8d'}>
                {pt.year}
              </text>
            </g>
          );
        })}

        {iungThresholdMm !== null && (
          <g>
            <line
              x1={padL}
              x2={W - padR}
              y1={yOf(iungThresholdMm)}
              y2={yOf(iungThresholdMm)}
              stroke="#e74c3c"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
            <text x={W - padR - 4} y={yOf(iungThresholdMm) - 6} textAnchor="end" fontSize="11.5" fontWeight="700" fill="#e74c3c">
              Próg IUNG ({iungThresholdMm} mm)
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};

export const MonthlyRiskStrip: React.FC<{ profile: MonthlyVulnerability[] }> = ({ profile }) => {
  if (!profile.length) return null;
  return (
    <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mt-3">
      {profile.map((m) => {
        const cls =
          m.riskScore >= 60
            ? 'bg-[#fdecea] text-[#c0392b] border-[#f5c6cb]'
            : m.riskScore >= 38
              ? 'bg-[#fef5e7] text-[#b9770e] border-[#fad7a0]'
              : 'bg-[#e8f8f5] text-[#117a65] border-[#a3e4d7]';
        return (
          <div key={m.month} className={`rounded-[3px] border px-2 py-2.5 text-center ${cls}`}>
            <div className="text-xs font-bold">{m.monthLabelPl}</div>
            <div className="text-sm font-bold tabular-nums mt-0.5">
              {m.avgKbwMm >= 0 ? '+' : ''}{Math.round(m.avgKbwMm)}
            </div>
          </div>
        );
      })}
    </div>
  );
};
