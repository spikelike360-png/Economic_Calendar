'use client';

import { useEffect, useState } from 'react';
import { Gauge, RefreshCw, AlertTriangle } from 'lucide-react';
import type {
  GexbotResponse, GexbotMajors, GexbotModelData,
  GexbotIndex, GexbotStock, GexbotAggregateScore,
} from '@/lib/types';

// ── Formatters ────────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtGex(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(2);
}
function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

// ── Speedometer ───────────────────────────────────────────────────────────────

function SpeedometerGauge({ value, noData = false }: { value: number; noData?: boolean }) {
  const cx = 110, cy = 100, r = 78, sw = 8;

  function toXY(deg: number, radius: number): [number, number] {
    const rad = (deg * Math.PI) / 180;
    return [cx + radius * Math.cos(rad), cy - radius * Math.sin(rad)];
  }
  function arcD(a1: number, a2: number, rad = r): string {
    const [sx, sy] = toXY(a1, rad);
    const [ex, ey] = toXY(a2, rad);
    return `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${rad} ${rad} 0 ${a1 - a2 > 180 ? 1 : 0} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  }

  const angle    = 180 - 1.8 * value;
  const greenEnd = 180 - 1.8 * 45;
  const amberEnd = 180 - 1.8 * 65;
  const [ntx, nty]   = toXY(angle, r - 6);
  const [nb1x, nb1y] = toXY(angle + 90, 7);
  const [nb2x, nb2y] = toXY(angle - 90, 7);
  const majorTicks = [0, 25, 50, 75, 100];
  const minorTicks = [10, 20, 30, 40, 60, 70, 80, 90];
  const valColor = value >= 65 ? '#f87171' : value >= 45 ? '#fbbf24' : '#4ade80';

  return (
    <svg viewBox="0 0 220 148" className="w-full">
      <circle cx={cx} cy={cy} r={r + sw + 10} fill="#080d14" />
      <circle cx={cx} cy={cy} r={r + sw + 11} fill="none" stroke="#1e293b" strokeWidth="1.5" />
      <path d={arcD(180, 0)} fill="none" stroke="#0f1f33" strokeWidth={sw + 4} />
      <path d={arcD(180, greenEnd)} fill="none" stroke="#14532d" strokeWidth={sw} opacity={noData ? 0.15 : 1} />
      <path d={arcD(greenEnd, amberEnd)} fill="none" stroke="#78350f" strokeWidth={sw} opacity={noData ? 0.15 : 1} />
      <path d={arcD(amberEnd, 0)} fill="none" stroke="#7f1d1d" strokeWidth={sw} opacity={noData ? 0.15 : 1} />
      <path d={arcD(180, greenEnd, r - sw / 2)} fill="none" stroke="#22c55e" strokeWidth="1.2" strokeOpacity={noData ? 0 : 0.55} />
      <path d={arcD(greenEnd, amberEnd, r - sw / 2)} fill="none" stroke="#f59e0b" strokeWidth="1.2" strokeOpacity={noData ? 0 : 0.55} />
      <path d={arcD(amberEnd, 0, r - sw / 2)} fill="none" stroke="#ef4444" strokeWidth="1.2" strokeOpacity={noData ? 0 : 0.55} />
      {[0, 45, 65, 100].map((t) => {
        const a = 180 - 1.8 * t;
        const [x1, y1] = toXY(a, r + sw / 2 + 3);
        const [x2, y2] = toXY(a, r - sw / 2 - 3);
        return <line key={t} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)} stroke="#080d14" strokeWidth="2.5" />;
      })}
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
      {minorTicks.map((t) => {
        const a = 180 - 1.8 * t;
        const [x1, y1] = toXY(a, r + sw / 2 + 1);
        const [x2, y2] = toXY(a, r - sw / 2 - 2);
        return <line key={t} x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)} stroke="#1e293b" strokeWidth="1" />;
      })}
      {!noData && (
        <polygon points={`${ntx.toFixed(1)},${nty.toFixed(1)} ${nb1x.toFixed(1)},${nb1y.toFixed(1)} ${nb2x.toFixed(1)},${nb2y.toFixed(1)}`} fill="#000" opacity="0.5" transform="translate(1.5,1.5)" />
      )}
      {!noData && (
        <polygon points={`${ntx.toFixed(1)},${nty.toFixed(1)} ${nb1x.toFixed(1)},${nb1y.toFixed(1)} ${nb2x.toFixed(1)},${nb2y.toFixed(1)}`} fill="#e2e8f0" />
      )}
      <circle cx={cx} cy={cy} r="12" fill="#0f172a" stroke="#1e293b" strokeWidth="2.5" />
      <circle cx={cx} cy={cy} r="7"  fill="#1e293b" stroke="#334155" strokeWidth="1" />
      <circle cx={cx} cy={cy} r="3"  fill="#475569" />
      {noData ? (
        <text x={cx} y={cy + 22} textAnchor="middle" fill="#1e293b" fontFamily="monospace" fontSize="16" fontWeight="bold">—</text>
      ) : (
        <>
          <text x={cx} y={cy + 21} textAnchor="middle" fill={valColor} fontFamily="monospace" fontSize="21" fontWeight="bold" letterSpacing="-0.5">{value}%</text>
          <text x={cx} y={cy + 33} textAnchor="middle" fill="#1e3a5f" fontFamily="monospace" fontSize="7" letterSpacing="1.5">BREAKOUT PROB</text>
        </>
      )}
    </svg>
  );
}

// ── Derived values from majors ────────────────────────────────────────────────

function hasOiData(m: GexbotMajors): boolean {
  return m.net_gex_oi !== 0 || m.mpos_oi !== 0;
}

function derive(m: GexbotMajors | null, weightMode: 'oi' | 'vol') {
  if (!m) return { netGex: 0, callWall: 0, putWall: 0, regime: 'positive' as const, breakoutProb: 50, distToFlip: 0, aboveFlip: true, effectiveMode: 'vol' as const };
  const useOi = weightMode === 'oi' && hasOiData(m);
  const netGex   = useOi ? m.net_gex_oi : m.net_gex_vol;
  const callWall = useOi ? m.mpos_oi    : m.mpos_vol;
  const putWall  = useOi ? m.mneg_oi    : m.mneg_vol;
  const regime   = netGex < 0 ? 'negative' as const : 'positive' as const;
  const base     = netGex < 0 ? 0.68 : 0.28;
  const flip     = m.zero_gamma > 0 ? m.zero_gamma : m.spot; // state has zero_gamma=0
  const distPct  = m.spot > 0 ? Math.abs(m.spot - flip) / m.spot : 0;
  const breakoutProb = Math.round(Math.min(0.92, Math.max(0.08, base + (distPct < 0.005 ? 0.10 : 0))) * 100);
  return { netGex, callWall, putWall, regime, breakoutProb, distToFlip: m.spot - flip, aboveFlip: m.spot >= flip, effectiveMode: useOi ? 'oi' as const : 'vol' as const };
}

// ── Index card ────────────────────────────────────────────────────────────────

function IndexCard({ index, model, weightMode }: {
  index: GexbotIndex;
  model: 'classic' | 'state';
  weightMode: 'oi' | 'vol';
}) {
  const modelData: GexbotModelData = index[model];
  // show full when available, fall back to zero
  const majors = modelData.full ?? modelData.zero;
  const d = derive(majors, weightMode);
  const spot = majors?.spot;
  const hasFlip = majors ? majors.zero_gamma > 0 : false;
  const zeroGamma = hasFlip ? majors!.zero_gamma : null;
  // only flag conflict when OI data is actually present (state model has net_gex_oi=0)
  const conflict = majors && hasOiData(majors)
    ? (majors.net_gex_oi < 0) !== (majors.net_gex_vol < 0)
    : false;

  return (
    <div className="flex-1 min-w-0 bg-[#080d14] border border-slate-800/50 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-slate-800/40">
        <div>
          <span className="text-[14px] font-bold text-amber-300 font-mono tracking-widest">{index.ticker}</span>
          <span className="text-[9px] text-slate-600 ml-2 font-mono">{index.label}</span>
        </div>
        {spot && <span className="text-[11px] text-slate-500 font-mono">{fmtPrice(spot)}</span>}
      </div>

      <div className="px-2 pt-2 pb-0">
        <SpeedometerGauge value={d.breakoutProb} noData={!majors} />
      </div>

      <div className={`text-center text-[9px] font-bold uppercase tracking-widest font-mono pb-3 ${majors ? (d.regime === 'negative' ? 'text-red-400' : 'text-emerald-400') : 'text-slate-700'}`}>
        {majors ? (d.regime === 'negative' ? '⚡ NEG GEX · TRENDING' : '◈ POS GEX · PINNING') : '· · ·'}
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
            {zeroGamma !== null ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-slate-300 font-mono">{fmtPrice(zeroGamma)}</span>
                <span className={`text-[10px] font-bold font-mono ${d.aboveFlip ? 'text-emerald-500' : 'text-red-500'}`}>
                  {d.aboveFlip ? '▲' : '▼'}{Math.abs(Math.round(d.distToFlip))}
                </span>
              </div>
            ) : (
              <span className="text-[10px] text-slate-600 font-mono">N/A · state model</span>
            )}
          </div>
          <div className="border-t border-slate-800/30" />
          <div className="flex justify-between items-center">
            <span className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">Call Wall</span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-red-400 font-mono">{fmtPrice(d.callWall)}</span>
              <span className={`text-[9px] font-mono ${d.callWall > spot! ? 'text-red-600' : 'text-emerald-600'}`}>
                {d.callWall > spot! ? '▲' : '▼'}
              </span>
            </div>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">Put Wall</span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-emerald-400 font-mono">{fmtPrice(d.putWall)}</span>
              <span className={`text-[9px] font-mono ${d.putWall > spot! ? 'text-red-600' : 'text-emerald-600'}`}>
                {d.putWall > spot! ? '▲' : '▼'}
              </span>
            </div>
          </div>
          <div className="border-t border-slate-800/30" />
          <div className="flex justify-between items-center">
            <span className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">
              Net GEX <span className="text-amber-700">({d.effectiveMode.toUpperCase()}{d.effectiveMode !== weightMode ? ' ↩' : ''})</span>
            </span>
            <span className={`text-[11px] font-mono ${d.netGex < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {d.netGex >= 0 ? '+' : ''}{fmtGex(d.netGex)}
            </span>
          </div>
          {/* Show full vs zero delta */}
          {modelData.full && modelData.zero && (
            <div className="flex justify-between items-center opacity-40 text-[9px] font-mono text-slate-500 uppercase">
              <span>ZeroGamma ({modelData.zero.zero_gamma === modelData.full.zero_gamma ? 'same' : 'zero'})</span>
              <span>{fmtPrice(modelData.zero.zero_gamma)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Classic vs State comparison row ──────────────────────────────────────────

function ComparisonRow({ index, weightMode }: { index: GexbotIndex; weightMode: 'oi' | 'vol' }) {
  const cf = derive(index.classic.full, weightMode);
  const sf = derive(index.state.full, weightMode);
  const mCF = index.classic.full;
  const mSF = index.state.full;

  if (!mCF && !mSF) return null;

  const agree = mCF && mSF ? cf.regime === sf.regime : true;

  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded border text-[10px] font-mono ${agree ? 'border-slate-800/30 bg-transparent' : 'border-amber-500/20 bg-amber-500/5'}`}>
      <span className="text-slate-500 w-16 shrink-0">{index.ticker}</span>
      {mCF && (
        <span className={`${cf.regime === 'negative' ? 'text-red-400' : 'text-emerald-400'}`}>
          Classic: {cf.regime === 'negative' ? 'NEG' : 'POS'} {cf.breakoutProb}%
        </span>
      )}
      {mSF && (
        <span className={`${sf.regime === 'negative' ? 'text-red-400' : 'text-emerald-400'}`}>
          State: {sf.regime === 'negative' ? 'NEG' : 'POS'} {sf.breakoutProb}%
        </span>
      )}
      {mCF && mSF && !agree && (
        <span className="text-amber-500 ml-auto">⚡ DIVERGE</span>
      )}
      {mCF && mSF && agree && (
        <span className="text-slate-700 ml-auto">✓ agree</span>
      )}
    </div>
  );
}

// ── Aggregate panel ───────────────────────────────────────────────────────────

function AggregatePanel({ stocks, aggregate, weightMode, ndxRegime }: {
  stocks: GexbotStock[];
  aggregate: GexbotAggregateScore;
  weightMode: 'oi' | 'vol';
  ndxRegime: 'positive' | 'negative' | null;
}) {
  const score = aggregate.weightedScore;
  const pct   = ((score + 1) / 2) * 100;
  const isNeg = score < 0;
  const stocksRegime = score < -0.1 ? 'negative' : score > 0.1 ? 'positive' : null;
  const aligned = ndxRegime !== null && stocksRegime !== null && ndxRegime === stocksRegime;
  const mixed   = stocksRegime === null;

  return (
    <div className="border border-slate-800/40 rounded-lg p-4 bg-[#080d14] space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400 font-mono">NDX Constituent GEX</span>
        <span className="text-[9px] text-slate-600 font-mono">{aggregate.dataCount}/10 · {aggregate.negCount}↓ {aggregate.posCount}↑</span>
      </div>
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-[9px] text-slate-600 uppercase tracking-widest font-mono">Weighted Score</span>
          <span className={`text-[14px] font-bold font-mono ${isNeg ? 'text-red-400' : 'text-emerald-400'}`}>
            {score >= 0 ? '+' : ''}{score.toFixed(2)}
          </span>
        </div>
        <div className="relative h-2 bg-slate-900 rounded-full overflow-hidden">
          <div className="absolute left-1/2 top-0 w-px h-full bg-slate-600 z-10" />
          <div className={`absolute top-0 h-full ${isNeg ? 'bg-red-600' : 'bg-emerald-600'} transition-all duration-500`}
            style={isNeg ? { right: '50%', width: `${(1 - pct / 100) * 50}%` } : { left: '50%', width: `${(pct / 100 - 0.5) * 100}%` }} />
        </div>
        <div className="flex justify-between text-[8px] text-slate-700 font-mono mt-0.5">
          <span>−1 ALL NEG</span><span>0</span><span>ALL POS +1</span>
        </div>
      </div>
      <div className={`text-[9px] font-mono uppercase tracking-widest px-2 py-1 rounded border ${
        mixed ? 'text-slate-600 border-slate-800 bg-slate-900/30'
              : aligned ? 'text-amber-400 border-amber-500/30 bg-amber-500/8'
              : 'text-slate-500 border-slate-700/30 bg-slate-900/30'
      }`}>
        {mixed ? '· Mixed — no clear regime'
               : aligned ? `⚡ ALIGNED — Stocks ${isNeg ? 'NEG' : 'POS'} GEX matches NDX`
               : '◇ DIVERGED — Stocks vs NDX disagree'}
      </div>
      <div className="space-y-1">
        <span className="text-[8px] text-slate-700 uppercase tracking-widest font-mono">Breakout prob by constituent ({weightMode.toUpperCase()})</span>
        {stocks.map((s) => {
          const m = s.classic.full;
          const d = derive(m, weightMode);
          const barW = m ? s.ndxWeight * (Math.abs(d.breakoutProb - 50) / 50) : 0;
          return (
            <div key={s.ticker} className="flex items-center gap-2">
              <span className="text-[9px] text-slate-500 font-mono w-10 shrink-0">{s.ticker}</span>
              <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                {m ? <div className={`h-full rounded-full ${d.regime === 'negative' ? 'bg-red-600' : 'bg-emerald-700'}`} style={{ width: `${Math.min(100, (barW / 12) * 100)}%` }} />
                   : <div className="h-full w-full bg-slate-800/30" />}
              </div>
              <span className={`text-[9px] font-mono w-8 text-right ${m ? (d.regime === 'negative' ? 'text-red-500' : 'text-emerald-600') : 'text-slate-700'}`}>
                {m ? `${d.breakoutProb}%` : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Stocks table ──────────────────────────────────────────────────────────────

function StocksTable({ stocks, weightMode }: { stocks: GexbotStock[]; weightMode: 'oi' | 'vol' }) {
  return (
    <div className="border border-slate-800/40 rounded-lg overflow-hidden bg-[#080d14]">
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-3 px-3 py-2 border-b border-slate-800/40 bg-slate-900/30">
        {['Stock', 'Wt%', 'Spot', 'Regime', 'Prob', 'Flip', 'Net GEX'].map((h) => (
          <span key={h} className="text-[8px] text-slate-600 uppercase tracking-widest font-mono">{h}</span>
        ))}
      </div>
      {stocks.map((s, idx) => {
        const m = s.classic.full;
        const d = derive(m, weightMode);
        const probColor = !m ? 'text-slate-700'
          : d.breakoutProb >= 65 ? 'text-red-400'
          : d.breakoutProb >= 45 ? 'text-amber-400'
          : 'text-emerald-400';
        return (
          <div key={s.ticker} className={`grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-x-3 px-3 py-2 items-center border-b border-slate-900/60 hover:bg-slate-800/10 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-900/10'}`}>
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${m ? (d.regime === 'negative' ? 'bg-red-500' : 'bg-emerald-500') : 'bg-slate-700'}`} />
              <span className="text-[11px] font-bold text-slate-200 font-mono">{s.ticker}</span>
              <span className="text-[9px] text-slate-600 hidden sm:inline">{s.name}</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono text-right">{s.ndxWeight}%</span>
            <span className="text-[10px] text-slate-400 font-mono text-right">{m ? fmtPrice(m.spot) : '—'}</span>
            <span className={`text-[9px] font-bold font-mono uppercase text-right ${m ? (d.regime === 'negative' ? 'text-red-500' : 'text-emerald-600') : 'text-slate-700'}`}>
              {m ? (d.regime === 'negative' ? 'NEG' : 'POS') : '—'}
            </span>
            <span className={`text-[11px] font-bold font-mono text-right ${probColor}`}>{m ? `${d.breakoutProb}%` : '—'}</span>
            <div className="text-right">
              {m ? (
                <>
                  <span className="text-[10px] text-slate-400 font-mono">{fmtPrice(m.zero_gamma)}</span>
                  <span className={`text-[9px] font-mono ml-1 ${d.aboveFlip ? 'text-emerald-600' : 'text-red-600'}`}>
                    {d.aboveFlip ? '▲' : '▼'}{Math.abs(Math.round(d.distToFlip))}
                  </span>
                </>
              ) : <span className="text-slate-700 text-[10px]">—</span>}
            </div>
            <span className={`text-[10px] font-mono text-right ${m ? (d.netGex < 0 ? 'text-red-400' : 'text-emerald-400') : 'text-slate-700'}`}>
              {m ? `${d.netGex >= 0 ? '+' : ''}${fmtGex(d.netGex)}` : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Index grid (4 cards) ──────────────────────────────────────────────────────

function IndexGrid({ indices, model, weightMode }: {
  indices: GexbotIndex[];
  model: 'classic' | 'state';
  weightMode: 'oi' | 'vol';
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {indices.map((idx) => (
        <IndexCard key={idx.ticker} index={idx} model={model} weightMode={weightMode} />
      ))}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

type Model = 'classic' | 'state';
type WeightMode = 'oi' | 'vol';

export default function GEXBotSection() {
  const [data, setData]           = useState<GexbotResponse | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [model, setModel]         = useState<Model>('classic');
  const [weightMode, setWeightMode] = useState<WeightMode>('oi');
  const [showCompare, setShowCompare] = useState(false);

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

  const ndxIndex  = data?.indices.find((i) => i.ticker === 'NDX') ?? null;
  const ndxMajors = ndxIndex ? (ndxIndex.classic.full ?? ndxIndex.classic.zero) : null;
  const ndxRegime = ndxMajors ? (ndxMajors.net_gex_oi < 0 ? 'negative' as const : 'positive' as const) : null;

  return (
    <div className="space-y-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-amber-400" />
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-amber-400">GEX Intelligence</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Model toggle */}
          <div className="flex gap-1 border border-slate-800 rounded overflow-hidden">
            {(['classic', 'state'] as const).map((m) => (
              <button key={m} onClick={() => setModel(m)}
                className={`text-[9px] px-3 py-1 font-mono uppercase tracking-widest transition-colors ${
                  model === m ? 'bg-amber-500/20 text-amber-400' : 'text-slate-600 hover:text-slate-400'
                }`}>
                {m}
              </button>
            ))}
          </div>
          {/* Weight mode toggle */}
          <div className="flex gap-1 border border-slate-800 rounded overflow-hidden">
            {(['oi', 'vol'] as const).map((w) => (
              <button key={w} onClick={() => setWeightMode(w)}
                className={`text-[9px] px-2.5 py-1 font-mono uppercase tracking-widest transition-colors ${
                  weightMode === w ? 'bg-slate-700 text-slate-200' : 'text-slate-600 hover:text-slate-400'
                }`}>
                {w.toUpperCase()}
              </button>
            ))}
          </div>
          {/* Compare toggle */}
          <button onClick={() => setShowCompare((v) => !v)}
            className={`text-[9px] px-2.5 py-1 font-mono uppercase tracking-widest border rounded transition-colors ${
              showCompare ? 'border-amber-500/40 text-amber-500 bg-amber-500/10' : 'border-slate-800 text-slate-600 hover:text-slate-400'
            }`}>
            Compare
          </button>
          {data && <span className="text-[9px] text-slate-600 font-mono">{timeAgo(data.fetchedAt)}</span>}
          <button onClick={() => load()} className="text-slate-600 hover:text-amber-400 transition-colors">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Model badge */}
      <div className="flex items-center gap-2">
        <div className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded border ${
          model === 'classic'
            ? 'text-blue-400 border-blue-500/30 bg-blue-500/8'
            : 'text-violet-400 border-violet-500/30 bg-violet-500/8'
        }`}>
          {model === 'classic' ? '◈ Classic Model — Aggregated GEX from options chain' : '◇ State Model — Tradeable state-based GEX'}
        </div>
        <div className="text-[9px] font-mono text-slate-700 uppercase tracking-widest">
          {weightMode === 'oi' ? 'OI-weighted' : 'Volume-weighted'}
          {model === 'state' && weightMode === 'oi' && (
            <span className="text-amber-700 ml-1">(state has no OI → vol used)</span>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {loading && (
        <div className="text-[10px] text-slate-600 uppercase tracking-widest text-center py-16 font-mono">
          Loading GEX — fetching 36 data points…
        </div>
      )}

      {!loading && data && (
        <>
          {/* Index cards */}
          <IndexGrid indices={data.indices} model={model} weightMode={weightMode} />

          {/* Classic vs State compare */}
          {showCompare && (
            <div className="border border-slate-800/40 rounded-lg p-3 bg-[#080d14] space-y-2">
              <div className="text-[9px] text-slate-600 uppercase tracking-widest font-mono mb-2">Classic vs State divergence</div>
              {data.indices.map((idx) => (
                <ComparisonRow key={idx.ticker} index={idx} weightMode={weightMode} />
              ))}
            </div>
          )}

          {/* Bottom row */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <AggregatePanel
              stocks={data.stocks}
              aggregate={data.aggregate}
              weightMode={weightMode}
              ndxRegime={ndxRegime}
            />
            <StocksTable stocks={data.stocks} weightMode={weightMode} />
          </div>

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
