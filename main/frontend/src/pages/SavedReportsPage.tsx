import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSpreadsheet, Loader2, Plus, Trash2 } from 'lucide-react';
import api from '../services/api';
import { apiError, type SavedReportSummary, type WaterAnalysisReport } from '../types/water';
import { Badge, FlatCard, Toast, btnOutline, btnTeal, useToast } from '../components/ui';

const RISK_PILL: Record<string, string> = {
  optymalny: 'bg-[#d4f5ee] text-[#16a085]',
  umiarkowany: 'bg-[#e8f6e9] text-[#27ae60]',
  podwyzszony: 'bg-[#fef5e7] text-[#b9770e]',
  wysoki: 'bg-[#fdecea] text-[#e74c3c]',
  krytyczny: 'bg-[#fdecea] text-[#c0392b] font-bold',
};

export const SavedReportsPage: React.FC = () => {
  const { toast, show } = useToast();
  const [reports, setReports] = useState<SavedReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compared, setCompared] = useState<WaterAnalysisReport[]>([]);

  useEffect(() => {
    api
      .get('/reports')
      .then((res) => setReports(res.data.reports ?? []))
      .catch((err) => show('error', apiError(err, 'Nie udało się pobrać listy raportów.')))
      .finally(() => setLoading(false));
  }, [show]);

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/reports/${id}`);
      setReports((prev) => prev.filter((r) => r.id !== id));
      setSelectedIds((prev) => prev.filter((x) => x !== id));
      setCompared((prev) => prev.filter((x) => x.id !== id));
      show('success', 'Raport został usunięty.');
    } catch (err) {
      show('error', apiError(err, 'Błąd usuwania raportu.'));
    }
  };

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 4 ? [...prev, id] : prev));

  const handleCompare = async () => {
    if (selectedIds.length < 2) return;
    try {
      const data = await Promise.all(selectedIds.map((id) => api.get(`/reports/${id}`).then((r) => r.data.report as WaterAnalysisReport)));
      setCompared(data);
    } catch {
      show('error', 'Nie udało się załadować raportów do porównania.');
    }
  };

  return (
    <div className="space-y-6">
      <Toast toast={toast} />

      <FlatCard
        title="Zapisane analizy działek"
        bodyClassName="p-0"
        actions={
          <>
            {selectedIds.length >= 2 && (
              <button type="button" onClick={handleCompare} className={btnOutline}>
                Porównaj ({selectedIds.length})
              </button>
            )}
            <Link to="/" className={btnTeal}>
              <Plus className="h-4 w-4" /> Nowa analiza
            </Link>
          </>
        }
      >
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#1abc9c]" />
          </div>
        ) : reports.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#7f8c8d] space-y-4">
            <p>Brak zapisanych raportów.</p>
            <Link to="/" className={btnTeal}>Przeprowadź pierwszą analizę</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#edf0f5] text-xs font-bold uppercase tracking-wider text-[#6c757d]">
                  <th className="px-5 py-4 w-10" />
                  <th className="px-5 py-4">Działka</th>
                  <th className="px-5 py-4">Uprawa</th>
                  <th className="px-5 py-4">Data</th>
                  <th className="px-5 py-4">KBW 60d</th>
                  <th className="px-5 py-4">Ryzyko</th>
                  <th className="px-5 py-4 text-right">Akcje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf0f5] text-sm">
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-[#fafcfd] transition">
                    <td className="px-5 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(r.id)}
                        onChange={() => toggleSelect(r.id)}
                        className="h-4 w-4 accent-[#1abc9c]"
                      />
                    </td>
                    <td className="px-5 py-4">
                      <Link to={`/reports/${r.id}`} className="font-bold text-[#37474f] hover:text-[#1abc9c] text-[15px]">
                        {r.teryt ?? 'Punkt z mapy'}
                      </Link>
                      <div className="text-xs text-[#7f8c8d] mt-0.5">{r.locationLabel} • {r.areaHa} ha</div>
                    </td>
                    <td className="px-5 py-4 text-[#55606e] font-medium">{r.cropNamePl}</td>
                    <td className="px-5 py-4 tabular-nums text-[#6c757d]">{r.analysisDate}</td>
                    <td className="px-5 py-4 tabular-nums font-bold">
                      {r.kbw60dMm !== null ? `${r.kbw60dMm >= 0 ? '+' : ''}${r.kbw60dMm} mm` : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <Badge className={RISK_PILL[r.currentRiskLevel] ?? ''}>
                        {r.currentRiskScore}/100 • {r.currentRiskLabelPl}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3">
                        <Link to={`/reports/${r.id}`} className="text-[#1abc9c] hover:underline font-semibold">
                          Otwórz
                        </Link>
                        <a href={`/api/reports/${r.id}/export.xlsx`} className="text-[#55606e] hover:text-[#1abc9c]" title="Excel">
                          <FileSpreadsheet className="h-5 w-5" />
                        </a>
                        <button type="button" onClick={() => handleDelete(r.id)} className="text-[#95a5a6] hover:text-[#e74c3c]" title="Usuń">
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </FlatCard>

      {compared.length >= 2 && (
        <FlatCard title="Porównanie wybranych działek (priorytet retencji)">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {compared
              .slice()
              .sort((a, b) => b.assessment.currentRiskScore - a.assessment.currentRiskScore)
              .map((rep, idx) => (
                <div key={rep.id} className="border border-[#edf0f5] rounded-[3px] p-5 bg-[#fafcfd] space-y-2.5 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold uppercase text-[#7f8c8d]">Priorytet #{idx + 1}</span>
                    <Badge className={RISK_PILL[rep.assessment.currentRiskLevel] ?? ''}>{rep.assessment.currentRiskScore}/100</Badge>
                  </div>
                  <div className="font-bold text-[#37474f] text-[15px]">{rep.parcel.teryt ?? 'Działka'}</div>
                  <div className="text-xs text-[#7f8c8d]">{rep.cropNamePl} • {rep.analysisDate}</div>
                  <div className="pt-2.5 border-t border-[#edf0f5] space-y-1.5">
                    <div className="flex justify-between"><span>KBW 60d:</span><strong>{rep.assessment.kbw60dMm ?? '—'} mm</strong></div>
                    <div className="flex justify-between"><span>Susze (10l):</span><strong>{rep.meteo.historical10y.droughtYearsCount}/10</strong></div>
                    <div className="flex justify-between"><span>AWC gleby:</span><strong>{rep.soil.awc60cmMm ?? '—'} mm</strong></div>
                    <div className="flex justify-between"><span>Spadek NMT:</span><strong>{rep.elevation.meanSlopePct ?? '—'}%</strong></div>
                  </div>
                </div>
              ))}
          </div>
        </FlatCard>
      )}
    </div>
  );
};
