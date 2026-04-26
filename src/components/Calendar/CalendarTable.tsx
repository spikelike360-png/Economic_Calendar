'use client';

import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { CalendarEvent } from '@/lib/types';
import ImpactBadge from '@/components/ui/ImpactBadge';
import CurrencyBadge from '@/components/ui/CurrencyBadge';
import { clsx } from 'clsx';

interface Props {
  events: CalendarEvent[];
}

function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
}

function getTodayET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

function ValueCell({ value, className }: { value: string | null; className?: string }) {
  if (!value) {
    return <td className={clsx('px-3 py-2.5 font-mono text-xs text-right text-slate-700', className)}>—</td>;
  }
  return (
    <td className={clsx('px-3 py-2.5 font-mono text-xs text-right text-slate-300 tabular-nums', className)}>
      {value}
    </td>
  );
}

export default function CalendarTable({ events }: Props) {
  const todayET = useMemo(() => getTodayET(), []);

  const grouped = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [events]);

  // Past days start collapsed, today + future start open
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(events.filter((e) => e.date < todayET).map((e) => e.date)),
  );

  const toggle = (date: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-600 gap-3">
        <div className="text-3xl opacity-40">📭</div>
        <p className="text-sm">No events match your filters.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-800/60 text-xs text-slate-600 uppercase tracking-wider bg-[#0d0d0f]">
            <th className="px-3 py-2.5 text-left font-medium w-20">Time</th>
            <th className="px-3 py-2.5 text-left font-medium w-20">CCY</th>
            <th className="px-3 py-2.5 text-left font-medium w-28">Impact</th>
            <th className="px-3 py-2.5 text-left font-medium">Event</th>
            <th className="px-3 py-2.5 text-right font-medium w-24">Actual</th>
            <th className="px-3 py-2.5 text-right font-medium w-24">Forecast</th>
            <th className="px-3 py-2.5 text-right font-medium w-24">Previous</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map(([date, dayEvents]) => {
            const isToday = date === todayET;
            const isPast = date < todayET;
            const isCollapsed = collapsed.has(date);

            return (
              <Fragment key={date}>
                {/* Date separator row — clickable */}
                <tr
                  className={clsx(
                    'border-t border-slate-800/60 cursor-pointer select-none group',
                    isToday
                      ? 'bg-amber-500/5 hover:bg-amber-500/10'
                      : 'bg-[#0d0d0f]/60 hover:bg-slate-800/40',
                  )}
                  onClick={() => toggle(date)}
                >
                  <td colSpan={7} className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 shrink-0 transition-colors" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 shrink-0 transition-colors" />
                      )}
                      {isToday && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                          TODAY
                        </span>
                      )}
                      <span
                        className={clsx(
                          'text-xs font-semibold tracking-wide',
                          isToday ? 'text-amber-300' : isPast ? 'text-slate-700' : 'text-slate-500',
                        )}
                      >
                        {formatDisplayDate(date)}
                      </span>
                      <span className="text-xs text-slate-700 font-mono ml-1">
                        {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </td>
                </tr>

                {/* Event rows — hidden when collapsed */}
                {!isCollapsed &&
                  dayEvents.map((ev) => (
                    <tr
                      key={ev.id}
                      className={clsx(
                        'border-b border-slate-800/40 transition-colors',
                        isPast && !ev.isReleased
                          ? 'opacity-40 hover:opacity-60'
                          : isPast
                            ? 'opacity-60 hover:opacity-80'
                            : 'hover:bg-amber-500/5',
                        isToday && 'bg-amber-500/[0.02]',
                      )}
                    >
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-500 whitespace-nowrap w-20">
                        {ev.time}
                      </td>
                      <td className="px-3 py-2.5 w-20">
                        <CurrencyBadge currency={ev.currency} />
                      </td>
                      <td className="px-3 py-2.5 w-28">
                        <ImpactBadge impact={ev.impact} />
                      </td>
                      <td className="px-3 py-2.5 text-slate-200 text-sm">
                        <span className={clsx('leading-snug', isPast && 'text-slate-500')}>
                          {ev.title}
                        </span>
                      </td>
                      <ValueCell
                        value={ev.actual}
                        className={ev.isReleased ? 'text-slate-100 font-semibold' : undefined}
                      />
                      <ValueCell value={ev.forecast} />
                      <ValueCell value={ev.previous} />
                    </tr>
                  ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
