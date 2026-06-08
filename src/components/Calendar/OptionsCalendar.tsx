'use client';

import { useMemo, useState } from 'react';
import { clsx } from 'clsx';

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

type EventType = 'opex' | 'triple' | 'jheqx' | 'vix';

interface CalEvent {
  dateStr: string;
  display: string;
  weekday: string;
  daysAway: number;
  types: EventType[];
}

function buildEvents(todayMs: number): CalEvent[] {
  const now = new Date();
  const startYear = now.getFullYear() - 1;
  const endYear = now.getFullYear() + 1;
  const map = new Map<string, CalEvent>();

  const fmtLocal = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };

  const add = (d: Date, types: EventType[]) => {
    const key = fmtLocal(d);
    const dCopy = new Date(d);
    const days = Math.round((dCopy.setHours(0, 0, 0, 0) - todayMs) / 86_400_000);
    const existing = map.get(key);
    if (existing) {
      types.forEach((t) => { if (!existing.types.includes(t)) existing.types.push(t); });
    } else {
      map.set(key, {
        dateStr: key,
        display: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
        daysAway: days,
        types,
      });
    }
  };

  for (let year = startYear; year <= endYear; year++) {
    for (let m = 1; m <= 12; m++) {
      add(vixExpiry(year, m), ['vix']);
      const opexTypes: EventType[] = ['opex'];
      if (TRIPLE_MONTHS.has(m)) opexTypes.push('triple', 'jheqx');
      add(nthFriday(year, m, 3), opexTypes);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
}

const TYPE_META: Record<EventType, { label: string; filterLabel: string; cls: string; dot: string }> = {
  triple: { label: 'Triple Witching',  filterLabel: 'Triple Witch', cls: 'bg-amber-500/15 border-amber-500/40 text-amber-400',    dot: 'bg-amber-500'  },
  jheqx:  { label: 'JHEQX Roll',       filterLabel: 'JHEQX',        cls: 'bg-sky-500/10 border-sky-500/30 text-sky-400',           dot: 'bg-sky-500'    },
  vix:    { label: 'VIXpiration',       filterLabel: 'VIXpiration',  cls: 'bg-violet-500/15 border-violet-500/30 text-violet-400',  dot: 'bg-violet-500' },
  opex:   { label: 'Monthly OpEx',      filterLabel: 'Monthly OpEx', cls: 'bg-slate-800/60 border-slate-700/40 text-slate-400',     dot: 'bg-slate-500'  },
};

const BADGE_ORDER: EventType[] = ['triple', 'jheqx', 'vix', 'opex'];
const FILTER_TYPES: EventType[] = ['triple', 'jheqx', 'vix', 'opex'];

export default function OptionsCalendar() {
  const todayMs = useMemo(() => new Date().setHours(0, 0, 0, 0), []);
  const allRows = useMemo(() => buildEvents(todayMs), [todayMs]);

  const [shown, setShown]     = useState<Set<EventType>>(new Set<EventType>(['triple', 'jheqx', 'vix', 'opex']));
  const [showPast, setShowPast] = useState(false);

  const toggle = (t: EventType) =>
    setShown((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

  const nextIdx = allRows.findIndex((r) => r.daysAway >= 0);

  const visible = allRows
    .slice(showPast ? Math.max(0, nextIdx - 6) : nextIdx)
    .filter((row) => row.types.some((t) => shown.has(t)));

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-slate-800/40 bg-[#0a0a0c]">
        {FILTER_TYPES.map((t) => {
          const meta = TYPE_META[t];
          const active = shown.has(t);
          return (
            <button
              key={t}
              onClick={() => toggle(t)}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-mono font-bold uppercase tracking-wider transition-colors',
                active
                  ? meta.cls
                  : 'bg-transparent border-slate-800 text-slate-700 hover:border-slate-700 hover:text-slate-500',
              )}
            >
              <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', active ? meta.dot : 'bg-slate-700')} />
              {meta.filterLabel}
            </button>
          );
        })}

        {/* Past toggle */}
        <button
          onClick={() => setShowPast((v) => !v)}
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded border text-[10px] font-mono font-bold uppercase tracking-wider transition-colors ml-auto',
            showPast
              ? 'bg-slate-700/40 border-slate-600 text-slate-400'
              : 'bg-transparent border-slate-800 text-slate-700 hover:border-slate-700 hover:text-slate-500',
          )}
        >
          {showPast ? 'Hide Past' : 'Show Past'}
        </button>
      </div>

      {/* Event rows */}
      <div className="divide-y divide-slate-800/30">
        {visible.length === 0 ? (
          <div className="px-4 py-10 text-center text-slate-600 text-sm font-mono">
            No events match current filters
          </div>
        ) : (
          visible.map((row) => {
            const isPast    = row.daysAway < 0;
            const isToday   = row.daysAway === 0;
            const isNext    = allRows.indexOf(row) === nextIdx && !isPast;
            const hot       = !isPast && row.daysAway <= 7;
            const warm      = !isPast && row.daysAway <= 30;
            const isVixOnly = row.types.every((t) => t === 'vix');

            return (
              <div
                key={row.dateStr}
                className={clsx(
                  'flex items-center gap-3 px-4 py-2.5 transition-colors',
                  isPast  && 'opacity-40',
                  !isPast && 'hover:bg-slate-800/20',
                  isToday && 'bg-amber-500/8',
                  isNext  && !isToday && 'bg-emerald-500/5',
                )}
              >
                {/* Date */}
                <div className="w-44 shrink-0 flex items-baseline gap-1.5">
                  <span className={clsx(
                    'text-sm font-mono font-bold',
                    isPast          ? 'text-slate-600'
                    : isToday       ? 'text-amber-400'
                    : row.types.includes('triple') ? 'text-amber-300'
                    : isVixOnly     ? 'text-violet-300'
                    : 'text-slate-300',
                  )}>
                    {row.display}
                  </span>
                  <span className="text-[10px] text-slate-600 font-mono">{row.weekday}</span>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 flex-1 items-center">
                  {BADGE_ORDER
                    .filter((t) => row.types.includes(t) && shown.has(t))
                    .map((t) => (
                      <span key={t} className={clsx(
                        'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono border',
                        TYPE_META[t].cls,
                      )}>
                        {TYPE_META[t].label}
                      </span>
                    ))}

                  {isNext && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono border bg-emerald-500/15 border-emerald-500/40 text-emerald-400">
                      ▶ NEXT
                    </span>
                  )}
                  {isToday && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono border bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse uppercase tracking-wider">
                      TODAY
                    </span>
                  )}
                </div>

                {/* DTE */}
                <div className="w-16 text-right shrink-0">
                  {isPast ? (
                    <span className="text-[11px] text-slate-700 font-mono">{row.daysAway}d</span>
                  ) : isToday ? (
                    <span className="text-[12px] text-amber-400 font-mono font-bold">0d</span>
                  ) : (
                    <span className={clsx(
                      'text-[12px] font-mono font-bold',
                      hot ? 'text-amber-400' : warm ? 'text-slate-300' : 'text-slate-500',
                    )}>
                      {row.daysAway}d
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="px-4 py-2.5 border-t border-slate-800/40 text-[10px] text-slate-700 font-mono">
        JHEQX = JPMorgan Hedged Equity Fund quarterly SPX collar roll · VIXpiration settles to 30-day forward vol (VRO) · OpEx = 3rd Friday each month
      </div>

    </div>
  );
}
