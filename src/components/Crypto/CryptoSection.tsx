'use client';

import { useEffect, useState } from 'react';
import type { BtcMetrics, CyclePhase } from '@/app/api/btc-metrics/route';
import type { WhaleData } from '@/app/api/btc-whales/route';

// ── CheckOnChain chart URLs ───────────────────────────────────────────────────

const CHARTS: { id: string; title: string; signal: string; url: string }[] = [
  {
    id:     'valuation',
    title:  'CYCLE EXTREME OSCILLATORS',
    signal: 'MVRV · SOPR · Puell · Reserve Risk — blue = accumulate · red = euphoria',
    url:    'https://charts.checkonchain.com/btconchain/confluence/confluence_cycleextremeoscillators_1/confluence_cycleextremeoscillators_1_dark.html',
  },
  {
    id:     'euphoria',
    title:  'EUPHORIA ZONE (MVRV BANDS)',
    signal: 'Price entering +2SD red band = scale entire position out',
    url:    'https://charts.checkonchain.com/btconchain/pricing/pricing_euphoriazone/pricing_euphoriazone_dark.html',
  },
  {
    id:     'supply',
    title:  'SUPPLY DISTRIBUTION (LTH vs STH)',
    signal: '5yr+ accumulating = bullish · 6m–1yr rising = weak hands top',
    url:    'https://charts.checkonchain.com/btconchain/supply/older6m_0/older6m_0_dark.html',
  },
  {
    id:     'liquidation',
    title:  'FUTURES OI 1-DAY CHANGE',
    signal: 'Large OI flush in discount zone = precision long entry trigger',
    url:    'https://charts.checkonchain.com/btconchain/derivatives/derivatives_futuresoi_1daychange/derivatives_futuresoi_1daychange_dark.html',
  },
  {
    id:     'originals',
    title:  'ONCHAIN ORIGINALS PRICING',
    signal: 'Realized price · Thermo cap · Delta cap convergence = strong S/R',
    url:    'https://charts.checkonchain.com/btconchain/pricing/pricing_onchainoriginals/pricing_onchainoriginals_dark.html',
  },
];

// ── Phase config ──────────────────────────────────────────────────────────────

const PHASE: Record<CyclePhase, {
  label: string; range: string; tagline: string;
  color: string; bg: string; border: string; bar: string; ring: string; desc: string;
}> = {
  capitulation_recovery: {
    label: 'CAPITULATION RECOVERY', range: '80–100', tagline: 'BEST BUY ZONES EVER',
    color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40',
    bar: 'bg-emerald-400', ring: 'ring-emerald-500/30',
    desc: 'Mass capitulation underway. Long-term holders accumulating aggressively. All 4 oscillators in extreme discount. Leverage entries on OI flush events. Highest historical return periods.',
  },
  deep_value: {
    label: 'DEEP VALUE', range: '60–80', tagline: 'HISTORICALLY GOOD ENTRY',
    color: 'text-lime-300', bg: 'bg-lime-500/10', border: 'border-lime-500/40',
    bar: 'bg-lime-400', ring: 'ring-lime-500/30',
    desc: 'Bitcoin trading below fair value. Smart money accumulating. MVRV below long-run average. Dollar-cost average aggressively. Scale in on dips and liquidation flushes.',
  },
  early_value: {
    label: 'EARLY VALUE', range: '40–60', tagline: 'GETTING INTERESTING',
    color: 'text-amber-300', bg: 'bg-amber-500/10', border: 'border-amber-500/40',
    bar: 'bg-amber-400', ring: 'ring-amber-500/30',
    desc: 'Approaching fair value. Conditions improving. Begin building small positions. Watch for Condition Sum crossing below -0.30 for higher conviction entries.',
  },
  neutral: {
    label: 'NEUTRAL', range: '25–40', tagline: 'WAIT & SEE',
    color: 'text-orange-300', bg: 'bg-orange-500/10', border: 'border-orange-500/40',
    bar: 'bg-orange-400', ring: 'ring-orange-500/30',
    desc: 'Fair value range. Hold existing positions but no new entries. Monitor LTH supply trend. Wait for oscillators to show clear direction before adding risk.',
  },
  distribution: {
    label: 'DISTRIBUTION', range: '0–25', tagline: 'RISKY TO BUY',
    color: 'text-red-300', bg: 'bg-red-500/10', border: 'border-red-500/40',
    bar: 'bg-red-400', ring: 'ring-red-500/30',
    desc: 'Above fair value. Retail euphoria. Wealth transfer from weak to strong hands underway. Scale out aggressively. Reduce leverage.',
  },
};

const REGIMES = [
  { label: 'DISTRIBUTION',          range: '0–25',   color: 'text-red-400',    bg: 'bg-red-900/30',    border: 'border-red-800/40' },
  { label: 'NEUTRAL',               range: '25–40',  color: 'text-orange-400', bg: 'bg-orange-900/20', border: 'border-orange-800/30' },
  { label: 'EARLY VALUE',           range: '40–60',  color: 'text-amber-400',  bg: 'bg-amber-900/20',  border: 'border-amber-800/30' },
  { label: 'DEEP VALUE',            range: '60–80',  color: 'text-lime-400',   bg: 'bg-lime-900/30',   border: 'border-lime-800/40' },
  { label: 'CAPITULATION RECOVERY', range: '80–100', color: 'text-emerald-400',bg: 'bg-emerald-900/30',border: 'border-emerald-800/40' },
];

// ── SVG Sparkline ─────────────────────────────────────────────────────────────

function Sparkline({ history, phase }: { history: { t: number; v: number }[]; phase: CyclePhase }) {
  if (history.length < 2) return null;
  const W = 260, H = 56;
  const vals = history.map((x) => x.v);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const range = hi - lo || 1;
  const pts = vals.map((v, i) => {
    const x = (i / (vals.length - 1)) * W;
    const y = H - ((v - lo) / range) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const colors: Record<CyclePhase, string> = {
    capitulation_recovery: '#34d399', deep_value: '#a3e635',
    early_value: '#fbbf24', neutral: '#fb923c', distribution: '#f87171',
  };
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="opacity-80">
      <polyline points={pts} fill="none" stroke={colors[phase]} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

// ── SVG Gauge ─────────────────────────────────────────────────────────────────

function ScoreGauge({ score, phase }: { score: number; phase: CyclePhase }) {
  const R = 52, cx = 64, cy = 64;
  const startAngle = 215, sweep = 290;
  const angle = startAngle + (score / 100) * sweep;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arc = (a1: number, a2: number) => {
    const s = toRad(a1), e = toRad(a2);
    const x1 = cx + R * Math.cos(s), y1 = cy + R * Math.sin(s);
    const x2 = cx + R * Math.cos(e), y2 = cy + R * Math.sin(e);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };
  const colors: Record<CyclePhase, string> = {
    capitulation_recovery: '#34d399', deep_value: '#a3e635',
    early_value: '#fbbf24', neutral: '#fb923c', distribution: '#f87171',
  };
  const c = colors[phase];
  return (
    <svg width={128} height={128} viewBox="0 0 128 128">
      <path d={arc(startAngle, startAngle + sweep)} fill="none" stroke="#18181b" strokeWidth="9" strokeLinecap="round" />
      {score > 0 && <path d={arc(startAngle, angle)} fill="none" stroke={c} strokeWidth="9" strokeLinecap="round" />}
      <text x={cx} y={cy + 8} textAnchor="middle" fill={c} fontSize="28" fontWeight="bold" fontFamily="monospace">{score}</text>
      <text x={cx} y={cy + 24} textAnchor="middle" fill="#52525b" fontSize="10" fontFamily="monospace" letterSpacing="1">/100</text>
    </svg>
  );
}

// ── Metric card ───────────────────────────────────────────────────────────────

function MetricCard({ label, value, status, note, detail }: {
  label: string; value: string; status: 'bullish' | 'bearish' | 'neutral'; note: string; detail: string;
}) {
  const dot  = status === 'bullish' ? 'bg-emerald-400' : status === 'bearish' ? 'bg-red-400' : 'bg-amber-400';
  const text = status === 'bullish' ? 'text-emerald-300' : status === 'bearish' ? 'text-red-300' : 'text-amber-300';
  return (
    <div className="bg-[#0a0a10] border border-zinc-800/60 rounded-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{label}</p>
        <p className="text-lg font-bold text-white font-mono">{value}</p>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <p className={`text-xs font-bold uppercase tracking-wide ${text}`}>{note}</p>
      </div>
      <p className="text-xs text-zinc-600 leading-snug">{detail}</p>
    </div>
  );
}

// ── Whale SVG chart ───────────────────────────────────────────────────────────

function WhaleChart({ whales }: { whales: WhaleData }) {
  const W = 600, H = 220, PL = 90, PR = 20, PT = 30, PB = 50;
  const chartW = W - PL - PR;
  const chartH = H - PT - PB;
  const n = whales.cohorts.length;
  const groupW = chartW / n;
  const barW = groupW * 0.35;
  const gap  = groupW * 0.08;

  // Two metrics: addresses (log scale) and BTC held (linear)
  const addrs = whales.cohorts.map((c) => c.addresses);
  const btcs   = whales.cohorts.map((c) => c.btc);

  // Log scale for addresses (range is enormous: 18K → 4)
  const logMax = Math.log10(Math.max(...addrs) + 1);
  const btcMax  = Math.max(...btcs);

  const xOf = (i: number) => PL + i * groupW + groupW / 2;

  const addrBarH  = (v: number) => (Math.log10(v + 1) / logMax) * chartH;
  const btcBarH   = (v: number) => (v / btcMax) * chartH;

  // Y axis ticks (BTC, right)
  const btcTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ y: PT + chartH - f * chartH, val: (f * btcMax / 1_000_000).toFixed(1) + 'M' }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }}>
      {/* Grid lines */}
      {btcTicks.map((t) => (
        <line key={t.val} x1={PL} x2={W - PR} y1={t.y} y2={t.y} stroke="#27272a" strokeWidth="1" />
      ))}

      {/* BTC held bars (teal, left group) */}
      {whales.cohorts.map((c, i) => {
        const bh = btcBarH(c.btc);
        const x  = xOf(i) - gap / 2 - barW;
        return (
          <g key={`btc-${i}`}>
            <rect x={x} y={PT + chartH - bh} width={barW} height={bh} fill="#0d9488" rx="2" opacity="0.85" />
          </g>
        );
      })}

      {/* Address count bars (amber, right group, log scale) */}
      {whales.cohorts.map((c, i) => {
        const bh = addrBarH(c.addresses);
        const x  = xOf(i) + gap / 2;
        return (
          <g key={`addr-${i}`}>
            <rect x={x} y={PT + chartH - bh} width={barW} height={bh} fill="#f59e0b" rx="2" opacity="0.85" />
          </g>
        );
      })}

      {/* Value labels on top of bars */}
      {whales.cohorts.map((c, i) => {
        const bh = btcBarH(c.btc);
        const bx  = xOf(i) - gap / 2 - barW + barW / 2;
        const ah = addrBarH(c.addresses);
        const ax  = xOf(i) + gap / 2 + barW / 2;
        return (
          <g key={`lbl-${i}`}>
            <text x={bx} y={PT + chartH - bh - 4} textAnchor="middle" fill="#5eead4" fontSize="9" fontFamily="monospace">
              {(c.btc / 1_000_000).toFixed(2)}M
            </text>
            <text x={ax} y={PT + chartH - ah - 4} textAnchor="middle" fill="#fde68a" fontSize="9" fontFamily="monospace">
              {c.addresses.toLocaleString()}
            </text>
          </g>
        );
      })}

      {/* X axis labels */}
      {whales.cohorts.map((c, i) => (
        <g key={`xl-${i}`}>
          <text x={xOf(i)} y={PT + chartH + 16} textAnchor="middle" fill="#71717a" fontSize="10" fontFamily="monospace">
            {c.range}
          </text>
          <text x={xOf(i)} y={PT + chartH + 30} textAnchor="middle" fill="#52525b" fontSize="9" fontFamily="monospace">
            BTC
          </text>
        </g>
      ))}

      {/* Y axis labels (BTC) */}
      {btcTicks.filter((_, i) => i > 0).map((t) => (
        <text key={t.val} x={PL - 6} y={t.y + 4} textAnchor="end" fill="#52525b" fontSize="9" fontFamily="monospace">{t.val}</text>
      ))}

      {/* Legend */}
      <rect x={PL} y={8} width={10} height={10} fill="#0d9488" rx="1" />
      <text x={PL + 14} y={17} fill="#5eead4" fontSize="10" fontFamily="monospace">BTC held</text>
      <rect x={PL + 90} y={8} width={10} height={10} fill="#f59e0b" rx="1" />
      <text x={PL + 104} y={17} fill="#fde68a" fontSize="10" fontFamily="monospace">Addresses (log scale)</text>

      {/* % supply text */}
      {whales.cohorts.map((c, i) => (
        <text key={`pct-${i}`} x={xOf(i)} y={PT + chartH + 44} textAnchor="middle" fill="#a16207" fontSize="9" fontFamily="monospace">
          {c.pctSupply.toFixed(1)}% supply
        </text>
      ))}

      {/* Axes */}
      <line x1={PL} x2={PL} y1={PT} y2={PT + chartH} stroke="#3f3f46" strokeWidth="1" />
      <line x1={PL} x2={W - PR} y1={PT + chartH} y2={PT + chartH} stroke="#3f3f46" strokeWidth="1" />
    </svg>
  );
}

// ── Chart iframe ──────────────────────────────────────────────────────────────

function ChartFrame({ chart }: { chart: typeof CHARTS[0] }) {
  const [loaded, setLoaded] = useState(false);
  const [error,  setError]  = useState(false);
  return (
    <div className="flex flex-col bg-[#08080d] border border-zinc-800/60 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-zinc-800/50">
        <div>
          <p className="text-xs font-bold text-amber-500 uppercase tracking-widest">{chart.title}</p>
          <p className="text-xs text-zinc-600 mt-0.5">{chart.signal}</p>
        </div>
        <a href={chart.url} target="_blank" rel="noopener noreferrer"
          className="text-sm text-zinc-600 hover:text-amber-400 transition-colors shrink-0">↗</a>
      </div>
      <div className="relative" style={{ height: 480 }}>
        {!loaded && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#08080d]">
            <div className="flex flex-col items-center gap-2">
              <div className="w-5 h-5 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
              <span className="text-xs text-zinc-600 uppercase tracking-widest">Loading…</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#08080d]">
            <div className="text-center">
              <p className="text-sm text-zinc-600">Chart unavailable</p>
              <a href={chart.url} target="_blank" rel="noopener noreferrer"
                className="text-sm text-amber-600 hover:text-amber-400 mt-1 block">Open in new tab ↗</a>
            </div>
          </div>
        )}
        <iframe
          src={chart.url}
          className={`w-full h-full border-0 transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
          sandbox="allow-scripts allow-same-origin allow-popups"
          title={chart.title}
        />
      </div>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export default function CryptoSection() {
  const [data,       setData]       = useState<BtcMetrics | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [err,        setErr]        = useState<string | null>(null);
  const [whales,     setWhales]     = useState<WhaleData | null>(null);
  const [chartsOpen, setChartsOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res  = await fetch('/api/btc-metrics');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: BtcMetrics = await res.json();
        if (!cancelled) { setData(json); setLoading(false); }
      } catch (e) {
        if (!cancelled) { setErr((e as Error).message); setLoading(false); }
      }
    };
    const loadWhales = async () => {
      try {
        const res = await fetch('/api/btc-whales');
        if (!res.ok) return;
        const json: WhaleData = await res.json();
        if (!cancelled) setWhales(json);
      } catch { /* skip */ }
    };
    load();
    loadWhales();
    const id = setInterval(() => { load(); loadWhales(); }, 60 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
        <p className="text-sm text-zinc-600 uppercase tracking-widest">Fetching on-chain data…</p>
      </div>
    </div>
  );

  if (err || !data) return (
    <div className="flex items-center justify-center h-64">
      <p className="text-sm text-red-500 font-mono">{err ?? 'Unknown error'}</p>
    </div>
  );

  const p       = PHASE[data.cyclePhase];
  const chgPos  = data.priceChg24 >= 0;
  const phaseIdx = data.cycleScore >= 80 ? 4 : data.cycleScore >= 60 ? 3 : data.cycleScore >= 40 ? 2 : data.cycleScore >= 25 ? 1 : 0;

  const mvrvStatus = (data.mvrvRatio ?? 2) < 1.2 ? 'bullish' : (data.mvrvRatio ?? 2) > 2.0 ? 'bearish' : 'neutral';
  const mvrvNote   = (data.mvrvRatio ?? 2) < 1.0 ? 'Extreme discount — LTH underwater'
                   : (data.mvrvRatio ?? 2) < 1.5 ? 'Below fair value — accumulate'
                   : (data.mvrvRatio ?? 2) < (data.mvrvPlus1SD ?? 2.5) ? 'Approaching fair value'
                   : 'Heated — approaching euphoria';

  const condStatus = (data.conditionSum ?? 0) < -0.20 ? 'bullish' : (data.conditionSum ?? 0) > 0.50 ? 'bearish' : 'neutral';
  const condNote   = (data.conditionSum ?? 0) < -0.70 ? 'Deep accumulation — all oscillators bullish'
                   : (data.conditionSum ?? 0) < -0.20 ? 'Discount zone — oscillators bullish'
                   : (data.conditionSum ?? 0) < 0.50  ? 'Neutral — mixed signal'
                   : 'Distribution — oscillators bearish';

  const puellStatus = (data.puellOscillator ?? 0) < -0.20 ? 'bullish' : (data.puellOscillator ?? 0) > 0.30 ? 'bearish' : 'neutral';
  const puellNote   = (data.puellOscillator ?? 0) < -0.40 ? 'Mining revenue low — historical buy zone'
                    : (data.puellOscillator ?? 0) < 0.0   ? 'Below-average miner revenue'
                    : 'Normal miner revenue';

  const fgStatus = data.fearGreed <= 25 ? 'bullish' : data.fearGreed >= 75 ? 'bearish' : 'neutral';
  const fgNote   = data.fearGreed <= 25 ? 'Extreme Fear — contrarian buy signal'
                 : data.fearGreed >= 75 ? 'Extreme Greed — contrarian sell signal'
                 : 'Neutral sentiment';

  return (
    <div className="space-y-4">

      {/* ── CYCLE REGIME ───────────────────────────────────────────────────────── */}
      <div className={`rounded-lg border ${p.border} ${p.bg} p-5 ring-1 ${p.ring}`}>
        <div className="flex flex-col md:flex-row md:items-start gap-5 mb-4">

          {/* Gauge */}
          <div className="shrink-0 flex flex-col items-center">
            <ScoreGauge score={data.cycleScore} phase={data.cyclePhase} />
            <p className="text-xs text-zinc-600 uppercase tracking-widest mt-1">COMPOSITE</p>
          </div>

          {/* Signal */}
          <div className="flex-1">
            <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">CURRENT CYCLE REGIME</p>
            <h2 className={`text-3xl font-bold ${p.color} uppercase tracking-wider leading-none mb-2`}>{p.label}</h2>
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-xs font-bold border ${p.border} px-2 py-1 uppercase tracking-widest ${p.color}`}>
                {p.tagline}
              </span>
              <span className="text-xs text-zinc-500 font-mono">Score: {p.range}</span>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-lg">{p.desc}</p>
          </div>

          {/* Price */}
          <div className="shrink-0 flex flex-col gap-2">
            <div className="bg-black/40 rounded-lg p-4 min-w-[130px]">
              <p className="text-xs text-zinc-500 uppercase tracking-widest">BTC / USD</p>
              <p className="text-xl font-bold text-white font-mono mt-1">
                ${data.price > 0 ? data.price.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
              </p>
              <p className={`text-sm font-mono mt-0.5 ${chgPos ? 'text-emerald-400' : 'text-red-400'}`}>
                {chgPos ? '+' : ''}{data.priceChg24.toFixed(2)}%
              </p>
            </div>
            <div className="bg-black/40 rounded-lg p-2">
              <p className="text-xs text-zinc-600 uppercase tracking-widest mb-1">365D</p>
              <Sparkline history={data.priceHistory} phase={data.cyclePhase} />
            </div>
          </div>
        </div>

        {/* Regime tabs */}
        <div className="grid grid-cols-5 gap-1 mb-2">
          {REGIMES.map((r, i) => (
            <div key={r.label} className={`rounded px-2 py-1.5 border ${r.border} ${r.bg} ${i === phaseIdx ? 'ring-1 ring-white/20' : 'opacity-50'}`}>
              <p className={`text-xs font-bold ${r.color} uppercase leading-tight`}>{r.label}</p>
              <p className="text-xs text-zinc-600 mt-0.5">{r.range}</p>
              {i === phaseIdx && <span className={`text-xs font-bold ${r.color} mt-1 block`}>▲ Now</span>}
            </div>
          ))}
        </div>

        {/* Score bar */}
        <div>
          <div className="flex justify-between text-xs text-zinc-600 font-mono mb-1">
            <span>Sell / Distribution</span>
            <span className="font-bold text-zinc-400">Score {data.cycleScore} / 100</span>
            <span>Buy / Capitulation</span>
          </div>
          <div className="h-2 bg-zinc-900 rounded-full overflow-hidden relative">
            {[25, 40, 60, 80].map((m) => (
              <div key={m} className="absolute top-0 bottom-0 w-px bg-zinc-700" style={{ left: `${m}%` }} />
            ))}
            <div className={`h-full rounded-full transition-all duration-700 ${p.bar}`} style={{ width: `${data.cycleScore}%` }} />
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-600 font-mono">
          <span>SIGNAL: 40% MVRV · 35% Condition Sum · 25% Fear&amp;Greed</span>
          <span>·</span>
          <span>{new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
          {data.source !== 'live' && <span className="text-amber-600">· {data.source.toUpperCase()}</span>}
        </div>
      </div>

      {/* ── METRIC CARDS ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="MVRV RATIO" value={data.mvrvRatio !== null ? data.mvrvRatio.toFixed(4) : '—'}
          status={mvrvStatus} note={mvrvNote}
          detail={`+1SD: ${data.mvrvPlus1SD?.toFixed(2) ?? '—'} · +2SD: ${data.mvrvPlus2SD?.toFixed(2) ?? '—'}. Above +2SD = euphoria.`} />
        <MetricCard label="CONDITION SUM" value={data.conditionSum !== null ? data.conditionSum.toFixed(4) : '—'}
          status={condStatus} note={condNote}
          detail="MVRV + SOPR + Puell + Reserve Risk composite. Buy < -0.70 · Sell > +0.85" />
        <MetricCard label="PUELL MULTIPLE" value={data.puellOscillator !== null ? data.puellOscillator.toFixed(4) : '—'}
          status={puellStatus} note={puellNote}
          detail="Miner revenue normalized. Negative = miners earning below avg = historical buy zone." />
        <MetricCard label="FEAR & GREED" value={String(data.fearGreed)}
          status={fgStatus} note={fgNote}
          detail={`${data.fearGreedLabel}. Extreme Fear (0–25) = contrarian buy · Extreme Greed (75–100) = sell.`} />
      </div>

      {/* ── SECONDARY METRICS ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#0a0a10] border border-zinc-800/60 rounded-lg p-4">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">PRICE vs 200D SMA</p>
          <p className="text-2xl font-bold text-white font-mono">
            {data.priceToSma200 > 0 ? data.priceToSma200.toFixed(2) + 'x' : '—'}
          </p>
          <p className={`text-sm mt-1 ${data.priceToSma200 < 1 ? 'text-emerald-400' : data.priceToSma200 > 2 ? 'text-red-400' : 'text-amber-400'}`}>
            {data.priceToSma200 < 0.85 ? 'Deep discount' : data.priceToSma200 < 1.0 ? 'Below 200DMA' : data.priceToSma200 < 1.5 ? 'Near fair value' : 'Extended'}
          </p>
          <p className="text-xs text-zinc-600 mt-1">200D SMA: ${Math.round(data.sma200).toLocaleString()}</p>
        </div>

        <div className="bg-[#0a0a10] border border-zinc-800/60 rounded-lg p-4">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">MVRV vs EUPHORIA BANDS</p>
          <div className="space-y-2">
            {[
              { label: '+2SD (Euphoria)', val: data.mvrvPlus2SD, c: 'text-red-400' },
              { label: '+1SD (Heated)',   val: data.mvrvPlus1SD, c: 'text-orange-400' },
              { label: 'Current MVRV',   val: data.mvrvRatio,   c: 'text-emerald-400' },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">{row.label}</span>
                <span className={`text-sm font-mono font-bold ${row.c}`}>
                  {row.val !== null ? row.val.toFixed(4) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0a0a10] border border-zinc-800/60 rounded-lg p-4">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">CYCLE THRESHOLDS</p>
          <div className="space-y-2">
            {[
              { label: 'SELL (Cond Sum)', val: '> +0.85', c: 'text-red-400' },
              { label: 'BUY (Cond Sum)',  val: '< -0.70', c: 'text-emerald-400' },
              { label: 'MVRV euphoria',   val: '> +2SD',  c: 'text-red-400' },
              { label: 'MVRV accumulate', val: '< 1.0',   c: 'text-emerald-400' },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center">
                <span className="text-xs text-zinc-500">{row.label}</span>
                <span className={`text-sm font-mono font-bold ${row.c}`}>{row.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── WHALE CHART ────────────────────────────────────────────────────────── */}
      {whales && (
        <div className="bg-[#0a0a10] border border-zinc-800/60 rounded-lg p-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm font-bold text-amber-500 uppercase tracking-widest">WHALE HOLDERS (100+ BTC)</p>
              <p className="text-xs text-zinc-500 mt-0.5">Addresses controlling significant supply · BitInfoCharts</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white font-mono">{whales.totalWhaleAddresses.toLocaleString()}</p>
              <p className="text-xs text-zinc-500">whale addresses</p>
            </div>
          </div>

          <WhaleChart whales={whales} />

          <div className="grid grid-cols-3 gap-4 pt-3 mt-2 border-t border-zinc-800/50">
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest">Whale BTC held</p>
              <p className="text-xl font-bold text-white font-mono mt-1">
                {(whales.totalWhaleBtc / 1_000_000).toFixed(2)}M BTC
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest">% of total supply</p>
              <p className="text-xl font-bold text-amber-400 font-mono mt-1">
                {whales.pctSupplyByWhales.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-xs text-zinc-500 uppercase tracking-widest">100–1K cohort signal</p>
              <p className={`text-base font-bold mt-1 ${whales.cohorts[0]?.addresses > 17000 ? 'text-emerald-400' : 'text-red-400'}`}>
                {whales.cohorts[0]?.addresses > 17000 ? '▲ Accumulating' : '▼ Distributing'}
              </p>
              <p className="text-xs text-zinc-600">{whales.cohorts[0]?.addresses.toLocaleString()} addresses</p>
            </div>
          </div>
        </div>
      )}

      {/* ── CHECKONCHAIN CHARTS (collapsible) ──────────────────────────────────── */}
      <button
        onClick={() => setChartsOpen((o) => !o)}
        className="w-full flex items-center gap-3 py-2 group"
      >
        <div className="flex-1 h-px bg-zinc-800/60" />
        <span className="text-xs text-zinc-500 group-hover:text-amber-400 transition-colors uppercase tracking-widest font-mono whitespace-nowrap">
          CheckOnChain Charts · Fabio Valentini methodology
          <span className="ml-2 text-zinc-600">{chartsOpen ? '▲ hide' : '▼ show'}</span>
        </span>
        <div className="flex-1 h-px bg-zinc-800/60" />
      </button>

      {chartsOpen && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {CHARTS.slice(0, 4).map((chart) => <ChartFrame key={chart.id} chart={chart} />)}
          </div>
          <ChartFrame chart={CHARTS[4]} />
        </>
      )}

      {/* ── METHODOLOGY GUIDE ──────────────────────────────────────────────────── */}
      <div className="bg-[#08080d] border border-zinc-800/40 rounded-lg p-4">
        <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">HOW TO READ — FABIO VALENTINI METHODOLOGY</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-zinc-500 leading-relaxed">
          <div>
            <p className="text-amber-500 font-bold mb-1 text-xs uppercase tracking-widest">VALUATION OSCILLATORS</p>
            <p>When ALL 4 oscillators (MVRV, SOPR, Puell, Reserve Risk) are in blue zones simultaneously → maximum conviction buy. Any single oscillator in red = warning. ALL in red = euphoria, exit longs.</p>
          </div>
          <div>
            <p className="text-amber-500 font-bold mb-1 text-xs uppercase tracking-widest">SUPPLY DISTRIBUTION</p>
            <p>10yr+ and 5yr+ bands growing = smart money accumulating (bullish). Shrinking = they are selling (cycle top). 6m–1yr band growing = weak hands buying (contrarian sell signal). Fade STH, follow LTH.</p>
          </div>
          <div>
            <p className="text-amber-500 font-bold mb-1 text-xs uppercase tracking-widest">LIQUIDATION TIMING</p>
            <p>Large OI flush bars in Deep Value / Capitulation zones = forced long liquidation = highest probability long entries. Stack with MVRV in blue zone for maximum edge.</p>
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-zinc-700 font-mono uppercase tracking-widest pb-2">
        Data: CheckOnChain · BitInfoCharts · alternative.me · Yahoo Finance
      </p>
    </div>
  );
}
