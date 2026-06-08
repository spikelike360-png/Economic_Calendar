'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Clock, Moon, ChevronDown, ChevronRight, Search, X, Star } from 'lucide-react';
import { clsx } from 'clsx';
import type { EarningsEvent, EarningsResponse } from '@/lib/types';
import PoliticalTradesSection from './PoliticalTradesSection';

const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return `${DAY_NAMES[d.getUTCDay()]} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function getTodayET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

function getTomorrowET(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
}

function parseEPS(s: string | null): number | null {
  if (!s) return null;
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

// ── Watchlist persistence ────────────────────────────────────────────────────

const WATCHLIST_KEY = 'earnings_watchlist_v1';
export const EARNINGS_ALERTS_KEY = 'earnings_today_alerts_v1';

export interface EarningsAlertEntry { symbol: string; name: string; date: string; time: EarningsEvent['time']; }
interface AlertsCache { date: string; today: EarningsAlertEntry[]; tomorrow: EarningsAlertEntry[]; }

function loadWatchlist(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(WATCHLIST_KEY) ?? '[]')); }
  catch { return new Set(); }
}

function saveWatchlist(ws: Set<string>): void {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(Array.from(ws))); } catch {}
}

function writeAlertsCache(todayStr: string, tomorrowStr: string, events: EarningsEvent[], ws: Set<string>): void {
  if (ws.size === 0) { try { localStorage.removeItem(EARNINGS_ALERTS_KEY); } catch {} return; }
  const cache: AlertsCache = {
    date: todayStr,
    today:    events.filter((e) => e.date === todayStr    && ws.has(e.symbol)).map((e) => ({ symbol: e.symbol, name: e.name, date: e.date, time: e.time })),
    tomorrow: events.filter((e) => e.date === tomorrowStr && ws.has(e.symbol)).map((e) => ({ symbol: e.symbol, name: e.name, date: e.date, time: e.time })),
  };
  try { localStorage.setItem(EARNINGS_ALERTS_KEY, JSON.stringify(cache)); } catch {}
}

// ── Sub-components ───────────────────────────────────────────────────────────

function TimeBadge({ time }: { time: EarningsEvent['time'] }) {
  if (time === 'pre-market') return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
      <Clock className="w-2.5 h-2.5" /> Pre
    </span>
  );
  if (time === 'after-hours') return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-500/10 border border-purple-500/20 text-purple-400 shrink-0">
      <Moon className="w-2.5 h-2.5" /> AH
    </span>
  );
  return <span className="w-8 shrink-0" />;
}

function SurpriseCell({ estimate, actual }: { estimate: string | null; actual: string | null }) {
  const est = parseEPS(estimate);
  const act = parseEPS(actual);
  if (act !== null && est !== null) {
    const diff = act - est;
    const pct  = est !== 0 ? (diff / Math.abs(est)) * 100 : 0;
    const beat = diff >= 0;
    return (
      <div className="text-right shrink-0 min-w-[90px]">
        <p className="text-xs font-mono font-semibold text-slate-200">{act >= 0 ? '+' : ''}{act.toFixed(2)}</p>
        <p className={clsx('text-[10px] font-mono font-semibold', beat ? 'text-emerald-400' : 'text-red-400')}>
          {beat ? '+' : ''}{diff.toFixed(2)} ({beat ? '+' : ''}{pct.toFixed(1)}%)
          {beat ? <TrendingUp className="inline w-2.5 h-2.5 ml-0.5" /> : <TrendingDown className="inline w-2.5 h-2.5 ml-0.5" />}
        </p>
      </div>
    );
  }
  if (est !== null) {
    return (
      <div className="text-right shrink-0 min-w-[90px]">
        <p className="text-[10px] text-slate-500 font-mono">est</p>
        <p className="text-xs font-mono text-slate-400">{est >= 0 ? '+' : ''}{est.toFixed(2)}</p>
      </div>
    );
  }
  return <div className="text-right shrink-0 min-w-[90px] text-xs text-slate-700">—</div>;
}

function RevCell({ actual, estimate }: { actual: string | null; estimate: string | null }) {
  const act = parseEPS(actual);
  const est = parseEPS(estimate);
  if (act !== null && est !== null) {
    const beat = act >= est;
    const diff = ((act - est) / Math.abs(est)) * 100;
    return (
      <div className="text-right shrink-0 min-w-[70px] hidden sm:block">
        <p className="text-[10px] text-slate-500">Rev</p>
        <p className={clsx('text-[10px] font-mono font-semibold', beat ? 'text-emerald-400' : 'text-red-400')}>
          {beat ? '+' : ''}{diff.toFixed(1)}%
        </p>
      </div>
    );
  }
  if (est !== null) {
    return (
      <div className="text-right shrink-0 min-w-[70px] hidden sm:block">
        <p className="text-[10px] text-slate-500">Rev est</p>
        <p className="text-[10px] font-mono text-slate-500">{estimate}</p>
      </div>
    );
  }
  return null;
}

function EarningsRow({
  ev, isWatched, onToggle,
}: {
  ev: EarningsEvent;
  isWatched: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={clsx(
      'flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/20 transition-colors border-b border-slate-800/40 last:border-0',
      isWatched && 'bg-amber-500/4',
    )}>
      {/* Watchlist star */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        title={isWatched ? 'Remove from watchlist' : 'Add to watchlist'}
        className="shrink-0 p-0.5 transition-colors"
      >
        <Star className={clsx('w-3.5 h-3.5 transition-colors', isWatched ? 'text-amber-400 fill-amber-400' : 'text-slate-800 hover:text-slate-600')} />
      </button>

      <TimeBadge time={ev.time} />

      <div className="w-16 shrink-0">
        <p className="text-sm font-bold font-mono text-amber-300 leading-none">{ev.symbol}</p>
        <p className="text-[10px] text-slate-600 mt-0.5">{ev.exchange}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-300 truncate">{ev.name}</p>
        <p className="text-[10px] text-slate-600">{ev.fiscalQuarter} · {ev.marketCap ?? ''}</p>
      </div>
      <RevCell actual={ev.revenueActual} estimate={ev.revenueEstimate} />
      <SurpriseCell estimate={ev.epsEstimate} actual={ev.epsActual} />
    </div>
  );
}

function DayGroup({
  date, events, isToday, isOpen, onToggleOpen, watchlist, onToggle,
}: {
  date: string;
  events: EarningsEvent[];
  isToday: boolean;
  isOpen: boolean;
  onToggleOpen: () => void;
  watchlist: Set<string>;
  onToggle: (symbol: string) => void;
}) {
  const watchedCount = events.filter((e) => watchlist.has(e.symbol)).length;

  return (
    <div className="rounded-xl border border-slate-800/60 bg-[#0d0d0f] overflow-hidden">
      <button
        onClick={onToggleOpen}
        className={clsx(
          'w-full px-4 py-2.5 flex items-center justify-between border-b border-slate-800/60 transition-colors hover:bg-slate-800/20',
          isToday ? 'bg-amber-500/8' : 'bg-[#0a0a0c]',
        )}
      >
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-slate-600" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-600" />}
          {isToday && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 border border-amber-500/30 text-amber-400">TODAY</span>
          )}
          <span className="text-sm font-semibold text-slate-200">{formatDate(date)}</span>
          {watchedCount > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-400/80">
              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />{watchedCount}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-600 font-mono">{events.length} reports</span>
      </button>
      {isOpen && (
        events.length === 0
          ? <p className="px-4 py-3 text-xs text-slate-700">No major earnings</p>
          : events.map((ev) => (
              <EarningsRow
                key={ev.symbol + ev.date}
                ev={ev}
                isWatched={watchlist.has(ev.symbol)}
                onToggle={() => onToggle(ev.symbol)}
              />
            ))
      )}
    </div>
  );
}

function SkeletonDay() {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-[#0d0d0f] overflow-hidden animate-pulse">
      <div className="px-4 py-2.5 bg-[#0a0a0c] border-b border-slate-800/60">
        <div className="h-4 w-32 bg-slate-800 rounded" />
      </div>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/40">
          <div className="h-5 w-8 bg-slate-800 rounded" />
          <div className="h-4 w-12 bg-slate-800 rounded" />
          <div className="flex-1 h-3 bg-slate-800/60 rounded" />
          <div className="h-4 w-10 bg-slate-800 rounded" />
        </div>
      ))}
    </div>
  );
}

type ExchangeFilter = 'ALL' | 'NYSE' | 'NASDAQ';
type ViewFilter     = 'all' | 'watchlist';

// ── Main ────────────────────────────────────────────────────────────────────

export default function EarningsSection() {
  const [data, setData]         = useState<EarningsResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exchange, setExchange] = useState<ExchangeFilter>('ALL');
  const [query, setQuery]       = useState('');
  const [view, setView]         = useState<ViewFilter>('all');
  const [watchlist, setWatchlist]   = useState<Set<string>>(new Set());
  const [openDates, setOpenDates]   = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('earnings_open_dates_v1');
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const searchRef = useRef<HTMLInputElement>(null);

  const today    = useMemo(() => getTodayET(), []);
  const tomorrow = useMemo(() => getTomorrowET(), []);

  // Default open: today + tomorrow. Re-init when dates arrive from data.
  useEffect(() => {
    setOpenDates((prev) => {
      if (prev.size > 0) return prev; // user has already toggled something, don't reset
      return new Set([today, tomorrow]);
    });
  }, [today, tomorrow]);

  // Load watchlist from localStorage on mount
  useEffect(() => { setWatchlist(loadWatchlist()); }, []);

  // Write alerts cache whenever data or watchlist changes
  useEffect(() => {
    if (data?.events) writeAlertsCache(today, tomorrow, data.events, watchlist);
  }, [data, watchlist, today, tomorrow]);

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const res = await fetch('/api/earnings', { cache: 'no-store' });
      setData(await res.json());
    } catch {
      setData((prev) => prev ? { ...prev, error: 'Network error' } : null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(false); }, []);

  const toggleWatch = (symbol: string) => {
    setWatchlist((prev) => {
      const next = new Set(prev);
      next.has(symbol) ? next.delete(symbol) : next.add(symbol);
      saveWatchlist(next);
      return next;
    });
  };

  const q = query.trim().toLowerCase();
  const filteredEvents = (data?.events ?? []).filter((ev) => {
    if (exchange !== 'ALL' && ev.exchange !== exchange) return false;
    if (view === 'watchlist' && !watchlist.has(ev.symbol)) return false;
    if (q && !ev.symbol.toLowerCase().includes(q) && !ev.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const byDate = new Map<string, EarningsEvent[]>();
  for (const ev of filteredEvents) {
    if (!byDate.has(ev.date)) byDate.set(ev.date, []);
    byDate.get(ev.date)!.push(ev);
  }
  const dates = Array.from(byDate.keys()).sort();
  if (view !== 'watchlist' && !byDate.has(today)) { byDate.set(today, []); dates.push(today); dates.sort(); }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Earnings Calendar</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            This week + next · ≥$2B market cap · EPS estimate vs actual
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.fetchedAt && (
            <span className="text-xs text-slate-600 font-mono hidden sm:inline">
              {new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} ET
            </span>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-slate-400 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/30 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* View tabs + search + exchange */}
      <div className="flex flex-wrap items-center gap-2">
        {/* All / Watchlist tabs */}
        <div className="flex gap-1">
          <button
            onClick={() => setView('all')}
            className={clsx(
              'px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider border transition-colors',
              view === 'all'
                ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                : 'border-slate-700/60 text-slate-600 hover:text-slate-400 hover:border-slate-600',
            )}
          >
            All
          </button>
          <button
            onClick={() => setView('watchlist')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold uppercase tracking-wider border transition-colors',
              view === 'watchlist'
                ? 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                : 'border-slate-700/60 text-slate-600 hover:text-slate-400 hover:border-slate-600',
            )}
          >
            <Star className={clsx('w-3 h-3', view === 'watchlist' ? 'fill-amber-400 text-amber-400' : '')} />
            Watchlist
            {watchlist.size > 0 && (
              <span className={clsx(
                'px-1.5 py-0.5 rounded-full text-[10px] font-mono',
                view === 'watchlist' ? 'bg-amber-500/30 text-amber-300' : 'bg-slate-700/60 text-slate-500',
              )}>
                {watchlist.size}
              </span>
            )}
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol or name…"
            className="w-full pl-8 pr-7 py-1.5 rounded-md border border-slate-700/60 bg-slate-900/60 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:bg-slate-900 transition-colors"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); searchRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Exchange filter */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-600 uppercase tracking-wider mr-1">Exchange</span>
        {(['ALL', 'NYSE', 'NASDAQ'] as ExchangeFilter[]).map((ex) => (
          <button
            key={ex}
            onClick={() => setExchange(ex)}
            className={clsx(
              'px-2.5 py-1 rounded border text-xs font-medium transition-colors',
              exchange === ex
                ? 'border-amber-500/40 text-amber-300 bg-amber-500/15'
                : 'border-slate-700/60 text-slate-500 hover:text-slate-300 hover:border-slate-600',
            )}
          >
            {ex}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-slate-600">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-sky-500" /> Pre-market</span>
        <span className="flex items-center gap-1"><Moon className="w-3 h-3 text-purple-500" /> After-hours</span>
        <span className="flex items-center gap-1 text-emerald-500"><TrendingUp className="w-3 h-3" /> Beat</span>
        <span className="flex items-center gap-1 text-red-500"><TrendingDown className="w-3 h-3" /> Miss</span>
        <span className="flex items-center gap-1 text-amber-400"><Star className="w-3 h-3 fill-amber-400" /> Watchlisted</span>
      </div>

      {/* Watchlist empty state */}
      {view === 'watchlist' && watchlist.size === 0 && (
        <div className="py-16 text-center space-y-2">
          <Star className="w-8 h-8 text-slate-700 mx-auto" />
          <p className="text-slate-600 text-sm">No watchlisted stocks yet</p>
          <p className="text-slate-700 text-xs">Click the ☆ star next to any earnings row to watch it</p>
        </div>
      )}

      {/* Days */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonDay key={i} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {dates.map((date) => (
            <DayGroup
              key={date}
              date={date}
              events={byDate.get(date) ?? []}
              isToday={date === today}
              isOpen={openDates.has(date)}
              onToggleOpen={() => setOpenDates((prev) => {
                const next = new Set(prev);
                next.has(date) ? next.delete(date) : next.add(date);
                try { localStorage.setItem('earnings_open_dates_v1', JSON.stringify(Array.from(next))); } catch {}
                return next;
              })}
              watchlist={watchlist}
              onToggle={toggleWatch}
            />
          ))}
          {dates.length === 0 && view !== 'watchlist' && (
            <div className="py-20 text-center text-slate-600 text-sm">No earnings data available</div>
          )}
        </div>
      )}

      <PoliticalTradesSection />
    </div>
  );
}
