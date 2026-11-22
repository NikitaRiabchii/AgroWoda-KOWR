import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AnalyzerPage } from './pages/AnalyzerPage';
import { SavedReportsPage } from './pages/SavedReportsPage';
import { ReportDetailPage } from './pages/ReportDetailPage';
import { MethodologyPage } from './pages/MethodologyPage';

export const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<AnalyzerPage />} />
        <Route path="/reports" element={<SavedReportsPage />} />
        <Route path="/reports/:id" element={<ReportDetailPage />} />
        <Route path="/methodology" element={<MethodologyPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  </BrowserRouter>
);

export default App;
