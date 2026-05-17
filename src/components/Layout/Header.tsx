'use client';

import { useEffect, useState } from 'react';
import type { Section } from './Sidebar';

const SECTION_CODE: Record<Section, string> = {
  calendar:    'CAL',
  metrics:     'MAC',
  news:        'NEWS',
  cot:         'COT',
  seasonality: 'SEA',
  earnings:    'ERN',
  options:     'OPT',
  gex:         'GEX',
  notes:       'NTS',
};

const SECTION_TITLE: Record<Section, string> = {
  calendar:    'ECONOMIC CALENDAR',
  metrics:     'MACRO METRICS',
  news:        'NEWS FEED',
  cot:         'COMMITMENT OF TRADERS',
  seasonality: 'SEASONALITY',
  earnings:    'EARNINGS CALENDAR',
  options:     'OPTION FLOW',
  gex:         'GEX INTELLIGENCE',
  notes:       'NOTES',
};

const SECTION_SUB: Record<Section, string> = {
  calendar:    'Forex Factory · USD EUR GBP JPY CAD AUD',
  metrics:     'Interest Rate · Inflation · Unemployment · GDP',
  news:        'Yahoo Finance · CNBC · MarketWatch · RSS',
  cot:         'CFTC Legacy Futures · Non-Comm / Comm / Non-Rept',
  seasonality: '20Y avg monthly returns · FX pairs',
  earnings:    'Nasdaq · EPS estimate vs actual · ≥$2B cap',
  options:     'CBOE VIX · Yahoo Finance · SPY QQQ IWM GLD TLT',
  gex:         'GEXbot Classic · SPX NDX · 0DTE · Breakout Probability · Gamma Flip',
  notes:       'Local storage · private',
};

interface Props {
  activeSection: Section;
}

export default function Header({ activeSection }: Props) {
  const [clock, setClock] = useState('');
  const [date, setDate] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const timeStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false,
      }).format(now);
      const dateStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      }).format(now).toUpperCase();
      setClock(timeStr);
      setDate(dateStr);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="shrink-0 border-b border-amber-900/40 bg-[#000000]">
      {/* Top bar — Bloomberg-style info bar */}
      <div className="flex items-center justify-between px-4 py-1 border-b border-amber-900/20 bg-amber-500/5">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">MACRO TERMINAL</span>
          <span className="text-amber-800 text-[10px]">|</span>
          <span className="text-[10px] text-slate-600 uppercase tracking-wider">Legacy Futures · CFTC · Forex Factory · FRED</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono">
          <span className="text-slate-600 uppercase tracking-wider hidden md:inline">{date}</span>
          <span className="text-amber-400 font-bold tracking-wider">{clock} ET</span>
        </div>
      </div>

      {/* Section bar */}
      <div className="flex items-center gap-3 px-4 py-2">
        <span className="text-[10px] font-bold text-amber-700 border border-amber-800/60 px-1.5 py-0.5 uppercase tracking-wider">
          {SECTION_CODE[activeSection]}
        </span>
        <div>
          <h1 className="text-sm font-bold text-amber-300 uppercase tracking-widest leading-none">
            {SECTION_TITLE[activeSection]}
          </h1>
          <p className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wider">{SECTION_SUB[activeSection]}</p>
        </div>
      </div>
    </header>
  );
}
