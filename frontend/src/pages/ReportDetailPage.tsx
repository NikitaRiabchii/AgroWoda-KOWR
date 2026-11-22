import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '../services/api';
import { apiError, type WaterAnalysisReport } from '../types/water';
import { ReportView } from '../components/ReportView';
import { FlatCard, Toast, useToast } from '../components/ui';

export const ReportDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { toast, show } = useToast();
  const [report, setReport] = useState<WaterAnalysisReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/reports/${id}`)
      .then((res) => setReport(res.data.report))
      .catch((err) => show('error', apiError(err, 'Nie udało się otworzyć raportu.')))
      .finally(() => setLoading(false));
  }, [id, show]);

  return (
    <div className="space-y-4">
      <Toast toast={toast} />
      <div className="no-print">
        <Link to="/reports" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1abc9c] hover:underline">
          <ArrowLeft className="h-3.5 w-3.5" /> Wróć do zapisanych raportów
        </Link>
      </div>
      {loading ? (
        <div className="py-16 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#1abc9c]" />
        </div>
      ) : report ? (
        <ReportView report={report} onError={(m) => show('error', m)} />
      ) : (
        <FlatCard>
          <p className="text-xs text-[#868e96] text-center py-6">Nie znaleziono raportu.</p>
        </FlatCard>
      )}
    </div>
  );
};
