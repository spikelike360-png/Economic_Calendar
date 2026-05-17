'use client';

import { useEffect, useState } from 'react';
import { Gauge, RefreshCw, AlertTriangle } from 'lucide-react';
import type { GexbotResponse, GexbotInstrument, GexbotStockRow, GexbotMajors } from '@/lib/types';

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtGex(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
function calcBreakoutProb(spot: number, zeroGamma: number, netGex: number): number {
  const base    = netGex < 0 ? 0.68 : 0.28;
  const distPct = spot > 0 ? Math.abs(spot - zeroGamma) / spot : 0;
  return Math.round(Math.min(0.92, Math.max(0.08, base + (distPct < 0.005 ? 0.10 : 0))) * 100);
}

// ── Realistic speedometer ─────────────────────────────────────────────────────

function SpeedometerGauge({ value, noData = false }: { value: number; noData?: boolean }) {
  const cx = 110, cy = 100, r = 78, sw = 8;

  function toXY(deg: number, radius: number): [number, number] {
    const rad = (deg * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy - radius * Math.sin(rad)];
  }

  // Semicircle 180° → 0° (left=0%, right=100%), clockwise visually
  function arcD(a1: number, a2: number, rad = r): string {
    const [sx, sy] = toXY(a1, rad);
    const [ex, ey] = toXY(a2, rad);
    return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${rad} ${rad} 0 ${a1 - a2 > 180 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  }

  const angle    = 180 - 1.8 * value;
  const greenEnd = 180 - 1.8 * 45;  // 99°
  const amberEnd = 180 - 1.8 * 65;  // 63°

  // Triangular needle
  const [ntx, nty]  = toXY(angle, r - 6);
  const [nb1x, nb1y] = toXY(angle + 90, 7);
  const [nb2x, nb2y] = toXY(angle - 90, 7);

  const majorTicks = [0, 25, 50, 75, 100];
  const minorTicks = [10, 20, 30, 40, 60, 70, 80, 90];

  const valColor = value >= 65 ? '#f87171' : value >= 45 ? '#fbbf24' : '#4ade80';

  return (
    <svg viewBox="0 0 220 148" className="w-full">
      {/* Gauge face */}
      <circle cx={cx} cy={cy} r={r + sw + 10} fill="#080d14" />
      <circle cx={cx} cy={cy} r={r + sw + 11} fill="none" stroke="#1e293b" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={r + sw + 8}  fill="none" stroke="#0f172a" strokeWidth="0.5" />

      {/* Background arc */}
      <path d={arcD(180, 0)} fill="none" stroke="#0f1f33" strokeWidth={sw + 4} />

      {/* Color zone arcs — muted/dark base */}
      <path d={arcD(180, greenEnd)} fill="none" stroke="#14532d" strokeWidth={sw} opacity={noData ? 0.15 : 1} />
      <path d={arcD(greenEnd, amberEnd)} fill="none" stroke="#78350f" strokeWidth={sw} opacity={noData ? 0.15 : 1} />
      <path d={arcD(amberEnd, 0)} fill="none" stroke="#7f1d1d" strokeWidth={sw} opacity={noData ? 0.15 : 1} />

      {/* Bright inner edge on zones */}
      <path d={arcD(180, greenEnd, r - sw / 2)} fill="none" stroke="#22c55e" strokeWidth="1.2" strokeOpacity={noData ? 0 : 0.55} />
      <path d={arcD(greenEnd, amberEnd, r - sw / 2)} fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeOpacity={noData ? 0 : 0.55} />
      <path d={arcD(amberEnd, 0, r - sw / 2)} fill="none" stroke="#ef4444" strokeWidth="1.2" strokeOpacity={noData ? 0 : 0.55} />

      {/* Zone divider lines */}
      {[0, 45, 65, 100].map((t) => {
        const a = 180 - 1.8 * t;
        const [x1, y1] = toXY(a, r + sw / 2 + 3);
        const [x2, y2] = toXY(a, r - sw / 2 - 3);
        return <line key={t} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)} stroke="#080d14" strokeWidth="2.5" />;
      })}

      {/* Major ticks + labels */}
      {majorTicks.map((t) => {
        const a = 180 - 1.8 * t;
        const [x1, y1] = toXY(a, r + sw / 2 + 2);
        const [x2, y2] = toXY(a, r - sw / 2 - 5);
        const [lx, ly] = toXY(a, r + sw / 2 + 14);
        return (
          <g key={t}>
            <line x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)} stroke="#334155" strokeWidth="1.5" />
            <text x={lx.toFixed(1)} y={(ly + 3).toFixed(1)} textAnchor="middle" fill="#1e3a5f" fontFamily="monospace" fontSize="8">{t}</text>
          </g>
        );
      })}

      {/* Minor ticks */}
      {minorTicks.map((t) => {
        const a = 180 - 1.8 * t;
        const [x1, y1] = toXY(a, r + sw / 2 + 1);
        const [x2, y2] = toXY(a, r - sw / 2 - 2);
        return <line key={t} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)} stroke="#1e293b" strokeWidth="1" />;
      })}

      {/* Needle shadow */}
      {!noData && (
        <polygon
          points={`${ntx.toFixed(1)},${nty.toFixed(1)} ${nb1x.toFixed(1)},${nb1y.toFixed(1)} ${nb2x.toFixed(1)},${nb2y.toFixed(1)}`}
          fill="#000" opacity="0.5" transform="translate(1.5,1.5)"
        />
      )}

      {/* Needle */}
      {!noData && (
        <polygon
          points={`${ntx.toFixed(1)},${nty.toFixed(1)} ${nb1x.toFixed(1)},${nb1y.toFixed(1)} ${nb2x.toFixed(1)},${nb2y.toFixed(1)}`}
          fill="#e2e8f0"
        />
      )}

      {/* Metallic hub */}
      <circle cx={cx} cy={cy} r="12" fill="#0f172a" stroke="#1e293b" strokeWidth="2.5" />
      <circle cx={cx} cy={cy} r="7"  fill="#1e293b" stroke="#334155" strokeWidth="1" />
      <circle cx={cx} cy={cy} r="3"  fill="#475569" />

      {/* Value */}
      {noData ? (
        <text x={cx} y={cy + 22} textAnchor="middle" fill="#1e293b" fontFamily="monospace" fontSize="16" fontWeight="bold">—</text>
      ) : (
        <>
          <text x={cx} y={cy + 21} textAnchor="middle" fill={valColor}
            fontFamily="monospace" fontSize="21" fontWeight="bold" letterSpacing="-0.5">
            {value}%
          </text>
          <text x={cx} y={cy + 33} textAnchor="middle" fill="#1e3a5f" fontFamily="monospace" fontSize="7" letterSpacing="1.5">
            BREAKOUT PROB
          </text>
        </>
      )}
    </svg>
  );
}

// ── Index card ────────────────────────────────────────────────────────────────

function IndexCard({ inst, mode }: { inst: GexbotInstrument; mode: 'oi' | 'vol' }) {
  const { ticker, majors, distToFlipPts, aboveFlip } = inst;

  const activeNetGex   = majors ? (mode === 'oi' ? majors.net_gex_oi  : majors.net_gex_vol)  : 0;
  const activeCallWall = majors ? (mode === 'oi' ? majors.mpos_oi     : majors.mpos_vol)     : 0;
  const activePutWall  = majors ? (mode === 'oi' ? majors.mneg_oi     : majors.mneg_vol)     : 0;
  const breakoutProb   = majors ? calcBreakoutProb(majors.spot, majors.zero_gamma, activeNetGex) : 50;
  const isNeg          = activeNetGex < 0;
  const regimeColor    = isNeg ? 'text-red-400' : 'text-emerald-400';
  const conflict       = majors ? (majors.net_gex_oi < 0) !== (majors.net_gex_vol < 0) : false;

  return (
    <div className="flex-1 min-w-0 bg-[#080d14] border border-slate-800/50 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-800/40">
        <span className="text-[14px] font-bold text-amber-300 font-mono tracking-widest">{ticker}</span>
        {majors && <span className="text-[11px] text-slate-500 font-mono">{fmtPrice(majors.spot)}</span>}
      </div>

      <div className="px-2 pt-2 pb-0">
        <SpeedometerGauge value={breakoutProb} noData={!majors} />
      </div>

      <div className={`text-center text-[9px] font-bold uppercase tracking-widest font-mono pb-3 ${majors ? regimeColor : 'text-slate-700'}`}>
        {majors ? (isNeg ? '⚡ NEG GEX · TRENDING' : '◈ POS GEX · PINNING') : '· · ·'}
      </div>

      {majors && (
        <div className="px-4 pb-4 border-t border-slate-800/40 pt-3 space-y-1.5">
          {conflict && (
            <div className="text-[9px] text-amber-600 bg-amber-500/8 border border-amber-500/15 rounded px-2 py-0.5 font-mono uppercase tracking-widest">
              ⚠ OI vs Vol conflict
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">Gamma Flip</span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-slate-300 font-mono">{fmtPrice(majors.zero_gamma)}</span>
              <span className={`text-[10px] font-bold font-mono ${aboveFlip ? 'text-emerald-500' : 'text-red-500'}`}>
                {aboveFlip ? '▲' : '▼'}{Math.abs(Math.round(distToFlipPts))}
              </span>
            </div>
          </div>
          <div className="border-t border-slate-800/30" />
          <div className="flex justify-between items-center">
            <span className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">Call Wall</span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-red-400 font-mono">{fmtPrice(activeCallWall)}</span>
              <span className={`text-[9px] font-mono ${activeCallWall > majors.spot ? 'text-red-600' : 'text-emerald-600'}`}>
                {activeCallWall > majors.spot ? '▲' : '▼'}
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">Put Wall</span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-emerald-400 font-mono">{fmtPrice(activePutWall)}</span>
              <span className={`text-[9px] font-mono ${activePutWall > majors.spot ? 'text-red-600' : 'text-emerald-600'}`}>
                {activePutWall > majors.spot ? '▲' : '▼'}
              </span>
            </div>
          </div>
          <div className="border-t border-slate-800/30" />
          <div className="flex justify-between items-center">
            <span className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">
              Net GEX <span className="text-amber-700">({mode.toUpperCase()})</span>
            </span>
            <span className={`text-[11px] font-mono ${activeNetGex < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {activeNetGex >= 0 ? '+' : ''}{fmtGex(activeNetGex)}
            </span>
          </div>
          <div className="flex justify-between items-center opacity-35">
            <span className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">
              Net GEX ({mode === 'oi' ? 'VOL' : 'OI'})
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {(mode === 'oi' ? majors.net_gex_vol : majors.net_gex_oi) >= 0 ? '+' : ''}
              {fmtGex(mode === 'oi' ? majors.net_gex_vol : majors.net_gex_oi)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Aggregate score panel ─────────────────────────────────────────────────────

function AggregatePanel({
  stocks, aggregate, mode, ndxRegime,
}: {
  stocks: GexbotStockRow[];
  aggregate: { weightedScore: number; negCount: number; posCount: number; dataCount: number };
  mode: 'oi' | 'vol';
  ndxRegime: 'positive' | 'negative' | null;
}) {
  const score  = aggregate.weightedScore;                          // -1 to +1
  const pct    = ((score + 1) / 2) * 100;                         // 0–100 for bar width
  const isNeg  = score < 0;
  const barColor = isNeg ? 'bg-red-600' : 'bg-emerald-600';
  const scoreColor = isNeg ? 'text-red-400' : 'text-emerald-400';

  // Alignment: do most stocks agree with NDX?
  const stocksRegime = score < -0.1 ? 'negative' : score > 0.1 ? 'positive' : null;
  const aligned = ndxRegime !== null && stocksRegime !== null && ndxRegime === stocksRegime;
  const mixed   = stocksRegime === null;

  return (
    <div className="border border-slate-800/40 rounded-lg p-4 bg-[#080d14] space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 font-mono">
          NDX Constituent GEX Score
        </span>
        <span className="text-[9px] text-slate-600 font-mono">
          {aggregate.dataCount}/10 stocks · {aggregate.negCount} NEG · {aggregate.posCount} POS
        </span>
      </div>

      {/* Weighted score bar */}
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">Weighted Score</span>
          <span className={`text-[14px] font-bold font-mono ${scoreColor}`}>
            {score >= 0 ? '+' : ''}{score.toFixed(2)}
          </span>
        </div>
        <div className="relative h-2 bg-slate-900 rounded-full overflow-hidden">
          {/* Center marker */}
          <div className="absolute left-1/2 top-0 w-px h-full bg-slate-600 z-10" />
          {/* Score bar — from center */}
          <div
            className={`absolute top-0 h-full ${barColor} transition-all duration-500`}
            style={isNeg
              ? { right: '50%', width: `${(1 - pct / 100) * 50}%` }
              : { left: '50%',  width: `${(pct / 100 - 0.5) * 100}%` }
            }
          />
        </div>
        <div className="flex justify-between text-[8px] text-slate-700 font-mono mt-0.5">
          <span>−1.0 ALL NEG</span>
          <span>0 MIXED</span>
          <span>ALL POS +1.0</span>
        </div>
      </div>

      {/* Alignment signal */}
      <div className={`text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded border ${
        mixed
          ? 'text-slate-600 border-slate-800 bg-slate-900/30'
          : aligned
            ? 'text-amber-400 border-amber-500/30 bg-amber-500/8'
            : 'text-slate-500 border-slate-700/30 bg-slate-900/30'
      }`}>
        {mixed
          ? '· Mixed constituent signals — no clear regime'
          : aligned
            ? `⚡ ALIGNED — Stocks ${isNeg ? 'NEG' : 'POS'} GEX matches NDX → stronger signal`
            : `◇ DIVERGED — Stocks vs NDX disagree → transition possible`
        }
      </div>

      {/* Per-stock bars (score pesato) */}
      <div className="space-y-1">
        <span className="text-[8px] text-slate-700 uppercase tracking-widest font-mono">Score per stock ({mode.toUpperCase()})</span>
        {stocks.map((s) => {
          const activeNetGex = mode === 'oi' ? (s.majors?.net_gex_oi ?? 0) : (s.majors?.net_gex_vol ?? 0);
          const regime = activeNetGex < 0 ? 'negative' : 'positive';
          const prob   = s.majors ? calcBreakoutProb(s.majors.spot, s.majors.zero_gamma, activeNetGex) : 50;
          const barW   = s.majors ? s.ndxWeight * (Math.abs(prob - 50) / 50) : 0;
          const color  = regime === 'negative' ? 'bg-red-600' : 'bg-emerald-700';
          const maxW   = 12; // max weight ≈ 8.4%, scale to fill bar

          return (
            <div key={s.ticker} className="flex items-center gap-2">
              <span className="text-[9px] text-slate-500 font-mono w-10 shrink-0">{s.ticker}</span>
              <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                {s.majors ? (
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: `${Math.min(100, (barW / maxW) * 100)}%` }}
                  />
                ) : (
                  <div className="h-full w-full bg-slate-800/30" />
                )}
              </div>
              <span className={`text-[9px] font-mono w-8 text-right ${s.majors ? (regime === 'negative' ? 'text-red-500' : 'text-emerald-600') : 'text-slate-700'}`}>
                {s.majors ? `${prob}%` : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stocks table ──────────────────────────────────────────────────────────────

function StocksTable({ stocks, mode }: { stocks: GexbotStockRow[]; mode: 'oi' | 'vol' }) {
  return (
    <div className="border border-slate-800/40 rounded-lg overflow-hidden bg-[#080d14]">
      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-4 px-3 py-2 border-b border-slate-800/40 bg-slate-900/30">
        {['Stock', 'Wt%', 'Spot', 'Regime', 'Prob', 'Flip / Dist'].map((h) => (
          <span key={h} className="text-[8px] text-slate-600 uppercase tracking-widest font-mono">{h}</span>
        ))}
      </div>

      {/* Rows */}
      {stocks.map((s, idx) => {
        const m          = s.majors as GexbotMajors | null;
        const netGex     = m ? (mode === 'oi' ? m.net_gex_oi : m.net_gex_vol) : 0;
        const regime     = netGex < 0 ? 'negative' : 'positive';
        const prob       = m ? calcBreakoutProb(m.spot, m.zero_gamma, netGex) : null;
        const isNeg      = regime === 'negative';
        const dotColor   = isNeg ? 'bg-red-500' : 'bg-emerald-500';
        const probColor  = prob == null ? 'text-slate-700'
          : prob >= 65 ? 'text-red-400'
          : prob >= 45 ? 'text-amber-400'
          : 'text-emerald-400';
        const dist       = m ? Math.round(m.spot - m.zero_gamma) : null;

        return (
          <div
            key={s.ticker}
            className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-x-4 px-3 py-2 items-center border-b border-slate-900/60 hover:bg-slate-800/10 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-900/10'}`}
          >
            {/* Stock */}
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${m ? dotColor : 'bg-slate-700'}`} />
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-slate-200 font-mono">{s.ticker}</span>
                <span className="text-[9px] text-slate-600 ml-1.5 hidden sm:inline">{s.name}</span>
              </div>
            </div>

            {/* Weight */}
            <span className="text-[10px] text-slate-500 font-mono text-right">{s.ndxWeight}%</span>

            {/* Spot */}
            <span className="text-[10px] text-slate-400 font-mono text-right">
              {m ? fmtPrice(m.spot) : '—'}
            </span>

            {/* Regime */}
            <span className={`text-[9px] font-bold font-mono uppercase text-right ${m ? (isNeg ? 'text-red-500' : 'text-emerald-600') : 'text-slate-700'}`}>
              {m ? (isNeg ? 'NEG' : 'POS') : '—'}
            </span>

            {/* Prob */}
            <span className={`text-[11px] font-bold font-mono text-right ${probColor}`}>
              {prob != null ? `${prob}%` : '—'}
            </span>

            {/* Flip / Dist */}
            <div className="text-right">
              {m ? (
                <>
                  <span className="text-[10px] text-slate-400 font-mono">{fmtPrice(m.zero_gamma)}</span>
                  <span className={`text-[9px] font-mono ml-1 ${dist! > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {dist! > 0 ? '▲' : '▼'}{Math.abs(dist!)}
                  </span>
                </>
              ) : (
                <span className="text-[10px] text-slate-700">—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

export default function GEXBotSection() {
  const [data, setData]       = useState<GexbotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [mode, setMode]       = useState<'oi' | 'vol'>('oi');

  async function load(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res  = await fetch('/api/gexbot', { cache: 'no-store' });
      const json = (await res.json()) as GexbotResponse;
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 60 * 1000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ndxInst    = data?.instruments.find((i) => i.ticker === 'NDX') ?? null;
  const ndxRegime  = ndxInst?.majors
    ? ((mode === 'oi' ? ndxInst.majors.net_gex_oi : ndxInst.majors.net_gex_vol) < 0 ? 'negative' : 'positive')
    : null;

  return (
    <div className="space-y-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-amber-400" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-amber-400">GEX Intelligence</h2>
          <span className="text-[9px] text-slate-600 uppercase font-mono">· 0DTE</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {(['oi', 'vol'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`text-[9px] px-2.5 py-0.5 rounded font-mono uppercase tracking-widest border transition-colors ${
                  mode === m
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                    : 'text-slate-600 border-slate-800 hover:text-slate-400 hover:border-slate-700'
                }`}>
                {m.toUpperCase()}
              </button>
            ))}
          </div>
          {data && <span className="text-[9px] text-slate-600 font-mono">{timeAgo(data.fetchedAt)}</span>}
          <button onClick={() => load()} className="text-slate-600 hover:text-amber-400 transition-colors">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {loading && (
        <div className="text-[10px] text-slate-600 uppercase tracking-widest text-center py-16 font-mono">
          Loading GEX data — fetching 12 instruments…
        </div>
      )}

      {!loading && data && (
        <>
          {/* Top row: SPX | NDX | Aggregate */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {data.instruments.map((inst) => (
              <IndexCard key={inst.ticker} inst={inst} mode={mode} />
            ))}
            <AggregatePanel
              stocks={data.stocks}
              aggregate={data.aggregate}
              mode={mode}
              ndxRegime={ndxRegime as 'positive' | 'negative' | null}
            />
          </div>

          {/* Stock table — full width */}
          <StocksTable stocks={data.stocks} mode={mode} />

          {/* Legend */}
          <div className="flex gap-4 text-[8px] uppercase tracking-widest font-mono">
            <span className="text-emerald-700">■ &lt;45% Pinning</span>
            <span className="text-amber-700">■ 45–65% Neutral</span>
            <span className="text-red-700">■ &gt;65% Breakout</span>
          </div>
        </>
      )}
    </div>
  );
}
