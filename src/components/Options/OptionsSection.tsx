'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import {
  AreaChart, Area, ComposedChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import type {
  OptionsFlowResponse, VIXTermStructure, VIXHistoryPoint,
  OptionsChainSummary, UnusualOption, GEXData,
} from '@/lib/types';
import { clsx } from 'clsx';
import { DixGexWidget } from '@/components/Metrics/MacroWidgets';

// ── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, dec = 1) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtVol(n: number | null | undefined) {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function pcColor(pc: number) {
  if (pc < 0.7)  return 'text-emerald-400';
  if (pc <= 1.0) return 'text-amber-400';
  return 'text-red-400';
}
function pcLabel(pc: number) {
  if (pc < 0.7)  return 'BULLISH';
  if (pc <= 1.0) return 'NEUTRAL';
  return 'BEARISH';
}
function pcBg(pc: number) {
  if (pc < 0.7)  return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
  if (pc <= 1.0) return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
  return 'bg-red-500/10 border-red-500/30 text-red-400';
}

function vixColor(v: number) {
  if (v < 15) return 'text-emerald-400';
  if (v < 20) return 'text-amber-400';
  if (v < 30) return 'text-orange-400';
  return 'text-red-400';
}
function vixLabel(v: number) {
  if (v < 15) return 'CALM';
  if (v < 20) return 'LOW';
  if (v < 30) return 'ELEVATED';
  return 'HIGH FEAR';
}

// ── VIX Term Structure ─────────────────────────────────────────────────────

function VIXTermPanel({ vix, liveVix, vixTime }: { vix: VIXTermStructure; liveVix: number | null; vixTime: string }) {
  const nodes = [
    { label: '9D',  value: vix.vix9d },
    { label: 'VIX', value: vix.vix   },
    { label: '3M',  value: vix.vix3m },
    { label: '6M',  value: vix.vix6m },
  ].filter((n) => n.value !== null) as { label: string; value: number }[];

  // Determine term structure shape
  const isContango = nodes.length >= 2 && nodes.every((n, i) => i === 0 || n.value >= nodes[i - 1].value);
  const isInverted = nodes.length >= 2 && nodes.every((n, i) => i === 0 || n.value <= nodes[i - 1].value);
  const shapeLabel = isContango ? 'CONTANGO' : isInverted ? 'BACKWARDATION' : 'MIXED';
  const shapeColor = isContango ? 'text-emerald-400' : isInverted ? 'text-red-400' : 'text-amber-400';

  const vixVal = vix.vix ?? 0;

  return (
    <div className="rounded-lg border border-slate-800/60 bg-[#111113] p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-bold text-slate-100 uppercase tracking-widest">VIX Term Structure</h3>
          <p className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wider">CBOE Volatility Indices</p>
        </div>
        <div className="text-right">
          {liveVix !== null ? (
            <>
              <div className="flex items-center justify-end gap-1.5 mb-0.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[10px] text-emerald-500 font-mono uppercase tracking-wider">Live</span>
              </div>
              <span className={clsx('text-3xl font-bold font-mono tabular-nums', vixColor(liveVix))}>
                {fmt(liveVix)}
              </span>
              <p className={clsx('text-[10px] font-bold uppercase tracking-wider', vixColor(liveVix))}>
                {vixLabel(liveVix)}
              </p>
              {vixTime && (
                <p className="text-[10px] text-slate-700 font-mono mt-0.5">{vixTime} ET</p>
              )}
            </>
          ) : (
            <>
              <span className={clsx('text-2xl font-bold font-mono', vixColor(vixVal))}>
                {vixVal > 0 ? fmt(vixVal) : '—'}
              </span>
              <p className={clsx('text-[10px] font-bold uppercase tracking-wider', vixColor(vixVal))}>
                {vixVal > 0 ? vixLabel(vixVal) : ''}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Term bars */}
      <div className="space-y-2 mb-4">
        {nodes.map(({ label, value }) => {
          const max = Math.max(...nodes.map((n) => n.value), 40);
          const pct = (value / max) * 100;
          return (
            <div key={label} className="flex items-center gap-3">
              <span className="text-[10px] text-slate-500 uppercase w-8 shrink-0 font-mono">{label}</span>
              <div className="flex-1 h-1.5 bg-slate-800 relative">
                <div
                  className={clsx('h-full transition-all', vixColor(value).replace('text-', 'bg-'))}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={clsx('text-xs font-mono font-bold w-10 text-right', vixColor(value))}>
                {fmt(value)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-800/60">
        <div>
          <span className={clsx('text-[10px] font-bold uppercase tracking-wider', shapeColor)}>{shapeLabel}</span>
          <p className="text-[10px] text-slate-600 mt-0.5">term structure shape</p>
        </div>
        {vix.vvix !== null && (
          <div className="text-right">
            <span className={clsx('text-sm font-bold font-mono', vix.vvix > 100 ? 'text-orange-400' : 'text-slate-400')}>
              {fmt(vix.vvix)}
            </span>
            <p className="text-[10px] text-slate-600">VVIX</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── VIX History Chart ──────────────────────────────────────────────────────

function VIXChartPanel({ history, liveVix }: { history: VIXHistoryPoint[]; liveVix: number | null }) {
  const latest = history[history.length - 1]?.close ?? 0;
  const displayVix = liveVix ?? latest;
  const min20 = Math.min(...history.slice(-20).map((p) => p.close));
  const max20 = Math.max(...history.slice(-20).map((p) => p.close));

  const ticks = history
    .filter((_, i) => i % 10 === 0)
    .map((p) => p.date.slice(5)); // MM-DD

  return (
    <div className="rounded-lg border border-slate-800/60 bg-[#111113] p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xs font-bold text-slate-100 uppercase tracking-widest">VIX — 60 Day</h3>
          <p className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wider">
            20d range {fmt(min20)} – {fmt(max20)}
          </p>
        </div>
        <span className={clsx('text-lg font-bold font-mono', vixColor(displayVix))}>{fmt(displayVix)}</span>
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id="vixGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}   />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            ticks={ticks.length ? history.filter((_, i) => i % 10 === 0).map((p) => p.date) : undefined}
            tickFormatter={(v: string) => v.slice(5)}
            tick={{ fill: '#475569', fontSize: 9, fontFamily: 'monospace' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fill: '#475569', fontSize: 9, fontFamily: 'monospace' }}
            axisLine={false} tickLine={false}
            tickFormatter={(v: number) => fmt(v)}
          />
          <Tooltip
            contentStyle={{ background: '#050505', border: '1px solid #1e293b', borderRadius: 0, fontSize: 11 }}
            labelStyle={{ color: '#64748b' }}
            itemStyle={{ color: '#fbbf24' }}
            formatter={(v) => [fmt(Number(v)), 'VIX']}
          />
          <ReferenceLine y={20} stroke="#334155" strokeDasharray="3 3" />
          <ReferenceLine y={30} stroke="#7f1d1d" strokeDasharray="3 3" />
          <Area
            type="monotone" dataKey="close"
            stroke="#f59e0b" strokeWidth={1.5}
            fill="url(#vixGrad)" dot={false} activeDot={{ r: 3, fill: '#fbbf24' }}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-1">
        <span className="text-[9px] text-slate-700">— 20 (elevated)</span>
        <span className="text-[9px] text-red-900">— 30 (high fear)</span>
      </div>
    </div>
  );
}

// ── Options Flow Table ─────────────────────────────────────────────────────

function FlowTable({ chains }: { chains: OptionsChainSummary[] }) {
  if (!chains.length) return null;
  return (
    <div className="rounded-lg border border-slate-800/60 bg-[#111113] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/60 bg-[#0d0d0f]">
        <h3 className="text-xs font-bold text-slate-100 uppercase tracking-widest">Options Flow — Nearest Expiry</h3>
        <p className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wider">Calls vs Puts · Volume · Put/Call Ratio</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800/40 text-[10px] uppercase tracking-wider">
              <th className="text-left px-4 py-2 text-slate-600">Symbol</th>
              <th className="text-right px-3 py-2 text-slate-600">Price</th>
              <th className="text-right px-3 py-2 text-emerald-700">Calls Vol</th>
              <th className="text-right px-3 py-2 text-red-900">Puts Vol</th>
              <th className="text-right px-3 py-2 text-slate-600">P/C Vol</th>
              <th className="text-right px-3 py-2 text-slate-600">Calls OI</th>
              <th className="text-right px-3 py-2 text-slate-600">Puts OI</th>
              <th className="text-right px-3 py-2 text-slate-600">P/C OI</th>
              <th className="text-right px-4 py-2 text-slate-600">Signal</th>
            </tr>
          </thead>
          <tbody>
            {chains.map((c) => (
              <tr key={c.symbol} className="border-b border-slate-800/20 hover:bg-amber-500/5 transition-colors">
                <td className="px-4 py-2.5">
                  <span className="font-bold text-amber-300">{c.symbol}</span>
                  <span className="text-[10px] text-slate-600 ml-2">{c.expiryDate.slice(5)}</span>
                </td>
                <td className="text-right px-3 py-2.5 text-slate-300">{fmt(c.price, 2)}</td>
                <td className="text-right px-3 py-2.5 text-emerald-400">{fmtVol(c.callsVolume)}</td>
                <td className="text-right px-3 py-2.5 text-red-400">{fmtVol(c.putsVolume)}</td>
                <td className={clsx('text-right px-3 py-2.5 font-bold', pcColor(c.pcVolume))}>{fmt(c.pcVolume, 2)}</td>
                <td className="text-right px-3 py-2.5 text-slate-500">{fmtVol(c.callsOI)}</td>
                <td className="text-right px-3 py-2.5 text-slate-500">{fmtVol(c.putsOI)}</td>
                <td className={clsx('text-right px-3 py-2.5', pcColor(c.pcOI))}>{fmt(c.pcOI, 2)}</td>
                <td className="text-right px-4 py-2.5">
                  <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 border', pcBg(c.pcVolume))}>
                    {pcLabel(c.pcVolume)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 border-t border-slate-800/40 text-[10px] text-slate-700 flex gap-4">
        <span className="text-emerald-700">P/C &lt; 0.70 = BULLISH</span>
        <span className="text-amber-700">0.70–1.00 = NEUTRAL</span>
        <span className="text-red-900">P/C &gt; 1.00 = BEARISH</span>
      </div>
    </div>
  );
}

// ── Unusual Activity Table ─────────────────────────────────────────────────

function UnusualTable({ chains }: { chains: OptionsChainSummary[] }) {
  const all: UnusualOption[] = chains
    .flatMap((c) => c.unusual)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 30);

  if (!all.length) return null;

  return (
    <div className="rounded-lg border border-slate-800/60 bg-[#111113] overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800/60 bg-[#0d0d0f]">
        <h3 className="text-xs font-bold text-slate-100 uppercase tracking-widest">Unusual Activity</h3>
        <p className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wider">Vol/OI ≥ 0.5 · Vol ≥ 200 · sorted by volume</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800/40 text-[10px] uppercase tracking-wider">
              <th className="text-left px-4 py-2 text-slate-600">Symbol</th>
              <th className="text-left px-3 py-2 text-slate-600">Type</th>
              <th className="text-right px-3 py-2 text-slate-600">Strike</th>
              <th className="text-right px-3 py-2 text-slate-600">Expiry</th>
              <th className="text-right px-3 py-2 text-slate-600">Volume</th>
              <th className="text-right px-3 py-2 text-slate-600">OI</th>
              <th className="text-right px-3 py-2 text-slate-600">Vol/OI</th>
              <th className="text-right px-4 py-2 text-slate-600">IV</th>
            </tr>
          </thead>
          <tbody>
            {all.map((u, i) => (
              <tr key={i} className="border-b border-slate-800/20 hover:bg-amber-500/5 transition-colors">
                <td className="px-4 py-2 font-bold text-amber-300">{u.symbol}</td>
                <td className="px-3 py-2">
                  <span className={clsx(
                    'text-[10px] font-bold px-1.5 py-0.5 border',
                    u.type === 'call'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-red-500/10 border-red-500/30 text-red-400',
                  )}>
                    {u.type.toUpperCase()}
                  </span>
                </td>
                <td className="text-right px-3 py-2 text-slate-300">{fmt(u.strike, 0)}</td>
                <td className="text-right px-3 py-2 text-slate-500">{u.expiry.slice(5)}</td>
                <td className="text-right px-3 py-2 text-slate-200 font-bold">{fmtVol(u.volume)}</td>
                <td className="text-right px-3 py-2 text-slate-500">{fmtVol(u.openInterest)}</td>
                <td className={clsx('text-right px-3 py-2 font-bold', u.ratio >= 2 ? 'text-amber-400' : 'text-slate-400')}>
                  {fmt(u.ratio, 2)}x
                </td>
                <td className="text-right px-4 py-2 text-slate-500">{u.iv > 0 ? `${fmt(u.iv, 1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── GEX Panel ─────────────────────────────────────────────────────────────

function GEXPanel({ gexList }: { gexList: GEXData[] }) {
  const [active, setActive] = useState<string>(gexList[0]?.symbol ?? 'SPY');
  const gex = gexList.find((g) => g.symbol === active) ?? gexList[0];
  if (!gex) return null;

  const hasData = gex.strikes.length > 0 && gex.netGEX !== 0;

  const isLongGamma = gex.netGEX >= 0;
  const netB        = gex.netGEX / 1e9;
  const toB         = (v: number) => (v / 1e9).toFixed(2);

  // Custom tooltip
  const GEXTooltip = ({ active: a, payload, label }: {
    active?: boolean; payload?: { value: number }[]; label?: number;
  }) => {
    if (!a || !payload?.length) return null;
    const net = payload[0]?.value ?? 0;
    return (
      <div className="bg-[#050505] border border-slate-800 px-2 py-1.5 text-[10px] font-mono">
        <p className="text-slate-500">Strike ${label}</p>
        <p className={net >= 0 ? 'text-emerald-400' : 'text-red-400'}>
          Net GEX: ${toB(net)}B
        </p>
      </div>
    );
  };

  // X-axis ticks: every 5 strikes
  const strikes = gex.strikes;
  const tickEvery = Math.max(1, Math.floor(strikes.length / 8));
  const xTicks = strikes.filter((_, i) => i % tickEvery === 0).map((s) => s.strike);

  // Y-axis domain: clip to 95th-percentile of |netGEX| so one outlier bar doesn't collapse the scale
  const absVals = strikes.map((s) => Math.abs(s.netGEX)).sort((a, b) => a - b);
  const p95     = absVals[Math.floor(absVals.length * 0.95)] ?? 1e9;
  const yMax    = p95 * 1.4;
  const yMin    = -p95 * 0.6;
  const yDomain: [number, number] = [yMin, yMax];

  return (
    <div className="rounded-lg border border-slate-800/60 bg-[#111113] overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800/60 bg-[#0d0d0f] flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-slate-100 uppercase tracking-widest">Gamma Exposure (GEX)</h3>
          <p className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wider">
            Black-Scholes · 3 nearest expiries · ±10% of spot
          </p>
        </div>
        {/* Symbol tabs */}
        <div className="flex gap-1">
          {gexList.map((g) => (
            <button
              key={g.symbol}
              onClick={() => setActive(g.symbol)}
              className={clsx(
                'text-[10px] font-bold px-2 py-1 border uppercase tracking-wider transition-colors',
                g.symbol === active
                  ? 'border-amber-500/40 text-amber-300 bg-amber-500/15'
                  : 'border-slate-700/60 text-slate-600 hover:text-amber-400 hover:border-amber-700',
              )}
            >
              {g.symbol}
            </button>
          ))}
        </div>
      </div>

      {/* Key metrics row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-800/40">
        {/* Net GEX */}
        <div className="px-4 py-3 border-r border-slate-800/40">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">Net GEX</p>
          <p className={clsx('text-xl font-bold font-mono mt-1', isLongGamma ? 'text-emerald-400' : 'text-red-400')}>
            {netB >= 0 ? '+' : ''}{netB.toFixed(2)}B
          </p>
          <p className={clsx('text-[10px] font-bold uppercase tracking-wider', isLongGamma ? 'text-emerald-600' : 'text-red-700')}>
            {isLongGamma ? '▲ LONG GAMMA' : '▼ SHORT GAMMA'}
          </p>
        </div>

        {/* Spot */}
        <div className="px-4 py-3 border-r border-slate-800/40">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">Spot</p>
          <p className="text-xl font-bold font-mono mt-1 text-amber-300">${fmt(gex.spot, 2)}</p>
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">{gex.symbol}</p>
        </div>

        {/* Max GEX strike */}
        <div className="px-4 py-3 border-r border-slate-800/40">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">Max GEX Strike</p>
          <p className="text-xl font-bold font-mono mt-1 text-emerald-400">${fmt(gex.maxGEXStrike, 0)}</p>
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">magnet level</p>
        </div>

        {/* Gamma flip */}
        <div className="px-4 py-3">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">Gamma Flip</p>
          <p className={clsx('text-xl font-bold font-mono mt-1', gex.gammaFlip ? 'text-amber-400' : 'text-slate-600')}>
            {gex.gammaFlip ? `$${fmt(gex.gammaFlip, 0)}` : '—'}
          </p>
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">
            {gex.gammaFlip
              ? gex.spot > gex.gammaFlip ? 'above flip → support' : 'below flip → accel'
              : 'no flip nearby'}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="px-4 pt-4 pb-2">
        {!hasData && (
          <div className="flex items-center justify-center h-48 text-[10px] text-slate-600 uppercase tracking-widest font-mono">
            OI data unavailable · GEX updates pre-market (~8:30 AM ET)
          </div>
        )}
        <ResponsiveContainer width="100%" height={hasData ? 200 : 0}>
          <ComposedChart data={strikes} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="strike"
              ticks={xTicks}
              tickFormatter={(v: number) => `$${v}`}
              tick={{ fill: '#475569', fontSize: 9, fontFamily: 'monospace' }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(v: number) => `${(v / 1e9).toFixed(1)}B`}
              tick={{ fill: '#475569', fontSize: 9, fontFamily: 'monospace' }}
              axisLine={false} tickLine={false} width={42}
            />
            <Tooltip content={<GEXTooltip />} />

            {/* Zero line */}
            <ReferenceLine y={0} stroke="#334155" strokeWidth={1} />

            {/* Spot price */}
            <ReferenceLine
              x={gex.spot}
              stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5}
              label={{ value: 'SPOT', position: 'top', fill: '#f59e0b', fontSize: 9, fontFamily: 'monospace' }}
            />

            {/* Max GEX */}
            {gex.maxGEXStrike !== gex.spot && (
              <ReferenceLine
                x={gex.maxGEXStrike}
                stroke="#10b981" strokeDasharray="3 3" strokeWidth={1}
                label={{ value: 'MAX', position: 'top', fill: '#10b981', fontSize: 9, fontFamily: 'monospace' }}
              />
            )}

            {/* Gamma flip */}
            {gex.gammaFlip && (
              <ReferenceLine
                x={gex.gammaFlip}
                stroke="#f97316" strokeDasharray="3 3" strokeWidth={1}
                label={{ value: 'FLIP', position: 'insideTopRight', fill: '#f97316', fontSize: 9, fontFamily: 'monospace' }}
              />
            )}

            <Bar dataKey="netGEX" maxBarSize={16}>
              {strikes.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.netGEX >= 0 ? '#059669' : '#dc2626'}
                  fillOpacity={Math.abs(entry.strike - gex.spot) < gex.spot * 0.02 ? 1 : 0.7}
                />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="px-4 pb-3 flex flex-wrap gap-4 text-[9px] text-slate-700 font-mono uppercase tracking-wider">
        <span className="text-emerald-800">█ positive gex — dealers buy dips / sell rips</span>
        <span className="text-red-900">█ negative gex — dealers amplify moves</span>
        <span className="text-amber-700">— spot · — — max gex</span>
      </div>
    </div>
  );
}

// ── Main Section ───────────────────────────────────────────────────────────

const REFRESH_MS   = 15 * 60 * 1000;
const VIX_POLL_MS  = 2_000;

export default function OptionsSection() {
  const [data, setData]         = useState<OptionsFlowResponse | null>(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liveVix,  setLiveVix]  = useState<number | null>(null);
  const [vixTime,  setVixTime]  = useState<string>('');

  const load = async (silent = false) => {
    if (silent) setRefreshing(true);
    try {
      const res = await fetch('/api/options');
      const json: OptionsFlowResponse = await res.json();
      setData(json);
    } catch {
      // keep existing data
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Live VIX — same Yahoo Finance proxy used in Alerts
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await fetch('/api/quote?symbols=VIX', { cache: 'no-store' });
        if (!r.ok || cancelled) return;
        const d: Record<string, number> = await r.json();
        if (cancelled) return;
        if (d.VIX) {
          setLiveVix(d.VIX);
          setVixTime(new Date().toLocaleTimeString('en-US', {
            timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
          }));
        }
      } catch { /* silently ignore */ }
    };
    poll();
    const id = setInterval(poll, VIX_POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    load(false);
    const id = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-slate-800/60 bg-[#0d0d0f] px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-widest">Option Flow</h2>
          <p className="text-[10px] text-slate-600 mt-0.5 uppercase tracking-wider">
            CBOE VIX · Yahoo Finance · SPY QQQ IWM GLD TLT
          </p>
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-[10px] text-slate-600 font-mono hidden sm:inline">
              {new Date(data.fetchedAt).toLocaleTimeString('en-US', {
                timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
              })} ET
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-slate-400 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/30 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-800/60 bg-[#111113] flex items-center justify-center h-64">
          <div className="text-slate-600 text-xs uppercase tracking-widest animate-pulse">Loading market data…</div>
        </div>
      ) : data?.error ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center gap-2 text-amber-400 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {data.error}
        </div>
      ) : (
        <>
          {/* VIX row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data?.vix && <VIXTermPanel vix={data.vix} liveVix={liveVix} vixTime={vixTime} />}
            {data?.vixHistory.length ? <VIXChartPanel history={data.vixHistory} liveVix={liveVix} /> : null}
          </div>

          {/* GEX */}
          {data?.gex?.length ? <GEXPanel gexList={data.gex} /> : null}

          {/* Unusual activity — hidden */}
          {/* {data?.chains.length ? <UnusualTable chains={data.chains} /> : null} */}

          {!data?.vix && !data?.chains.length && (
            <div className="rounded-lg border border-slate-800/60 bg-[#111113] flex items-center justify-center h-40">
              <p className="text-slate-600 text-xs uppercase tracking-widest">No data available — CBOE / Yahoo Finance may be unreachable</p>
            </div>
          )}
        </>
      )}

      {/* DIX / GEX — always shown */}
      <DixGexWidget />

      {/* Flow table — nearest expiry */}
      {data?.chains.length ? <FlowTable chains={data.chains} /> : null}
    </div>
  );
}
