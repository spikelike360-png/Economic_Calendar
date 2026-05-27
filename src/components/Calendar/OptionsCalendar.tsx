'use client';

import { useMemo } from 'react';
import { clsx } from 'clsx';

const TRIPLE_MONTHS = new Set([3, 6, 9, 12]);

function nthFriday(year: number, month: number, n: number): Date {
  const d = new Date(year, month - 1, 1);
  d.setDate(1 + ((5 - d.getDay() + 7) % 7) + (n - 1) * 7);
  return d;
}

// VIXpiration = 30 calendar days before next month's 3rd-Friday OpEx
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

  const add = (d: Date, types: EventType[]) => {
    const key = d.toISOString().slice(0, 10);
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
      // VIXpiration
      add(vixExpiry(year, m), ['vix']);
      // Monthly OpEx
      const opexTypes: EventType[] = ['opex'];
      if (TRIPLE_MONTHS.has(m)) opexTypes.push('triple', 'jheqx');
      add(nthFriday(year, m, 3), opexTypes);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.dateStr.localeCompare(b.dateStr));
}

const TYPE_META: Record<EventType, { label: string; cls: string }> = {
  opex:   { label: 'Monthly OpEx',     cls: 'bg-slate-800/60 border-slate-700/40 text-slate-400'         },
  triple: { label: 'Triple Witching',  cls: 'bg-amber-500/15 border-amber-500/40 text-amber-400'         },
  jheqx:  { label: 'JHEQX Roll',       cls: 'bg-sky-500/10 border-sky-500/30 text-sky-400'               },
  vix:    { label: 'VIXpiration',       cls: 'bg-violet-500/15 border-violet-500/30 text-violet-400'      },
};

const BADGE_ORDER: EventType[] = ['vix', 'triple', 'jheqx', 'opex'];

export default function OptionsCalendar() {
  const todayMs = useMemo(() => new Date().setHours(0, 0, 0, 0), []);
  const rows = useMemo(() => buildEvents(todayMs), [todayMs]);

  const nextIdx = rows.findIndex((r) => r.daysAway >= 0);
  // show ~4 past rows + all future
  const visible = rows.slice(Math.max(0, nextIdx - 4));

  return (
    <div>
      {/* Legend */}
      <div className="px-4 py-2.5 border-b border-slate-800/40 flex flex-wrap items-center gap-x-5 gap-y-1 text-[10px] font-mono text-slate-500">
        {(Object.entries(TYPE_META) as [EventType, typeof TYPE_META[EventType]][]).map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={clsx('w-2 h-2 rounded-sm shrink-0', meta.cls.split(' ')[0])} />
            {meta.label}
          </span>
        ))}
        <span className="text-slate-700">· VIXpiration = 30d before next OpEx · 3rd Friday each month</span>
      </div>

      {/* Event rows */}
      <div className="divide-y divide-slate-800/30">
        {visible.map((row) => {
          const isPast    = row.daysAway < 0;
          const isToday   = row.daysAway === 0;
          const isNext    = rows.indexOf(row) === nextIdx;
          const hot       = !isPast && row.daysAway <= 7;
          const warm      = !isPast && row.daysAway <= 30;
          const isVixOnly = row.types.length === 1 && row.types[0] === 'vix';

          return (
            <div
              key={row.dateStr}
              className={clsx(
                'flex items-center gap-3 px-4 py-2.5 transition-colors',
                isPast  && 'opacity-35',
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
                  .filter((t) => row.types.includes(t))
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
        })}
      </div>

      <div className="px-4 py-2.5 border-t border-slate-800/40 text-[10px] text-slate-700 font-mono">
        JHEQX = JPMorgan Hedged Equity Fund quarterly SPX collar roll · VIXpiration settles to 30-day forward vol (VRO)
      </div>
    </div>
  );
}
