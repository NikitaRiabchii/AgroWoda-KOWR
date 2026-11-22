import React, { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Bell, Droplets, Home, Menu } from 'lucide-react';
import api from '../services/api';
import { Sidebar } from './Sidebar';

const PAGE_META: { match: (p: string) => boolean; title: string; crumb: string }[] = [
  { match: (p) => p === '/', title: 'Analiza Wodna Działki', crumb: 'Analiza Wodna Działki' },
  { match: (p) => p === '/reports', title: 'Zapisane Raporty', crumb: 'Zapisane Raporty' },
  { match: (p) => p.startsWith('/reports/'), title: 'Raport Działki', crumb: 'Zapisane Raporty / Szczegóły' },
  { match: (p) => p === '/methodology', title: 'Metodyka i Źródła Danych', crumb: 'Metodyka i Źródła' },
];

export const Layout: React.FC = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [savedCount, setSavedCount] = useState<number>(0);

  useEffect(() => {
    api
      .get('/reports')
      .then((res) => setSavedCount((res.data.reports ?? []).length))
      .catch(() => {});
  }, [location.pathname]);

  const meta = PAGE_META.find((m) => m.match(location.pathname)) ?? PAGE_META[0];

  return (
    <div className="min-h-screen bg-[#ecf0f5] text-[#37474f]">
      {/* Ciemny górny pasek nawigacyjny (76px, #263544) */}
      <header className="fa-topbar no-print fixed top-0 left-0 right-0 z-50 h-[76px] bg-[#263544] text-white flex items-center justify-between shadow-sm">
        <div className="flex items-center h-full">
          <div className="w-[300px] h-full px-6 flex items-center justify-between bg-[#263544] shrink-0">
            <Link to="/" className="flex items-center gap-3 text-white no-underline">
              <div className="h-10 w-10 rounded-full bg-white text-[#263544] flex items-center justify-center shrink-0">
                <Droplets className="h-6 w-6 text-[#1abc9c]" />
              </div>
              <span className="text-lg font-bold tracking-wider uppercase">AGROWODA</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                if (window.innerWidth < 1024) setMobileOpen((v) => !v);
                else setCollapsed((v) => !v);
              }}
              className="p-2 text-[#c2cbd6] hover:text-white transition"
              title="Przełącz menu"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-7 pl-6 text-sm font-semibold text-[#c2cbd6]">
            <Link to="/" className="hover:text-white transition">Nowa analiza</Link>
            <Link to="/reports" className="hover:text-white transition">Raporty</Link>
            <Link to="/methodology" className="hover:text-white transition">Źródła danych</Link>
          </div>
        </div>

        <div className="pr-7 flex items-center gap-4">
          <Link
            to="/reports"
            className="relative p-2.5 text-[#c2cbd6] hover:text-white transition"
            title="Zapisane raporty gospodarstwa"
          >
            <Bell className="h-6 w-6" />
            {savedCount > 0 && (
              <span className="absolute top-0 right-0 min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#e74c3c] text-white text-xs font-bold flex items-center justify-center">
                {savedCount > 99 ? '99+' : savedCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      <Sidebar isOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} collapsed={collapsed} />

      <div className={`pt-[76px] transition-all duration-200 ${collapsed ? 'lg:pl-0' : 'lg:pl-[300px]'}`}>
        <main className="print-full p-6 sm:p-8 w-full mx-auto">
          <div className="no-print mb-6">
            <h1 className="text-2xl font-bold text-[#37474f] leading-tight">{meta.title}</h1>
            <div className="flex items-center gap-2 text-sm text-[#7f8c8d] mt-1.5">
              <Home className="h-4 w-4" />
              <span>/</span>
              <span>{meta.crumb}</span>
            </div>
          </div>

          <Outlet />
        </main>
      </div>
    </div>
  );
};
