import React, { useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CloudRain,
  Droplets,
  FileSpreadsheet,
  Layers,
  Leaf,
  Loader2,
  Mountain,
  Printer,
  Satellite,
  ShieldCheck,
  Sprout,
  Star,
  Trophy,
  Waves,
} from 'lucide-react';
import api from '../services/api';
import type { Recommendation, WaterAnalysisReport } from '../types/water';
import { Badge, FlatCard, btnOutline, btnTeal } from './ui';
import { ParcelMap } from './ParcelMap';
import { History10yChart, MonthlyRiskStrip, TealWaveChart } from './WaterCharts';

const PRIO_PILL: Record<Recommendation['priority'], { cls: string; label: string }> = {
  wysoki: { cls: 'bg-[#fdecea] text-[#e74c3c]', label: 'Wysoki' },
  sredni: { cls: 'bg-[#d4f5ee] text-[#16a085]', label: 'Średni' },
  uzupelniajacy: { cls: 'bg-[#e8f6e9] text-[#27ae60]', label: 'Niski' },
};

const CAUSE_CIRCLE_STYLE: Record<string, { bg: string; icon: React.ReactNode }> = {
  klimat: { bg: 'bg-[#38b2f6]', icon: <CloudRain className="h-6 w-6 text-white" /> },
  gleba: { bg: 'bg-[#e74c3c]', icon: <Layers className="h-6 w-6 text-white" /> },
  topografia: { bg: 'bg-[#f39c12]', icon: <Mountain className="h-6 w-6 text-white" /> },
  krajobraz: { bg: 'bg-[#3b5998]', icon: <Waves className="h-6 w-6 text-white" /> },
  uprawa: { bg: 'bg-[#1abc9c]', icon: <Sprout className="h-6 w-6 text-white" /> },
};

const HORIZON_SHORT: Record<Recommendation['horizonPl'], string> = {
  natychmiast: 'Od zaraz',
  ten_sezon: 'Ten sezon',
  wieloletnie: 'Wieloletnie',
};

export const ReportView: React.FC<{ report: WaterAnalysisReport; onError?: (msg: string) => void }> = ({ report, onError }) => {
  const [downloadingXlsx, setDownloadingXlsx] = useState(false);

  const downloadExcel = async () => {
    setDownloadingXlsx(true);
    try {
      const res = await api.get(`/reports/${report.id}/export.xlsx`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      const safe = (report.parcel.teryt ?? 'dzialka').replace(/[^A-Za-z0-9_.-]+/g, '_');
      a.download = `AgroWoda_${safe}_${report.analysisDate}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      onError?.('Nie udało się wygenerować arkusza Excel.');
    } finally {
      setDownloadingXlsx(false);
    }
  };

  const allRecommendations: Recommendation[] = [
    ...report.retentionRecommendations,
    ...report.agrotechRecommendations,
  ];

  const locationStr = [report.parcel.region, report.parcel.commune, report.parcel.voivodeship]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="space-y-7">
      {/* RZĄD 1 — 3 KOLUMNY FLAT ABLE (DUŻE ELEMENTY) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* KOLUMNA 1 */}
        <div className="flex flex-col gap-6">
          <div className="fa-card grid grid-cols-2 divide-x divide-y divide-[#edf0f5]">
            <div className="p-6 flex items-center gap-4">
              <Droplets className="h-9 w-9 text-[#1abc9c] shrink-0 stroke-[1.7]" />
              <div className="min-w-0">
                <div className="text-2xl font-bold text-[#37474f] tabular-nums leading-tight">
                  {report.assessment.kbw60dMm !== null ? `${report.assessment.kbw60dMm >= 0 ? '+' : ''}${report.assessment.kbw60dMm} mm` : '—'}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#7f8c8d] mt-1">KBW 60 dni</div>
              </div>
            </div>

            <div className="p-6 flex items-center gap-4">
              <CloudRain className="h-9 w-9 text-[#e74c3c] shrink-0 stroke-[1.7]" />
              <div className="min-w-0">
                <div className="text-2xl font-bold text-[#37474f] tabular-nums leading-tight">
                  {report.meteo.available ? `${report.meteo.current.precip30dMm} mm` : '—'}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#7f8c8d] mt-1">Opad 30 dni</div>
              </div>
            </div>

            <div className="p-6 flex items-center gap-4">
              <Layers className="h-9 w-9 text-[#1abc9c] shrink-0 stroke-[1.7]" />
              <div className="min-w-0">
                <div className="text-2xl font-bold text-[#37474f] tabular-nums leading-tight">
                  {report.soil.awc60cmMm !== null ? `${report.soil.awc60cmMm} mm` : 'Brak'}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#7f8c8d] mt-1">Retencja AWC</div>
              </div>
            </div>

            <div className="p-6 flex items-center gap-4">
              <Leaf className="h-9 w-9 text-[#f1c40f] shrink-0 stroke-[1.7]" />
              <div className="min-w-0">
                <div className="text-2xl font-bold text-[#37474f] tabular-nums leading-tight">
                  {report.soil.humusPct !== null ? `${report.soil.humusPct}%` : 'Brak'}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#7f8c8d] mt-1">Próchnica</div>
              </div>
            </div>
          </div>

          <div className="rounded-[4px] overflow-hidden shadow-xs flex bg-[#1abc9c] text-white min-h-[110px]">
            <div className="w-[100px] bg-[#16a085] flex items-center justify-center shrink-0">
              <Star className="h-9 w-9 text-white fill-white" />
            </div>
            <div className="px-6 py-4 flex flex-col justify-center min-w-0">
              <div className="text-3xl font-bold leading-tight tabular-nums">
                {report.assessment.currentRiskScore} / 100
              </div>
              <div className="text-base text-white/95 truncate mt-1">
                {report.assessment.currentRiskLabelPl}
              </div>
            </div>
          </div>
        </div>

        {/* KOLUMNA 2 */}
        <div className="flex flex-col gap-6">
          <div className="fa-card grid grid-cols-2 divide-x divide-y divide-[#edf0f5]">
            <div className="p-6 flex items-center gap-4">
              <Satellite className="h-9 w-9 text-[#1abc9c] shrink-0 stroke-[1.7]" />
              <div className="min-w-0">
                <div className="text-2xl font-bold text-[#37474f] tabular-nums leading-tight">
                  {report.satellite.available && report.satellite.ndvi ? report.satellite.ndvi.mean.toFixed(2) : 'Chmury'}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#7f8c8d] mt-1">Sentinel-2 NDVI</div>
              </div>
            </div>

            <div className="p-6 flex items-center gap-4">
              <Waves className="h-9 w-9 text-[#1abc9c] shrink-0 stroke-[1.7]" />
              <div className="min-w-0">
                <div className="text-2xl font-bold text-[#37474f] tabular-nums leading-tight">
                  {report.satellite.available && report.satellite.ndmi ? report.satellite.ndmi.mean.toFixed(2) : 'Brak'}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#7f8c8d] mt-1">Sentinel-2 NDMI</div>
              </div>
            </div>

            <div className="p-6 flex items-center gap-4">
              <Mountain className="h-9 w-9 text-[#1abc9c] shrink-0 stroke-[1.7]" />
              <div className="min-w-0">
                <div className="text-2xl font-bold text-[#37474f] tabular-nums leading-tight">
                  {report.elevation.available && report.elevation.meanSlopePct !== null ? `${report.elevation.meanSlopePct}%` : '—'}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#7f8c8d] mt-1">Spadek NMT</div>
              </div>
            </div>

            <div className="p-6 flex items-center gap-4">
              <Calendar className="h-9 w-9 text-[#1abc9c] shrink-0 stroke-[1.7]" />
              <div className="min-w-0">
                <div className="text-2xl font-bold text-[#37474f] tabular-nums leading-tight">
                  {report.meteo.historical10y.droughtYearsCount} / {Math.min(10, report.meteo.yearsAnalyzed || 10)}
                </div>
                <div className="text-xs font-bold uppercase tracking-wider text-[#7f8c8d] mt-1">Lata suszy (10l)</div>
              </div>
            </div>
          </div>

          <div className="rounded-[4px] overflow-hidden shadow-xs flex bg-[#2ecc71] text-white min-h-[110px]">
            <div className="w-[100px] bg-[#27ae60] flex items-center justify-center shrink-0">
              <Trophy className="h-9 w-9 text-white" />
            </div>
            <div className="px-6 py-4 flex flex-col justify-center min-w-0">
              <div className="text-3xl font-bold leading-tight tabular-nums">
                {report.limitations.confidencePct}%
              </div>
              <div className="text-base text-white/95 truncate mt-1">
                Pewność danych • {report.soil.iungCategory ? `Gleba kat. ${['', 'I', 'II', 'III', 'IV'][report.soil.iungCategory]}` : 'Brak SoilGrids'}
              </div>
            </div>
          </div>
        </div>

        {/* KOLUMNA 3 */}
        <div className="fa-card flex flex-col justify-between overflow-hidden">
          <div className="px-6 pt-6 pb-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-2xl font-bold text-[#37474f] leading-tight tabular-nums">
                  {report.parcel.teryt ?? `${report.parcel.areaHa} ha`}
                </div>
                <div className="text-sm font-bold text-[#1abc9c] mt-1">
                  {report.cropNamePl} • {report.analysisDate}
                </div>
              </div>
              <span className="text-xs text-[#7f8c8d] shrink-0 pt-1 font-semibold">
                {(report.executionTimeMs / 1000).toFixed(1)} s
              </span>
            </div>
            <p className="text-sm leading-relaxed text-[#5d6d7e] mt-3 line-clamp-3">
              {report.assessment.executiveSummaryPl}
            </p>
          </div>

          <div className="mt-3">
            <TealWaveChart daily={report.meteo.daily60d} yearly={report.meteo.historical10y.yearlySeries} />
            <div className="bg-[#1abc9c] text-white grid grid-cols-3 text-center py-4 px-3">
              <div>
                <div className="text-xl font-bold tabular-nums">{report.assessment.iungThresholdUsedMm ?? '—'}</div>
                <div className="text-xs text-white/90 mt-0.5">Próg IUNG</div>
              </div>
              <div>
                <div className="text-xl font-bold tabular-nums">{report.meteo.current.consecutiveDryDays} d</div>
                <div className="text-xs text-white/90 mt-0.5">Bez opadu</div>
              </div>
              <div>
                <div className="text-xl font-bold tabular-nums">{report.parcel.areaHa} ha</div>
                <div className="text-xs text-white/90 mt-0.5 truncate px-1">{locationStr.split(',')[0] || 'Działka'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RZĄD 2 — TABELA REKOMENDACJI + OŚ PRZYCZYN */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <FlatCard
          className="xl:col-span-7"
          title="Rekomendacje działań (Retencja → Agrotechnika → Nawadnianie)"
          subtitle="Priorytetem jest zatrzymanie wody na działce (NWRM), następnie agrotechnika i opcjonalne nawadnianie"
          bodyClassName="p-0"
          actions={
            <div className="no-print flex items-center gap-3">
              <button type="button" onClick={downloadExcel} disabled={downloadingXlsx} className={btnOutline}>
                {downloadingXlsx ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileSpreadsheet className="h-5 w-5 text-[#1abc9c]" />}
                Excel
              </button>
              <button type="button" onClick={() => window.print()} className={btnTeal}>
                <Printer className="h-5 w-5" /> PDF / Drukuj
              </button>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#edf0f5] text-xs font-bold uppercase tracking-wider text-[#6c757d]">
                  <th className="px-6 py-4">Zalecane działanie i uzasadnienie z danych</th>
                  <th className="px-4 py-4 whitespace-nowrap">Etap</th>
                  <th className="px-4 py-4 whitespace-nowrap">Termin</th>
                  <th className="px-5 py-4 text-right">Priorytet</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f5] text-sm">
                {allRecommendations.map((rec) => {
                  const pill = PRIO_PILL[rec.priority];
                  return (
                    <tr key={rec.id} className="hover:bg-[#fafcfd] transition align-top break-inside-avoid">
                      <td className="px-6 py-5">
                        <div className="font-bold text-[#37474f] text-base">{rec.titlePl}</div>
                        <div className="text-sm text-[#5d6d7e] mt-1.5 leading-relaxed">{rec.descriptionPl}</div>
                        <div className="text-xs text-[#16a085] mt-2 font-semibold">
                          Dane: {rec.dataJustificationPl}
                        </div>
                      </td>
                      <td className="px-4 py-5 text-sm text-[#55606e] whitespace-nowrap font-semibold">
                        {rec.stage === 'retencja_krajobrazowa'
                          ? 'Retencja krajobraz.'
                          : rec.stage === 'retencja_glebowa'
                            ? 'Retencja glebowa'
                            : 'Agrotechnika'}
                      </td>
                      <td className="px-4 py-5 text-sm text-[#6c757d] whitespace-nowrap">
                        {HORIZON_SHORT[rec.horizonPl]}
                      </td>
                      <td className="px-5 py-5 text-right whitespace-nowrap">
                        <Badge className={pill.cls}>{pill.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-5 bg-[#f8fafc] border-t border-[#edf0f5] break-inside-avoid">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#1abc9c]">
                Etap 5 (Opcjonalnie): Nawadnianie — {report.irrigationAdvice.decisionLabelPl}
              </span>
              {report.irrigationAdvice.recommendedDoseMm !== null && (
                <span className="text-sm font-bold text-[#37474f]">
                  Dawka: {report.irrigationAdvice.recommendedDoseMm} mm ({report.irrigationAdvice.recommendedVolumeM3PerHa} m³/ha • {report.irrigationAdvice.totalParcelVolumeM3} m³)
                </span>
              )}
            </div>
            <p className="text-sm text-[#55606e] leading-relaxed">
              {report.irrigationAdvice.headlinePl} {report.irrigationAdvice.forecastConsiderationPl}
            </p>
          </div>
        </FlatCard>

        <FlatCard
          className="xl:col-span-5"
          title="Przyczyny ograniczonej dostępności wody"
          subtitle="Udział poszczególnych czynników obliczony na podstawie pobranych danych"
        >
          <div className="relative space-y-6">
            {report.causes.map((cause, idx) => {
              const style = CAUSE_CIRCLE_STYLE[cause.category] ?? CAUSE_CIRCLE_STYLE.klimat;
              return (
                <div key={cause.id} className="relative flex items-start gap-4 break-inside-avoid">
                  <div className="w-14 pt-3 text-right text-sm font-bold text-[#7f8c8d] shrink-0 tabular-nums">
                    {cause.contributionPct}%
                  </div>

                  <div className="relative flex flex-col items-center shrink-0">
                    <div className={`h-12 w-12 rounded-full ${style.bg} flex items-center justify-center shadow-xs z-10`}>
                      {style.icon}
                    </div>
                    {idx < report.causes.length - 1 && (
                      <div className="w-[2px] h-full min-h-[48px] bg-[#edf0f5] absolute top-12" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 pb-1">
                    <div className="text-base font-bold text-[#37474f] leading-snug">{cause.titlePl}</div>
                    <p className="text-sm text-[#5d6d7e] mt-1.5 leading-relaxed">{cause.explanationPl}</p>
                    {cause.evidencePl[0] && (
                      <div className="text-xs text-[#7f8c8d] mt-1.5">{cause.evidencePl[0]}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 pt-5 border-t border-[#edf0f5] text-sm text-[#55606e] leading-relaxed">
            <strong className="text-[#37474f]">Satelita Sentinel-2 ({report.satellite.sceneDate ?? 'brak sceny'}):</strong>{' '}
            {report.satellite.interpretationPl}
          </div>
        </FlatCard>
      </div>

      {/* RZĄD 3 — MAPA + HISTORIA 10-LETNIA I ŹRÓDŁA */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <FlatCard
          className="xl:col-span-6 break-inside-avoid"
          title="Mapa działki, spływu (NMT) i okresu krytycznego (10 lat)"
          subtitle={`Szczyt ryzyka w 10-leciu: ${report.meteo.historical10y.peakRiskPeriodPl}`}
        >
          <ParcelMap
            parcel={report.parcel}
            elevation={report.elevation}
            hydrology={report.hydrology}
            interactive={false}
            height="420px"
          />
          <div className="mt-5">
            <div className="text-xs font-bold uppercase tracking-wider text-[#7f8c8d]">
              Średni miesięczny bilans KBW (mm) z 10 lat — Mar–Paź
            </div>
            <MonthlyRiskStrip profile={report.meteo.historical10y.monthlyProfile} />
          </div>
        </FlatCard>

        <FlatCard
          className="xl:col-span-6 break-inside-avoid"
          title="Historia 10-letnia KBW₆₀ oraz źródła i ograniczenia raportu"
          subtitle={`Wygenerowano: ${new Date(report.createdAt).toLocaleString('pl-PL')} • ${report.limitations.confidenceLabelPl}`}
        >
          <History10yChart
            series={report.meteo.historical10y.yearlySeries}
            iungThresholdMm={report.assessment.iungThresholdUsedMm}
            highlightYear={Number(report.analysisDate.slice(0, 4))}
          />

          {report.limitations.missingDataPl.length > 0 && (
            <div className="mt-4 p-4 rounded-[4px] bg-[#fef5e7] border-l-4 border-[#f39c12] text-sm text-[#7e5109] space-y-1">
              <div className="font-bold flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> Braki danych w tej analizie:
              </div>
              {report.limitations.missingDataPl.map((m, i) => (
                <div key={i}>• {m}</div>
              ))}
            </div>
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-[#edf0f5] text-xs font-bold uppercase text-[#7f8c8d]">
                  <th className="py-3 pr-3">Źródło</th>
                  <th className="py-3 px-3">Zakres</th>
                  <th className="py-3 pl-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f5]">
                {report.provenance.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 pr-3 font-semibold text-[#37474f]">{p.name}</td>
                    <td className="py-3 px-3 text-[#6c757d]">{p.dataRange}</td>
                    <td className="py-3 pl-3 text-right whitespace-nowrap">
                      <Badge
                        className={
                          p.status === 'live'
                            ? 'bg-[#d4f5ee] text-[#16a085]'
                            : p.status === 'partial'
                              ? 'bg-[#fef5e7] text-[#b9770e]'
                              : 'bg-[#fdecea] text-[#e74c3c]'
                        }
                      >
                        {p.statusLabelPl}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 pt-4 border-t border-[#edf0f5] text-xs text-[#7f8c8d] flex items-start gap-2 leading-relaxed">
            <ShieldCheck className="h-5 w-5 text-[#1abc9c] shrink-0 mt-0.5" />
            <span>
              Ograniczenia: siatka meteo (~9–50 km) nie obejmuje punktowych burz, SoilGrids (250 m) nie zastępuje badania laboratoryjnego gleby, a model nie uwzględnia stanu podziemnej sieci drenarskiej ani lokalnego poziomu wód gruntowych &gt;1 m.
            </span>
          </div>
        </FlatCard>
      </div>
    </div>
  );
};
