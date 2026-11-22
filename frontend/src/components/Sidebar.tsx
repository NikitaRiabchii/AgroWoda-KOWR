import React from 'react';
import { NavLink } from 'react-router-dom';
import { BookOpen, ChevronRight, FolderKanban, LayoutDashboard } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onCloseMobile, collapsed }) => {
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center justify-between px-6 py-4 text-base font-normal transition-colors ${isActive
      ? 'bg-[#1abc9c] text-white font-bold'
      : 'text-[#c2cbd6] hover:text-white hover:bg-[#34495e]/70'
    }`;

  return (
    <>
      {isOpen && (
        <div onClick={onCloseMobile} className="fixed inset-0 z-40 bg-black/50 lg:hidden" />
      )}
      <aside
        className={`no-print fixed top-[76px] left-0 bottom-0 z-40 bg-[#2c3e50] text-[#c2cbd6] flex flex-col transition-all duration-200 overflow-y-auto ${collapsed ? 'w-[300px] lg:w-0 lg:overflow-hidden' : 'w-[300px]'
          } ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <nav className="py-5 flex-1">
          <div className="px-6 pt-2 pb-2.5 text-xs font-bold uppercase tracking-wider text-[#1abc9c]">
            Nawigacja
          </div>
          <NavLink to="/" end onClick={onCloseMobile} className={linkCls}>
            <span className="flex items-center gap-3.5">
              <LayoutDashboard className="h-5 w-5 shrink-0" />
              <span>Analizator Działki</span>
            </span>
          </NavLink>
          <NavLink to="/reports" onClick={onCloseMobile} className={linkCls}>
            <span className="flex items-center gap-3.5">
              <FolderKanban className="h-5 w-5 shrink-0" />
              <span>Zapisane Raporty</span>
            </span>
            <ChevronRight className="h-5 w-5 opacity-60" />
          </NavLink>

          <div className="px-6 pt-7 pb-2.5 text-xs font-bold uppercase tracking-wider text-[#1abc9c]">
            Dokumentacja
          </div>
          <NavLink to="/methodology" onClick={onCloseMobile} className={linkCls}>
            <span className="flex items-center gap-3.5">
              <BookOpen className="h-5 w-5 shrink-0" />
              <span>Metodyka i Źródła</span>
            </span>
            <ChevronRight className="h-5 w-5 opacity-60" />
          </NavLink>
        </nav>
      </aside>
    </>
  );
};
