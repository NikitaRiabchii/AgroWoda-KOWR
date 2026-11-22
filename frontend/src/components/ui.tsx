import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';

export type ToastState = { type: 'success' | 'error'; message: string } | null;

export const useToast = () => {
  const [toast, setToast] = useState<ToastState>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const show = useCallback((type: 'success' | 'error', message: string) => setToast({ type, message }), []);
  return { toast, show };
};

export const Toast: React.FC<{ toast: ToastState }> = ({ toast }) => {
  if (!toast) return null;
  return (
    <div
      className={`no-print fixed bottom-6 right-6 z-[2000] max-w-xl flex items-start gap-3 px-6 py-4 rounded-[4px] shadow-xl text-base font-semibold border-l-4 ${
        toast.type === 'success'
          ? 'bg-white border-l-[#1abc9c] text-[#37474f]'
          : 'bg-white border-l-[#e74c3c] text-[#c0392b]'
      }`}
    >
      {toast.type === 'success' ? (
        <CheckCircle2 className="h-6 w-6 text-[#1abc9c] shrink-0 mt-0.5" />
      ) : (
        <XCircle className="h-6 w-6 text-[#e74c3c] shrink-0 mt-0.5" />
      )}
      <span>{toast.message}</span>
    </div>
  );
};

export const Badge: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <span className={`inline-flex items-center px-3 py-1 rounded-[3px] text-xs font-bold tracking-tight ${className}`}>
    {children}
  </span>
);

export const FlatCard: React.FC<{
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, actions, className = '', bodyClassName = 'p-6', children }) => (
  <section className={`fa-card ${className}`}>
    {(title || actions) && (
      <div className="px-6 py-5 border-b border-[#edf0f5] flex flex-wrap items-center justify-between gap-3">
        <div>
          {title && <h2 className="text-lg font-bold text-[#37474f] leading-snug">{title}</h2>}
          {subtitle && <p className="text-sm text-[#7f8c8d] mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    )}
    <div className={bodyClassName}>{children}</div>
  </section>
);

export const btnTeal =
  'inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-[4px] bg-[#1abc9c] hover:bg-[#16a085] disabled:opacity-50 disabled:cursor-not-allowed text-white text-base font-bold transition cursor-pointer';
export const btnOutline =
  'inline-flex items-center justify-center gap-2 px-5 py-3 rounded-[4px] bg-white hover:bg-[#f8fafc] disabled:opacity-50 border-2 border-[#d5dce3] text-[#37474f] text-sm font-bold transition cursor-pointer';
export const inputCls =
  'w-full px-4 py-3.5 rounded-[4px] border-2 border-[#d5dce3] bg-white text-base text-[#37474f] focus:outline-none focus:border-[#1abc9c] transition';
export const labelCls = 'block text-xs font-bold uppercase tracking-wider text-[#6c757d] mb-2';
