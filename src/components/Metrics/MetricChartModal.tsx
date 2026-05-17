'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, Loader2, RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell,
} from 'recharts';
import type { MacroValue } from '@/lib/types';
import type { HistoryPoint } from '@/app/api/metrics/history/route';

type MetricField = 'rate' | 'cpi' | 'unem' | 'gdp';
type Span = '1Y' | '2Y' | '5Y' | 'MAX';

const FIELD_LABEL: Record<MetricField, string> = {
  rate: 'Interest Rate',
  cpi:  'Inflation (CPI)',
  unem: 'Unemployment',
  gdp:  'GDP Growth',
};

const FIELD_UNIT: Record<MetricField, string> = {
  rate: '%',
  cpi:  '% YoY',
  unem: '%',
  gdp:  '% QoQ',
};

// Rates = step-line, everything else = bar
const USE_BAR: Record<MetricField, boolean> = {
  rate: false,
  cpi:  true,
  unem: true,
  gdp:  true,
};

const SPAN_MONTHS: Record<Span, number> = { '1Y': 12, '2Y': 24, '5Y': 60, 'MAX': 9999 };

interface Props {
  currency: string;
  field: MetricField;
  countryName: string;
  flag: string;
  currentValue: MacroValue;
  onClose: () => void;
}

function CustomTooltip({ active, payload, unit }: { active?: boolean; payload?: { payload: HistoryPoint }[]; unit: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-700 bg-[#0d0d0f] px-3 py-2 text-xs shadow-lg">
      <p className="text-slate-400 mb-0.5">{d.period}</p>
      <p className="text-amber-300 font-mono font-semibold">
        {d.value >= 0 ? '' : ''}{d.value.toFixed(2)}{unit}
      </p>
      {d.fromCalendar && <p className="text-[10px] text-sky-500 mt-0.5">live release</p>}
    </div>
  );
}

export default function MetricChartModal({ currency, field, countryName, flag, currentValue, onClose }: Props) {
  const [allPoints, setAllPoints] = useState<HistoryPoint[]>([]);
  const [span, setSpan] = useState<Span>('2Y');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const r = await fetch(`/api/metrics/history?currency=${currency}&field=${field}`, { cache: 'no-store' });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      let pts: HistoryPoint[] = j.points;

      // Append TE current value if newer than last history point
      const curDate = currentValue.lastUpdated ? currentValue.lastUpdated + '-01' : '';
      const lastDate = pts.length > 0 ? pts[pts.length - 1].date : '0000-00-00';
      if (curDate && curDate > lastDate) {
        const val = parseFloat(currentValue.value.replace('%', '').replace('+', '').trim());
        if (!isNaN(val)) {
          pts = [...pts, { date: curDate, value: val, period: currentValue.period, fromCalendar: true }];
        }
      }
      setAllPoints(pts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currency, field, currentValue]);

  useEffect(() => { load(false); }, [load]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Filter by span
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - SPAN_MONTHS[span]);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const points = allPoints.filter((p) => span === 'MAX' || p.date >= cutoffStr);

  const useBars = USE_BAR[field];
  const unit = FIELD_UNIT[field];
  const values = points.map((p) => p.value);
  const minV = values.length ? Math.min(...values) : 0;
  const maxV = values.length ? Math.max(...values) : 1;
  const pad  = (maxV - minV) * 0.15 || 0.5;

  // X-axis ticks: show ~6-8 labels
  const step = Math.max(1, Math.ceil(points.length / 7));
  const ticks = points.filter((_, i) => i % step === 0).map((p) => p.date);

  const spans: Span[] = ['1Y', '2Y', '5Y', 'MAX'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-slate-700/60 bg-[#0d0d0f] shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl leading-none">{flag}</span>
            <div>
              <p className="text-sm font-semibold text-slate-100">{countryName} · {FIELD_LABEL[field]}</p>
              <p className="text-xs text-slate-500">{currentValue.value} · {currentValue.period} · {currentValue.source}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => load(true)}
              disabled={loading || refreshing}
              className="p-1.5 rounded-md text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Span selector */}
        <div className="flex items-center gap-1 mb-3">
          {spans.map((s) => (
            <button
              key={s}
              onClick={() => setSpan(s)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                span === s
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="h-60">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="w-5 h-5 text-slate-600 animate-spin" />
            </div>
          ) : error ? (
            <div className="h-full flex items-center justify-center text-sm text-slate-600">{error}</div>
          ) : points.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-slate-600">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={points} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="date"
                  ticks={ticks}
                  tickFormatter={(d) => points.find((p) => p.date === d)?.period.replace(/\s\d{4}/, (m) => `'${m.slice(-2)}`) ?? d.slice(2, 7)}
                  tick={{ fill: '#475569', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[minV - pad, maxV + pad]}
                  tickFormatter={(v) => `${v.toFixed(1)}%`}
                  tick={{ fill: '#475569', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={48}
                />
                <Tooltip content={<CustomTooltip unit={unit} />} />
                {(minV < 0 || minV - pad < 0) && maxV > 0 && (
                  <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 2" />
                )}
                {useBars ? (
                  <Bar dataKey="value" maxBarSize={28} radius={[2, 2, 0, 0]}>
                    {points.map((p, i) => (
                      <Cell
                        key={i}
                        fill={p.fromCalendar ? '#f59e0b' : p.value >= 0 ? '#3b82f6' : '#ef4444'}
                        fillOpacity={p.fromCalendar ? 1 : 0.8}
                      />
                    ))}
                  </Bar>
                ) : (
                  <Line
                    type="stepAfter"
                    dataKey="value"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={(props) => {
                      const pt = props.payload as HistoryPoint;
                      if (!pt.fromCalendar) return <g key={props.key} />;
                      return <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill="#f59e0b" stroke="#09090b" strokeWidth={1.5} />;
                    }}
                    activeDot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && points.length > 0 && (
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-slate-700">
              {points[0].period} → {points[points.length - 1].period}
            </span>
            <span className="text-[10px] text-slate-700 font-mono">
              {points.length} observations · Source: FRED + Trading Economics
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
