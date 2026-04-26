'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, AlertTriangle, Wifi, WifiOff, Columns2, X } from 'lucide-react';
import { clsx } from 'clsx';
import type { COTContract, COTHistoryPoint, COTResponse } from '@/lib/types';

// ---------- Sparkline ----------

const SVG_W = 600;
const SVG_H = 200;
const PAD_X = 0;
const PAD_Y = 6;

function formatShortDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function Sparkline({ history, net, height = 72 }: { history: COTHistoryPoint[]; net: number; height?: number }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const animKey = useRef(0);
  const [animId, setAnimId] = useState(0);

  useEffect(() => {
    animKey.current += 1;
    setAnimId(animKey.current);
  }, [history]);

  if (history.length < 2) return <div className="bg-slate-800/30 rounded" style={{ height }} />;

  const values = history.map((h) => h.net);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  // SVG coordinate helpers
  const sx = (i: number) => PAD_X + (i / (values.length - 1)) * (SVG_W - PAD_X * 2);
  const sy = (v: number) => PAD_Y + (1 - (v - min) / range) * (SVG_H - PAD_Y * 2);

  // Step-line points
  const pts: string[] = [];
  for (let i = 0; i < values.length; i++) {
    if (i > 0) pts.push(`${sx(i).toFixed(1)},${sy(values[i - 1]).toFixed(1)}`);
    pts.push(`${sx(i).toFixed(1)},${sy(values[i]).toFixed(1)}`);
  }
  const linePoints = pts.join(' ');

  // Area fill — close back along bottom
  const areaPoints = `${sx(0).toFixed(1)},${SVG_H} ${linePoints} ${sx(values.length - 1).toFixed(1)},${SVG_H}`;

  const zeroY = sy(0);
  const showZero = min < 0 && max > 0;
  const color = net >= 0 ? '#22c55e' : '#ef4444';

  // Last point — % based for HTML overlay
  const lastXPct = (values.length - 1) / (values.length - 1) * 100; // = 100%
  const lastYPct = ((1 - (values[values.length - 1] - min) / range)) * 100;

  // Hover point — % based for HTML overlay
  const hovXPct = hovered !== null ? (hovered / (values.length - 1)) * 100 : null;
  const hovYPct = hovered !== null ? ((1 - (values[hovered] - min) / range)) * 100 : null;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(relX * (values.length - 1))));
    setHovered(idx);
  };

  const fmtTooltip = (v: number) => (v >= 0 ? '+' : '') + new Intl.NumberFormat('en-US').format(v);

  // Tooltip: flip to left when hover is in right 35% of chart
  const tooltipLeft = hovered !== null && hovered > values.length * 0.65;

  return (
    <div
      className="relative w-full cursor-crosshair select-none"
      style={{ height }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHovered(null)}
    >
      {/* SVG — line only, no interactive elements */}
      <svg
        key={animId}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        {/* Zero line */}
        {showZero && (
          <line
            x1={PAD_X} y1={zeroY.toFixed(1)}
            x2={SVG_W - PAD_X} y2={zeroY.toFixed(1)}
            stroke="#334155" strokeWidth="1.5" strokeDasharray="6,4"
          />
        )}

        {/* Area fill */}
        <polyline points={areaPoints} fill={color} opacity="0.07" stroke="none" />

        {/* Animated step line */}
        <polyline
          className="cot-line"
          pathLength="1"
          points={linePoints}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="miter"
          strokeLinecap="square"
          opacity="0.9"
        />
      </svg>

      {/* HTML overlays — no SVG distortion */}

      {/* Last-point dot */}
      <div
        className="absolute w-2.5 h-2.5 rounded-full border-2 border-[#111113] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ left: `${lastXPct}%`, top: `${lastYPct}%`, backgroundColor: color }}
      />

      {/* Hover elements */}
      {hovered !== null && hovXPct !== null && hovYPct !== null && (
        <>
          {/* Vertical crosshair */}
          <div
            className="absolute top-0 bottom-0 w-px pointer-events-none -translate-x-1/2"
            style={{ left: `${hovXPct}%`, backgroundColor: '#475569', opacity: 0.6 }}
          />

          {/* Hover dot */}
          <div
            className="absolute w-3 h-3 rounded-full -translate-x-1/2 -translate-y-1/2 pointer-events-none ring-4 transition-all duration-75"
            style={{
              left: `${hovXPct}%`,
              top: `${hovYPct}%`,
              backgroundColor: color,
              boxShadow: `0 0 0 4px ${color}22`,
            }}
          />

          {/* Tooltip */}
          <div
            className="absolute pointer-events-none z-10 -translate-y-1/2"
            style={{
              top: `${Math.max(10, Math.min(90, hovYPct))}%`,
              ...(tooltipLeft
                ? { right: `${100 - hovXPct}%`, marginRight: 14 }
                : { left: `${hovXPct}%`, marginLeft: 14 }),
            }}
          >
            <div className="bg-[#111113] border border-slate-700/80 rounded-lg px-3 py-2 shadow-xl shadow-black/50 min-w-[130px]">
              <p className="text-xs text-slate-500 font-mono mb-0.5">{formatShortDate(history[hovered].date)}</p>
              <p className="text-sm font-bold font-mono" style={{ color }}>
                {fmtTooltip(values[hovered])}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Helpers ----------

const fmt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
const fmtDelta = (n: number) => (n >= 0 ? '+' : '') + fmt(n);

function ChangeBadge({ value }: { value: number | undefined }) {
  if (value === undefined || isNaN(value)) return <span className="text-xs text-slate-700 font-mono">—</span>;
  const pos = value >= 0;
  return (
    <span className={clsx(
      'inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold',
      pos ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400',
    )}>
      {pos ? '+' : ''}{fmt(value)}
    </span>
  );
}

function PositionBlock({
  label, labelColor, pos, openInterest, compact,
}: {
  label: string;
  labelColor: string;
  pos: import('@/lib/types').COTPosition;
  openInterest: number;
  compact?: boolean;
}) {
  const hasSpreads = (pos.spread ?? 0) > 0;
  const pct = (n: number) => openInterest > 0 ? (n / openInterest * 100).toFixed(1) + '%' : '—';

  return (
    <div className="rounded-md border border-slate-800/60 overflow-hidden text-sm">
      {/* Category header */}
      <div className="px-3 py-2 bg-[#0d0d0f] border-b border-slate-800/60 flex items-center justify-between gap-2">
        <span className={clsx('text-[11px] font-semibold uppercase tracking-wider', labelColor)}>{label}</span>
        <span className={clsx('font-mono text-xs font-bold tabular-nums', pos.net >= 0 ? 'text-emerald-400' : 'text-red-400')}>
          {fmtDelta(pos.net)}
        </span>
      </div>

      <div className="px-3 py-2.5 space-y-2.5">
        {/* Column headers */}
        <div className={clsx('grid gap-2 text-[10px] text-slate-600 uppercase tracking-wider', hasSpreads ? 'grid-cols-3' : 'grid-cols-2')}>
          <span>Long</span>
          <span className="text-right">Short</span>
          {hasSpreads && <span className="text-right">Spreads</span>}
        </div>

        {/* Position numbers */}
        <div className={clsx('grid gap-2 font-mono tabular-nums text-slate-200', compact ? 'text-xs' : 'text-sm', hasSpreads ? 'grid-cols-3' : 'grid-cols-2')}>
          <span>{fmt(pos.long)}</span>
          <span className="text-right">{fmt(pos.short)}</span>
          {hasSpreads && <span className="text-right">{fmt(pos.spread!)}</span>}
        </div>

        {/* Changes */}
        <div className="pt-1.5 border-t border-slate-800/40 space-y-1.5">
          <span className="text-[10px] text-slate-600 uppercase tracking-wider">Changes</span>
          <div className={clsx('grid gap-2', hasSpreads ? 'grid-cols-3' : 'grid-cols-2')}>
            <ChangeBadge value={pos.changeLong} />
            <div className="flex justify-end"><ChangeBadge value={pos.changeShort} /></div>
            {hasSpreads && <div className="flex justify-end"><ChangeBadge value={pos.changeSpread!} /></div>}
          </div>
        </div>

        {/* % of Open Interest */}
        <div className="pt-1.5 border-t border-slate-800/40 space-y-1.5">
          <span className="text-[10px] text-slate-600 uppercase tracking-wider">% of Open Interest</span>
          <div className={clsx('grid gap-2 font-mono tabular-nums text-slate-500 text-xs', hasSpreads ? 'grid-cols-3' : 'grid-cols-2')}>
            <span>{pct(pos.long)}</span>
            <span className="text-right">{pct(pos.short)}</span>
            {hasSpreads && <span className="text-right">{pct(pos.spread!)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------- Detail panel ----------

function DetailPanel({ contract, sparklineHeight = 88, compact = false }: { contract: COTContract; sparklineHeight?: number; compact?: boolean }) {
  const nc   = contract.nonCommercial;
  const comm = contract.commercial;
  const nr   = contract.nonReportable;

  const blocks = [
    { label: 'Non-Commercial', labelColor: 'text-amber-400', pos: nc   },
    { label: 'Commercial',     labelColor: 'text-sky-400',    pos: comm },
    { label: 'Non-Reportable', labelColor: 'text-slate-500',  pos: nr   },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Sparkline */}
      <div>
        <p className="text-xs text-slate-600 mb-2">Non-commercial net · last {contract.history.length} weeks</p>
        <Sparkline history={contract.history} net={nc.net} height={sparklineHeight} />
      </div>

      {/* OI */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 uppercase tracking-wider">Open Interest</span>
        <span className="text-xs font-mono text-slate-400">{fmt(contract.openInterest)}</span>
        <span className="text-xs text-slate-600">· as of {formatDate(contract.reportDate)}</span>
      </div>

      {/* Position blocks */}
      <div className={clsx('grid gap-3', compact ? 'grid-cols-1' : 'grid-cols-3')}>
        {blocks.map(({ label, labelColor, pos }) => (
          <PositionBlock
            key={label}
            label={label}
            labelColor={labelColor}
            pos={pos}
            openInterest={contract.openInterest}
            compact={compact}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Compare panel (with asset selector) ----------

function ComparePanel({
  contracts,
  selectedKey,
  onSelect,
  side,
}: {
  contracts: COTContract[];
  selectedKey: string;
  onSelect: (key: string) => void;
  side: 'left' | 'right';
}) {
  const contract = contracts.find((c) => c.key === selectedKey) ?? contracts[0];

  return (
    <div className={clsx(
      'flex-1 flex flex-col gap-4 px-5 py-4 overflow-y-auto',
      side === 'left' ? 'border-r border-slate-800/60' : '',
    )}>
      {/* Asset selector */}
      <select
        value={selectedKey}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full bg-[#0d0d0f] border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 font-semibold focus:outline-none focus:border-amber-500/50 cursor-pointer"
      >
        <optgroup label="Currencies">
          {contracts.filter((c) => c.category === 'currency').map((c) => (
            <option key={c.key} value={c.key}>{c.label} ({c.exchange})</option>
          ))}
        </optgroup>
        <optgroup label="Commodities">
          {contracts.filter((c) => c.category === 'commodity').map((c) => (
            <option key={c.key} value={c.key}>{c.label} ({c.exchange})</option>
          ))}
        </optgroup>
      </select>

      {contract && <DetailPanel contract={contract} compact />}
    </div>
  );
}

// ---------- Asset list sidebar ----------

type Tab = 'currency' | 'commodity';

function AssetList({
  contracts,
  activeKey,
  onSelect,
}: {
  contracts: COTContract[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const [tab, setTab] = useState<Tab>('currency');
  const filtered = contracts.filter((c) => c.category === tab);

  return (
    <div className="w-48 shrink-0 flex flex-col border-r border-slate-800/60 bg-[#0d0d0f]/40">
      {/* Tabs */}
      <div className="flex border-b border-slate-800/60 px-2 pt-2 gap-1">
        {(['currency', 'commodity'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'flex-1 pb-2 text-xs font-medium transition-colors rounded-t',
              tab === t ? 'text-amber-300 border-b-2 border-amber-500' : 'text-slate-600 hover:text-slate-400',
            )}
          >
            {t === 'currency' ? 'FX' : 'Commod'}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.map((c) => {
          const net = c.nonCommercial.net;
          const isActive = c.key === activeKey;
          return (
            <button
              key={c.key}
              onClick={() => onSelect(c.key)}
              className={clsx(
                'w-full text-left px-3 py-2.5 transition-colors flex items-center justify-between gap-2',
                isActive
                  ? 'bg-amber-500/15 border-r-2 border-amber-500 text-amber-200'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200',
              )}
            >
              <span className="text-sm font-medium truncate">{c.label}</span>
              <span className={clsx(
                'text-xs font-mono shrink-0',
                net >= 0 ? 'text-emerald-500' : 'text-red-500',
              )}>
                {net >= 0 ? '+' : ''}{Math.round(net / 1000)}K
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Client-side cache — two layers ----------
// Module-level: survives navigation within the same browser tab (instant)
// localStorage: survives page refresh / browser restart (stale after 7 days)

const LS_KEY = 'cot_v3';
const LS_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

function lsRead(): COTResponse | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const { data, at }: { data: COTResponse; at: number } = JSON.parse(raw);
    return Date.now() - at < LS_MAX_AGE ? data : null;
  } catch { return null; }
}

function lsWrite(data: COTResponse): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ data, at: Date.now() })); } catch {}
}

function lsClear(): void {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

let _mem: COTResponse | null = null; // module-level, cleared on page reload

// ---------- Main section ----------

export default function COTSection() {
  const [data, setData]             = useState<COTResponse | null>(_mem);
  const [loading, setLoading]       = useState(_mem === null);
  const [refreshing, setRefreshing] = useState(false);
  const [mode, setMode]             = useState<'single' | 'compare'>('single');
  const [activeKey, setActiveKey]   = useState('eur');
  const [compareA, setCompareA]     = useState('eur');
  const [compareB, setCompareB]     = useState('jpy');

  const fetchData = useCallback(async (force = false) => {
    // 1. Module cache — instant, same tab navigation
    if (!force && _mem) { setData(_mem); setLoading(false); return; }

    // 2. localStorage — instant, survives page refresh
    if (!force) {
      const ls = lsRead();
      if (ls) { _mem = ls; setData(ls); setLoading(false); return; }
    }

    // 3. Server fetch
    if (force) { lsClear(); setRefreshing(true); }
    else setLoading(true);

    try {
      const res = await fetch('/api/cot', { cache: 'no-store' });
      const json: COTResponse = await res.json();
      _mem = json;
      lsWrite(json);
      setData(json);
    } catch {
      setData((prev) =>
        prev
          ? { ...prev, isStale: true, error: 'Network error — showing cached data' }
          : { contracts: [], fetchedAt: new Date().toISOString(), isStale: true, source: 'error', error: 'Failed to load COT data.' },
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(false); }, [fetchData]);

  const contracts = data?.contracts ?? [];
  const activeContract = contracts.find((c) => c.key === activeKey) ?? contracts[0];

  return (
    <div className="rounded-lg border border-slate-800/60 bg-[#111113] overflow-hidden shadow-xl shadow-black/30 flex flex-col" style={{ minHeight: 560 }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 bg-[#0d0d0f] shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide">Commitment of Traders</h2>
          <p className="text-xs text-slate-600 mt-0.5">CFTC · Legacy Futures Only · Weekly</p>
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono">
              {data.isStale
                ? <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                : <Wifi className="w-3.5 h-3.5 text-emerald-500" />}
              <span className="text-slate-600">
                {data.source?.toUpperCase()} ·{' '}
                {new Date(data.fetchedAt).toLocaleTimeString('en-US', {
                  timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
                })} ET
              </span>
            </div>
          )}

          {/* Compare toggle */}
          <button
            onClick={() => setMode(mode === 'compare' ? 'single' : 'compare')}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
              mode === 'compare'
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/30',
            )}
          >
            {mode === 'compare' ? <X className="w-3.5 h-3.5" /> : <Columns2 className="w-3.5 h-3.5" />}
            <span>{mode === 'compare' ? 'Exit compare' : 'Compare'}</span>
          </button>

          <button
            onClick={() => fetchData(true)}
            disabled={loading || refreshing}
            title="Force refresh from CFTC"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-slate-400 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/30 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {data?.error && (
        <div className="flex items-center gap-2 px-5 py-2.5 bg-amber-500/8 border-b border-amber-500/15 text-xs text-amber-400 shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {data.error}
        </div>
      )}

      {/* Body */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          Loading CFTC data — this may take 20–40s on first load…
        </div>
      ) : contracts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          No COT data available.
        </div>
      ) : mode === 'single' ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <AssetList contracts={contracts} activeKey={activeKey} onSelect={setActiveKey} />

          {/* Detail */}
          <div className="flex-1 px-6 py-5 overflow-y-auto">
            {activeContract && (
              <>
                <div className="flex items-baseline gap-3 mb-5">
                  <h3 className="text-xl font-bold text-slate-100">{activeContract.label}</h3>
                  <span className="text-xs px-1.5 py-0.5 rounded border border-slate-700/60 text-slate-500 font-mono">
                    {activeContract.exchange}
                  </span>
                </div>
                <DetailPanel contract={activeContract} sparklineHeight={200} />
              </>
            )}
          </div>
        </div>
      ) : (
        /* Compare mode */
        <div className="flex flex-1 overflow-hidden">
          <ComparePanel contracts={contracts} selectedKey={compareA} onSelect={setCompareA} side="left" />
          <ComparePanel contracts={contracts} selectedKey={compareB} onSelect={setCompareB} side="right" />
        </div>
      )}

      {/* Footer */}
      {!loading && contracts.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-800/60 text-xs text-slate-700 shrink-0">
          CFTC · Positions as of Tuesday each week, released Friday · {contracts.length} contracts
        </div>
      )}
    </div>
  );
}
