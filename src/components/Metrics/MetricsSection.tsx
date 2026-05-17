'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, RefreshCw, Wifi, WifiOff, Percent, BarChart2, Users, Activity } from 'lucide-react';
import { clsx } from 'clsx';
import type { MacroMetric, MacroValue, MetricsResponse, Trend } from '@/lib/types';
import CurrencyBadge from '@/components/ui/CurrencyBadge';
import MetricChartModal from './MetricChartModal';

const REFRESH_MS = 60 * 60 * 1000;

function TrendBadge({ trend }: { trend: Trend }) {
  if (trend === 'up') return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-400">
      <TrendingUp className="w-3 h-3" />
    </span>
  );
  if (trend === 'down') return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-400">
      <TrendingDown className="w-3 h-3" />
    </span>
  );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-slate-600">
      <Minus className="w-3 h-3" />
    </span>
  );
}

const METRIC_ICON = {
  rate: Percent,
  cpi:  TrendingUp,
  unem: Users,
  gdp:  BarChart2,
} as const;

const METRIC_LABEL = {
  rate: 'Interest Rate',
  cpi:  'Inflation (CPI)',
  unem: 'Unemployment',
  gdp:  'GDP Growth',
} as const;

type MetricKey = keyof typeof METRIC_ICON;

function MetricTile({ metricKey, data, onClick }: { metricKey: MetricKey; data: MacroValue; onClick: () => void }) {
  const Icon = METRIC_ICON[metricKey];
  return (
    <div
      onClick={onClick}
      className="rounded-md bg-[#0d1020] border border-slate-800/80 p-3.5 flex flex-col gap-2 hover:border-amber-500/40 cursor-pointer transition-colors group">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-600 uppercase tracking-wider font-medium leading-none">
          {METRIC_LABEL[metricKey]}
        </p>
        <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/15 group-hover:bg-amber-500/15 transition-colors">
          <Icon className="w-3 h-3 text-amber-400" />
        </div>
      </div>
      <div className="flex items-end justify-between gap-1">
        <span className="text-xl font-bold text-slate-100 font-mono tabular-nums leading-none">
          {data.value}
        </span>
        <TrendBadge trend={data.trend} />
      </div>
      <div className="space-y-0.5">
        <p className="text-xs text-slate-600 leading-snug">{data.period}</p>
        <p className="text-xs text-slate-700 leading-snug truncate" title={data.source}>
          {data.source}
        </p>
      </div>
    </div>
  );
}

type MetricField = 'rate' | 'cpi' | 'unem' | 'gdp';
type ModalTarget = { currency: string; field: MetricField; countryName: string; flag: string; currentValue: MacroValue } | null;

const FIELD_TO_MACRO: Record<MetricField, keyof MacroMetric> = {
  rate: 'interestRate',
  cpi:  'inflation',
  unem: 'unemployment',
  gdp:  'gdpGrowth',
};

function CountryCard({ metric, onOpenChart }: { metric: MacroMetric; onOpenChart: (t: ModalTarget) => void }) {
  const open = (field: MetricField) =>
    onOpenChart({ currency: metric.id, field, countryName: metric.countryName, flag: metric.flag,
      currentValue: metric[FIELD_TO_MACRO[field]] as MacroValue });
  return (
    <div className="rounded-lg border border-slate-800/60 bg-[#111113] overflow-hidden shadow-lg shadow-black/20 hover:border-amber-500/15 transition-colors">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60 bg-[#0d0d0f]">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">{metric.flag}</span>
          <p className="text-sm font-semibold text-slate-100 leading-none">{metric.countryName}</p>
        </div>
        <CurrencyBadge currency={metric.id} />
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        <MetricTile metricKey="rate" data={metric.interestRate} onClick={() => open('rate')} />
        <MetricTile metricKey="cpi"  data={metric.inflation}    onClick={() => open('cpi')}  />
        <MetricTile metricKey="unem" data={metric.unemployment} onClick={() => open('unem')} />
        <MetricTile metricKey="gdp"  data={metric.gdpGrowth}    onClick={() => open('gdp')}  />
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-slate-800/60 bg-[#111113] overflow-hidden animate-pulse">
      <div className="px-4 py-3 border-b border-slate-800/60 bg-[#0d0d0f]">
        <div className="h-4 w-36 bg-slate-800/80 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-md bg-[#0d1020] border border-slate-800/80 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="h-2.5 w-20 bg-slate-800 rounded" />
              <div className="w-6 h-6 bg-slate-800/60 rounded-lg" />
            </div>
            <div className="h-6 w-16 bg-slate-800 rounded" />
            <div className="h-2 w-24 bg-slate-800/60 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MetricsSection() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modal, setModal] = useState<ModalTarget>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/metrics', { cache: 'no-store' });
      const json: MetricsResponse = await res.json();
      setData(json);
    } catch {
      setData((prev) =>
        prev ? { ...prev, isStale: true, error: 'Network error — showing cached data' } : null,
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);
    timerRef.current = setInterval(() => fetchData(true), REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [fetchData]);

  const isFallback = data?.source === 'fallback';

  return (
    <div id="metrics" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
            <Activity className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 tracking-wide">Macro Metrics</h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Interest rates · Inflation · Unemployment · GDP
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {data && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono">
              {data.isStale || isFallback ? (
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
              ) : (
                <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              )}
              <span className="text-slate-600">
                {isFallback ? 'Static' : 'Live'}
                {data.fetchedAt && ` · ${new Date(data.fetchedAt).toLocaleTimeString('en-US', {
                  timeZone: 'America/New_York',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false,
                })} ET`}
              </span>
            </div>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-slate-400 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/30 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Fallback banner */}
      {data?.error && isFallback && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-md text-xs border bg-amber-500/8 border-amber-500/15 text-amber-400">
          {data.error}
        </div>
      )}

      {/* Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {loading
          ? [...Array(6)].map((_, i) => <SkeletonCard key={i} />)
          : (data?.metrics ?? []).map((m) => <CountryCard key={m.id} metric={m} onOpenChart={setModal} />)
        }
      </div>

      <p className="text-xs text-slate-700 text-center">
        USD via FRED (St. Louis Fed) · EUR/GBP/JPY/CAD/AUD via Trading Economics · Eastern Time
      </p>

      {modal && (
        <MetricChartModal
          currency={modal.currency}
          field={modal.field}
          countryName={modal.countryName}
          flag={modal.flag}
          currentValue={modal.currentValue}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
