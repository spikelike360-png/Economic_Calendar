'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, ReferenceLine, Tooltip,
} from 'recharts';
import type { ESIResponse, ESICurrency, ESIPoint } from '@/app/api/esi/route';

const WINDOW_OPTIONS = [
  { label: '1M', days: 30  },
  { label: '3M', days: 90  },
  { label: '6M', days: 180 },
];

function scoreColor(score: number): string {
  if (score >  30) return 'text-emerald-400';
  if (score >   5) return 'text-emerald-600';
  if (score <  -30) return 'text-red-400';
  if (score <  -5) return 'text-red-600';
  return 'text-slate-400';
}

function barColor(score: number): string {
  if (score >  0) return 'bg-emerald-500';
  if (score <  0) return 'bg-red-500';
  return 'bg-slate-600';
}

function SparkLine({ points }: { points: ESIPoint[] }) {
  const min = Math.min(...points.map(p => p.score), -10);
  const max = Math.max(...points.map(p => p.score), 10);
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 4 }}>
        <ReferenceLine y={0} stroke="#334155" strokeDasharray="3 2" />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload as ESIPoint;
            return (
              <div className="rounded border border-slate-700 bg-[#0d0d0f] px-2 py-1 text-[10px] text-slate-300">
                {d.date}: <span className={scoreColor(d.score)}>{d.score > 0 ? '+' : ''}{d.score}</span>
              </div>
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="score"
          stroke="#f59e0b"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function CurrencyCard({ c }: { c: ESICurrency }) {
  const pct = Math.abs(c.score);
  const isPositive = c.score >= 0;

  return (
    <div className="bg-[#0d1117] border border-slate-800/60 rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{c.flag}</span>
          <div>
            <p className="text-[11px] font-bold text-slate-200 font-mono tracking-wider">{c.currency}</p>
            <p className="text-[9px] text-slate-600 font-mono">{c.name}</p>
          </div>
        </div>
        <div className={`text-2xl font-bold font-mono tabular-nums ${scoreColor(c.score)}`}>
          {c.score > 0 ? '+' : ''}{c.score}
        </div>
      </div>

      {/* Score bar */}
      <div className="relative h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className={`absolute top-0 h-full rounded-full transition-all ${barColor(c.score)}`}
          style={{
            width:  `${pct}%`,
            left:   isPositive ? '50%' : `${50 - pct}%`,
            opacity: 0.8,
          }}
        />
        <div className="absolute top-0 left-1/2 w-px h-full bg-slate-600" />
      </div>

      {/* Sparkline */}
      <SparkLine points={c.points} />

      {/* Beat / Miss stats */}
      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className="text-emerald-500">↑ {c.beatCount} beat</span>
        <span className="text-slate-600">{c.inlineCount} inline</span>
        <span className="text-red-500">↓ {c.missCount} miss</span>
      </div>
      <p className="text-[9px] text-slate-700 font-mono">{c.totalReleases} releases analysed</p>
    </div>
  );
}

export default function ESISection() {
  const [data, setData]         = useState<ESIResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [window, setWindow]     = useState(90);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const r = await fetch(`/api/esi?window=${window}`, { cache: 'no-store' });
      const j: ESIResponse = await r.json();
      setData(j);
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [window]);

  useEffect(() => { load(false); }, [load]);

  const ranked = data?.results.slice().sort((a, b) => b.score - a.score) ?? [];
  const leader = ranked[0];
  const laggard = ranked[ranked.length - 1];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-100 font-mono uppercase tracking-widest">
            Economic Surprise Index
          </h2>
          <p className="text-[10px] text-slate-600 font-mono mt-0.5">
            Actual vs forecast, normalised by historical volatility · calendar releases
          </p>
        </div>
        <div className="flex items-center gap-2">
          {WINDOW_OPTIONS.map(o => (
            <button
              key={o.days}
              onClick={() => setWindow(o.days)}
              className={`px-2.5 py-1 rounded text-xs font-mono font-medium transition-colors ${
                window === o.days
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {o.label}
            </button>
          ))}
          <button
            onClick={() => load(true)}
            disabled={loading || refreshing}
            className="p-1.5 text-slate-600 hover:text-slate-300 disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary row */}
      {!loading && data && (
        <div className="flex gap-3 text-[11px] font-mono">
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            <span className="text-slate-400">Strongest:</span>
            <span className="text-emerald-400 font-bold">{leader?.flag} {leader?.currency} +{leader?.score}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5">
            <TrendingDown className="w-3 h-3 text-red-400" />
            <span className="text-slate-400">Weakest:</span>
            <span className="text-red-400 font-bold">{laggard?.flag} {laggard?.currency} {laggard?.score}</span>
          </div>
          {leader && laggard && leader.currency !== laggard.currency && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-1.5">
              <Minus className="w-3 h-3 text-amber-400" />
              <span className="text-slate-400">Spread:</span>
              <span className="text-amber-400 font-bold">{leader.score - laggard.score} pts</span>
            </div>
          )}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-600 text-sm font-mono">
          Loading releases…
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {data?.results.map(c => <CurrencyCard key={c.currency} c={c} />)}
        </div>
      )}

      <p className="text-[9px] text-slate-700 font-mono">
        Score = weighted average z-score of (actual − forecast) / historical σ per indicator, scaled ±100.
        High-impact events weighted 3×. Window: last {window}d.
      </p>
    </div>
  );
}
