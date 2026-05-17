'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import type { CalendarEvent, CalendarFilters, CalendarResponse } from '@/lib/types';
import type { Currency, DateFilter, Impact } from '@/lib/types';
import { CalendarSkeleton } from '@/components/ui/LoadingSkeleton';
import CalendarFiltersBar from './CalendarFilters';
import CalendarTable from './CalendarTable';
import { clsx } from 'clsx';

const DEFAULT_FILTERS: CalendarFilters = {
  currencies: [],
  impacts: [],
  dateFilter: 'upcoming',
};

const FILTERS_LS_KEY = 'calendar_filters_v1';

function loadFilters(): CalendarFilters {
  try {
    const raw = localStorage.getItem(FILTERS_LS_KEY);
    if (!raw) return DEFAULT_FILTERS;
    return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch { return DEFAULT_FILTERS; }
}

function saveFilters(f: CalendarFilters): void {
  try { localStorage.setItem(FILTERS_LS_KEY, JSON.stringify(f)); } catch {}
}

function getTodayET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

function addDaysET(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
}

function getWeekBounds(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const diff = (d: number) => {
    const x = new Date(now);
    x.setDate(now.getDate() + d);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(x);
  };
  return { start: diff(-day), end: diff(6 - day) };
}

function getWeekRange(dateStr: string): { start: string; end: string } {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay(); // 0=Sun
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) };
}

function applyDateFilter(events: CalendarEvent[], filter: DateFilter, selectedDate?: string): CalendarEvent[] {
  if (selectedDate) {
    const { start, end } = getWeekRange(selectedDate);
    return events.filter((e) => e.date >= start && e.date <= end);
  }
  const today = getTodayET();
  switch (filter) {
    case 'today':
      return events.filter((e) => e.date === today);
    case 'past7': {
      const from = addDaysET(-7);
      return events.filter((e) => e.date >= from && e.date <= today);
    }
    case 'thisweek': {
      const { start, end } = getWeekBounds();
      return events.filter((e) => e.date >= start && e.date <= end);
    }
    case 'next7': {
      const to = addDaysET(7);
      return events.filter((e) => e.date >= today && e.date <= to);
    }
    case 'next30': {
      const to = addDaysET(30);
      return events.filter((e) => e.date >= today && e.date <= to);
    }
    case 'upcoming':
      return events.filter((e) => e.date >= today);
    case 'all':
    default:
      return events;
  }
}

function applyFilters(events: CalendarEvent[], filters: CalendarFilters): CalendarEvent[] {
  let result = events;
  if (filters.currencies.length > 0) {
    result = result.filter((e) => filters.currencies.includes(e.currency as Currency));
  }
  if (filters.impacts.length > 0) {
    result = result.filter((e) => filters.impacts.includes(e.impact as Impact));
  }
  result = applyDateFilter(result, filters.dateFilter, filters.selectedDate);
  return result;
}

// ---------- localStorage persistence ----------
// Merges historical events across refreshes so past weeks are preserved.
// Fresh events override stored ones (actuals get updated); old events are kept.

const LS_KEY = 'calendar_v3';
const LS_MAX_AGE_DAYS = 365;

function lsRead(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const { events }: { events: CalendarEvent[] } = JSON.parse(raw);
    return Array.isArray(events) ? events : [];
  } catch { return []; }
}

function lsWrite(events: CalendarEvent[]): void {
  try {
    const cutoff = Date.now() - LS_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const trimmed = events.filter((e) => e.timestamp >= cutoff);
    localStorage.setItem(LS_KEY, JSON.stringify({ events: trimmed }));
  } catch {}
}

function mergeEvents(stored: CalendarEvent[], fresh: CalendarEvent[]): CalendarEvent[] {
  const map = new Map<string, CalendarEvent>();
  for (const e of stored) map.set(e.id, e);
  // Fresh events override stored (updates actuals, isReleased, etc.)
  for (const e of fresh) map.set(e.id, e);
  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp || a.title.localeCompare(b.title));
}

// ---------- module-level cache ----------

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
let _calCache: CalendarResponse | null = null;
let _calCachedAt = 0;

export default function CalendarSection() {
  const [data, setData]             = useState<CalendarResponse | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [histLoading, setHistLoading] = useState(false);
  const [filters, setFilters]       = useState<CalendarFilters>(DEFAULT_FILTERS);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // On mount: restore from localStorage immediately (before first fetch)
  useEffect(() => {
    setFilters(loadFilters());
    if (_calCache) {
      setData(_calCache);
      setLoading(false);
      return;
    }
    const stored = lsRead();
    if (stored.length > 0) {
      setData({
        events: stored,
        fetchedAt: new Date().toISOString(),
        isStale: true,
        source: 'cache',
      });
      setLoading(false);
    }
  }, []);

  const fetchData = useCallback(async (silent = false) => {
    const stale = Date.now() - _calCachedAt > REFRESH_INTERVAL_MS;
    if (!silent && _calCache && !stale) {
      setData(_calCache);
      setLoading(false);
      return;
    }

    if (silent) setRefreshing(true);
    else if (!_calCache) setLoading(true);

    try {
      const res = await fetch('/api/calendar');
      const json: CalendarResponse = await res.json();

      // Merge fresh events with stored history, then persist
      const stored = lsRead();
      const merged = mergeEvents(stored, json.events);
      lsWrite(merged);

      const response: CalendarResponse = { ...json, events: merged };
      _calCache = response;
      _calCachedAt = Date.now();
      setData(response);
    } catch {
      setData((prev) =>
        prev
          ? { ...prev, isStale: true, error: 'Network error — showing cached data' }
          : {
              events: lsRead(),
              fetchedAt: new Date().toISOString(),
              isStale: true,
              source: 'error',
              error: 'Failed to load calendar data.',
            },
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);
    timerRef.current = setInterval(() => fetchData(true), REFRESH_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  // Historical week fetch — fires when selectedDate changes
  useEffect(() => {
    const d = filters.selectedDate;
    if (!d) return;
    const { start, end } = getWeekRange(d);
    const stored = lsRead();
    if (stored.some((e) => e.date >= start && e.date <= end)) return; // already cached
    setHistLoading(true);
    fetch(`/api/calendar?week=${d}`)
      .then((r) => r.json())
      .then((json: CalendarResponse) => {
        if (!json.events.length) return;
        const current = lsRead();
        const merged = mergeEvents(current, json.events);
        lsWrite(merged);
        setData((prev) =>
          prev ? { ...prev, events: merged } : { events: merged, fetchedAt: new Date().toISOString(), isStale: false, source: 'html' },
        );
      })
      .catch(() => {})
      .finally(() => setHistLoading(false));
  }, [filters.selectedDate]);

  const filtered = data ? applyFilters(data.events, filters) : [];

  const sourceLabel: Record<string, string> = {
    json: 'JSON', html: 'HTML', mixed: 'JSON + HTML', cache: 'Cache', error: 'Error',
  };

  return (
    <div id="calendar" className="rounded-lg border border-slate-800/60 bg-[#111113] overflow-hidden shadow-xl shadow-black/30">
      {/* Section header */}
      <div className="flex items-center justify-between px-4 sm:px-5 py-4 border-b border-slate-800/60 bg-[#0d0d0f]">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide">Economic Calendar</h2>
          <p className="text-xs text-slate-600 mt-0.5 hidden sm:block">
            Forex Factory · USD · EUR · GBP · JPY · CAD · AUD
          </p>
        </div>

        <div className="flex items-center gap-3">
          {data && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono">
              {data.isStale ? (
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              )}
              <span className="text-slate-600">
                {data.source ? sourceLabel[data.source] : ''} ·{' '}
                {new Date(data.fetchedAt).toLocaleTimeString('en-US', {
                  timeZone: 'America/New_York',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })}{' '}
                ET
              </span>
            </div>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-slate-400 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/30 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Error banner */}
      {data?.error && (
        <div className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-amber-500/8 border-b border-amber-500/15 text-xs text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {data.error}
        </div>
      )}

      {/* Filters */}
      <CalendarFiltersBar
        filters={filters}
        onChange={(f) => { setFilters(f); saveFilters(f); }}
        totalCount={data?.events.length ?? 0}
        filteredCount={filtered.length}
      />

      {/* Table */}
      <div className="min-h-[400px]">
        {loading || histLoading ? <CalendarSkeleton /> : <CalendarTable events={filtered} />}
      </div>

      {/* Footer */}
      {data && !loading && (
        <div className="px-4 sm:px-5 py-3 border-t border-slate-800/60 text-xs text-slate-700 flex justify-between">
          <span>Forex Factory · Eastern Time (ET)</span>
          <span className="hidden sm:inline">Auto-refreshes every 5 min</span>
        </div>
      )}
    </div>
  );
}
