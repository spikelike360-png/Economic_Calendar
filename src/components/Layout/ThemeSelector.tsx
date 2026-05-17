'use client';

import { useState, useEffect, useRef } from 'react';
import { Settings, X } from 'lucide-react';
import { THEMES, THEME_META, readTheme, applyTheme, type Theme } from '@/lib/theme';

export default function ThemeSelector() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<Theme>('bloomberg');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrent(readTheme());
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const select = (t: Theme) => {
    applyTheme(t);
    setCurrent(t);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-2 w-full text-left text-amber-700 hover:text-amber-400 hover:bg-amber-500/5 transition-colors"
        title="Theme settings"
      >
        <Settings className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[11px] font-bold uppercase tracking-wider">THEME</span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-48 bg-[#050505] border border-[--th-border,rgb(120_53_15_/_0.4)] z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[--th-border,rgb(120_53_15_/_0.4)]">
            <span className="text-[10px] font-bold text-[--th-main,#fbbf24] uppercase tracking-widest">COLOR THEME</span>
            <button onClick={() => setOpen(false)} className="text-slate-600 hover:text-slate-400">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="p-2 flex flex-col gap-0.5">
            {THEMES.map((t) => {
              const meta = THEME_META[t];
              const active = t === current;
              return (
                <button
                  key={t}
                  onClick={() => select(t)}
                  className={`flex items-center gap-2.5 px-2 py-1.5 text-left w-full transition-colors ${
                    active ? 'bg-[--th-bg,rgba(245,158,11,0.12)]' : 'hover:bg-white/5'
                  }`}
                >
                  <span
                    className="w-3 h-3 shrink-0 border border-white/20"
                    style={{ backgroundColor: meta.accent }}
                  />
                  <div>
                    <p className={`text-[11px] font-bold uppercase tracking-wider leading-none ${active ? 'text-[--th-bright,#fcd34d]' : 'text-slate-400'}`}>
                      {meta.label}
                    </p>
                    <p className="text-[9px] text-slate-700 mt-0.5 uppercase tracking-wider">{meta.desc}</p>
                  </div>
                  {active && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: meta.accent }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
