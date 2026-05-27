'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Section } from './Sidebar';

const SECTION_CODE: Record<Section, string> = {
  calendar:    'CAL',
  metrics:     'MAC',
  esi:         'ESI',
  news:        'NEWS',
  cot:         'COT',
  seasonality: 'SEA',
  earnings:    'ERN',
  options:     'OPT',
  gex:         'GEX',
  journal:     'JRN',
  notes:       'NTS',
};

const SECTION_TITLE: Record<Section, string> = {
  calendar:    'ECONOMIC CALENDAR',
  metrics:     'MACRO METRICS',
  esi:         'ECONOMIC SURPRISE INDEX',
  news:        'NEWS FEED',
  cot:         'COMMITMENT OF TRADERS',
  seasonality: 'SEASONALITY',
  earnings:    'EARNINGS CALENDAR',
  options:     'OPTION FLOW',
  gex:         'GEX INTELLIGENCE',
  journal:     'TRADE JOURNAL',
  notes:       'NOTES',
};

const SECTION_SUB: Record<Section, string> = {
  calendar:    'Forex Factory · USD EUR GBP JPY CAD AUD',
  metrics:     'Interest Rate · Inflation · Unemployment · GDP',
  esi:         'Actual vs Forecast · Z-score · Impact-weighted · USD EUR GBP JPY CAD AUD',
  news:        'Yahoo Finance · CNBC · MarketWatch · RSS',
  cot:         'CFTC Legacy Futures · Non-Comm / Comm / Non-Rept',
  seasonality: '20Y avg monthly returns · Yahoo Finance',
  earnings:    'Nasdaq · EPS estimate vs actual · ≥$2B cap',
  options:     'CBOE VIX · Yahoo Finance · SPY QQQ IWM GLD TLT',
  gex:         'GEXbot Classic · SPX NDX · 0DTE · Breakout Probability · Gamma Flip',
  journal:     'Weekly recap · Day-by-day bias · Screenshots · Reversal tags',
  notes:       'Local storage · private',
};

// ── Options date helpers ─────────────────────────────────────────────────────

const TRIPLE_MONTHS = new Set([3, 6, 9, 12]);

function nthFriday(year: number, month: number, n: number): Date {
  const d = new Date(year, month - 1, 1);
  d.setDate(1 + ((5 - d.getDay() + 7) % 7) + (n - 1) * 7);
  return d;
}

function vixExpiry(year: number, month: number): Date {
  const nm = month === 12 ? 1 : month + 1;
  const ny = month === 12 ? year + 1 : year;
  const d = new Date(nthFriday(ny, nm, 3));
  d.setDate(d.getDate() - 30);
  return d;
}

function fmtLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

type AlertLevel = 'danger' | 'warn' | 'caution';

interface DayAlert {
  level: AlertLevel;
  title: string;
  body: string;
}

function computeAlerts(todayET: string, tomorrowET: string): DayAlert[] {
  const year = parseInt(todayET.slice(0, 4));
  const alerts: DayAlert[] = [];

  // Triple witching — check this year + next
  for (let y = year; y <= year + 1; y++) {
    for (const m of [3, 6, 9, 12]) {
      const ds = fmtLocal(nthFriday(y, m, 3));
      if (ds === todayET) {
        alerts.push({
          level: 'danger',
          title: '⛔  TRIPLE WITCHING — DO NOT TRADE TODAY',
          body: 'Markets are heavily manipulated by options dealers. Stay completely flat today.',
        });
      } else if (ds === tomorrowET) {
        alerts.push({
          level: 'warn',
          title: '⚠️  TRIPLE WITCHING TOMORROW — PLAN TO STAY OUT',
          body: 'Tomorrow is triple witching. Do not trade. Mark it on your plan.',
        });
      }
    }
  }

  // VIXpiration — check prev year / this year / next year × all months
  for (let y = year - 1; y <= year + 1; y++) {
    for (let m = 1; m <= 12; m++) {
      const ds = fmtLocal(vixExpiry(y, m));
      if (ds === todayET) {
        alerts.push({
          level: 'caution',
          title: '⚡  VIXPIRATION TODAY — SKIP NY OPEN',
          body: 'VIX options settle this morning. Avoid the first 15–30 min of NY session (09:30–10:00 ET). Wait for vol to settle.',
        });
      } else if (ds === tomorrowET) {
        alerts.push({
          level: 'caution',
          title: '⚡  VIXPIRATION TOMORROW',
          body: 'Plan to skip the NY open tomorrow (09:30–10:00 ET). VIX options expire — elevated vol at open.',
        });
      }
    }
  }

  return alerts;
}

const ALERT_STYLE: Record<AlertLevel, { bar: string; title: string; body: string; dot: string }> = {
  danger:  {
    bar:   'bg-red-950/80 border-b border-red-700/60',
    title: 'text-red-300 font-bold',
    body:  'text-red-400/80',
    dot:   'bg-red-500 animate-ping',
  },
  warn:    {
    bar:   'bg-orange-950/70 border-b border-orange-700/40',
    title: 'text-orange-300 font-bold',
    body:  'text-orange-400/70',
    dot:   'bg-orange-500',
  },
  caution: {
    bar:   'bg-amber-950/60 border-b border-amber-700/30',
    title: 'text-amber-300 font-bold',
    body:  'text-amber-500/70',
    dot:   'bg-amber-400',
  },
};

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  activeSection: Section;
}

export default function Header({ activeSection }: Props) {
  const [clock, setClock]   = useState('');
  const [date, setDate]     = useState('');
  const [todayET, setTodayET] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }).format(now));
      setDate(new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      }).format(now).toUpperCase());
      setTodayET(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(now));
    };
    tick();
    const id = setInterval(tick, 60_000); // recheck every minute
    return () => clearInterval(id);
  }, []);

  const alerts = useMemo<DayAlert[]>(() => {
    if (!todayET) return [];
    const t = new Date(todayET + 'T12:00:00');
    t.setDate(t.getDate() + 1);
    const tomorrowET = t.toISOString().slice(0, 10);
    return computeAlerts(todayET, tomorrowET);
  }, [todayET]);

  return (
    <header className="shrink-0 border-b border-amber-900/40 bg-[#000000]">
      {/* Top bar */}
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

      {/* Alert banners — stacks if multiple */}
      {alerts.map((alert, i) => {
        const s = ALERT_STYLE[alert.level];
        return (
          <div key={i} className={`flex items-start gap-3 px-4 py-2.5 ${s.bar}`}>
            {/* Pulsing dot */}
            <span className="relative flex h-2 w-2 shrink-0 mt-1">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${s.dot}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${s.dot.replace(' animate-ping', '')}`} />
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-[11px] uppercase tracking-widest font-mono leading-snug ${s.title}`}>
                {alert.title}
              </p>
              <p className={`text-[10px] mt-0.5 font-mono ${s.body}`}>{alert.body}</p>
            </div>
          </div>
        );
      })}

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
