'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, Wifi, WifiOff, Columns2, X } from 'lucide-react';
import { clsx } from 'clsx';
import {
  ResponsiveContainer, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import type { COTContract, COTHistoryPoint, COTResponse } from '@/lib/types';

// ---------- Constants ----------

type Category = 'fx' | 'index' | 'rates' | 'energy' | 'metals' | 'ag' | 'crypto';
type Span = '1Y' | '2Y' | '5Y' | 'MAX';

const CAT_LABELS: Record<Category, string> = {
  fx:     'FX',
  index:  'Indices',
  rates:  'Rates',
  energy: 'Energy',
  metals: 'Metals',
  ag:     'Ag',
  crypto: 'Crypto',
};

const CATEGORIES: Category[] = ['fx', 'index', 'rates', 'energy', 'metals', 'ag', 'crypto'];

const SPAN_MONTHS: Record<Span, number> = { '1Y': 12, '2Y': 24, '5Y': 60, 'MAX': 9999 };

// ---------- Formatting ----------

const fmt  = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.abs(n));
const fmtK = (n: number) => (n >= 0 ? '+' : '−') + (Math.abs(n) >= 1000 ? (Math.abs(n) / 1000).toFixed(1) + 'K' : String(Math.abs(n)));
const fmtSigned = (n: number) => (n >= 0 ? '+' : '') + fmt(n);

function ChangeBadge({ value }: { value: number | undefined }) {
  if (value === undefined || isNaN(value)) return <span className="text-xs text-slate-700 font-mono">—</span>;
  const pos = value >= 0;
  return (
    <span className={clsx(
      'inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold tabular-nums',
      pos ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400',
    )}>
      {pos ? '+' : ''}{fmt(value)}
    </span>
  );
}

function formatDate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatAxisDate(s: string) {
  const [y, m] = s.split('-').map(Number);
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]} '${String(y).slice(2)}`;
}

// ---------- COT Data Table ----------

function COTTable({ contract }: { contract: COTContract }) {
  const { nonCommercial: nc, commercial: comm, total, nonReportable: nr } = contract;

  const headerCols = [
    { label: 'Non-Commercial', span: 3, color: 'text-amber-400' },
    { label: 'Commercial',     span: 2, color: 'text-sky-400'   },
    { label: 'Total',          span: 2, color: 'text-emerald-400'},
    { label: 'Non-Reportable', span: 2, color: 'text-slate-400' },
  ];

  const subCols = ['Long','Short','Spreads','Long','Short','Long','Short','Long','Short'];

  const posRow   = [nc.long, nc.short, nc.spread??0, comm.long, comm.short, total.long, total.short, nr.long, nr.short];
  const chgRow   = [nc.changeLong, nc.changeShort, nc.changeSpread??0, comm.changeLong, comm.changeShort, total.changeLong, total.changeShort, nr.changeLong, nr.changeShort];
  const pctRow   = contract.pctOI;
  const trdRow   = contract.traderCount;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse min-w-[700px]">
        <thead>
          <tr className="border-b border-slate-800">
            {headerCols.map((h) => (
              <th
                key={h.label}
                colSpan={h.span}
                className={clsx('py-2 px-2 text-center font-semibold uppercase tracking-wider text-[11px] border-r border-slate-800/60 last:border-r-0', h.color)}
              >
                {h.label}
              </th>
            ))}
          </tr>
          <tr className="border-b border-slate-800/60">
            {subCols.map((c, i) => (
              <th key={i} className="py-1.5 px-2 text-center text-[10px] font-medium text-slate-500 uppercase tracking-wider border-r border-slate-800/40 last:border-r-0">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Contract size + Open Interest */}
          <tr className="bg-slate-900/30 border-b border-slate-800/40">
            <td colSpan={5} className="px-2 py-1.5 text-slate-500 text-[11px]">{contract.contractSize || '—'}</td>
            <td colSpan={4} className="px-2 py-1.5 text-right text-slate-500 text-[11px]">
              Open Interest: <span className="text-slate-300 font-mono font-semibold">{fmt(contract.openInterest)}</span>
            </td>
          </tr>

          {/* Position numbers */}
          <tr className="border-b border-slate-800/40 hover:bg-slate-800/20">
            {posRow.map((v, i) => (
              <td key={i} className="px-2 py-2 text-center font-mono text-slate-200 tabular-nums border-r border-slate-800/30 last:border-r-0">
                {fmt(v)}
              </td>
            ))}
          </tr>

          {/* Changes label */}
          <tr className="bg-slate-900/30 border-b border-slate-800/40">
            <td colSpan={5} className="px-2 py-1.5 text-slate-500 text-[11px]">Changes</td>
            <td colSpan={4} className="px-2 py-1.5 text-right text-slate-500 text-[11px]">
              Change in Open Interest:{' '}
              <span className={clsx('font-mono font-semibold', contract.changeOI >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {fmtSigned(contract.changeOI)}
              </span>
            </td>
          </tr>

          {/* Change numbers */}
          <tr className="border-b border-slate-800/40 hover:bg-slate-800/20">
            {chgRow.map((v, i) => (
              <td key={i} className="px-2 py-2 text-center border-r border-slate-800/30 last:border-r-0">
                <ChangeBadge value={v} />
              </td>
            ))}
          </tr>

          {/* Percent of OI label */}
          <tr className="bg-slate-900/30 border-b border-slate-800/40">
            <td colSpan={9} className="px-2 py-1.5 text-slate-500 text-[11px]">
              Percent of Open Interest for Each Category of Traders
            </td>
          </tr>

          {/* Pct numbers */}
          <tr className="border-b border-slate-800/40 hover:bg-slate-800/20">
            {(pctRow.length ? pctRow : Array(9).fill(0)).map((v, i) => (
              <td key={i} className="px-2 py-2 text-center font-mono text-slate-400 tabular-nums text-[11px] border-r border-slate-800/30 last:border-r-0">
                {v.toFixed(1)}%
              </td>
            ))}
          </tr>

          {/* Traders label */}
          <tr className="bg-slate-900/30 border-b border-slate-800/40">
            <td colSpan={5} className="px-2 py-1.5 text-slate-500 text-[11px]">Number of Traders in Each Category</td>
            <td colSpan={4} className="px-2 py-1.5 text-right text-slate-500 text-[11px]">
              Total Traders: <span className="text-slate-300 font-mono font-semibold">{contract.totalTraders}</span>
            </td>
          </tr>

          {/* Trader counts */}
          <tr className="hover:bg-slate-800/20">
            {Array(9).fill(0).map((_, i) => (
              <td key={i} className="px-2 py-2 text-center font-mono text-slate-400 tabular-nums text-[11px] border-r border-slate-800/30 last:border-r-0">
                {i < 7 && (contract.traderCount[i] ?? 0) > 0 ? (contract.traderCount[i] ?? 0) : '—'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ---------- Net Positions + Price Chart ----------

const CHART_COLORS = {
  nc:   '#3b82f6',  // blue
  comm: '#64748b',  // slate
  nr:   '#ef4444',  // red
  price:'#f59e0b',  // amber
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
};

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-md border border-slate-700 bg-[#0d0d0f] px-3 py-2 text-xs shadow-xl min-w-[160px]">
      <p className="text-slate-400 mb-1.5 font-mono">{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 mb-0.5">
          <span style={{ color: p.color }} className="font-medium">{p.name}</span>
          <span className="font-mono tabular-nums" style={{ color: p.color }}>
            {p.name === 'Price'
              ? p.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
              : fmtSigned(Math.round(p.value))}
          </span>
        </div>
      ))}
    </div>
  );
}

type LineKey = 'nc' | 'comm' | 'nr' | 'price';

function NetChart({ history, compact = false }: { history: COTHistoryPoint[]; compact?: boolean }) {
  const [span, setSpan] = useState<Span>('1Y');
  const [hidden, setHidden] = useState<Set<LineKey>>(new Set());

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - SPAN_MONTHS[span]);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const points = history.filter((p) => span === 'MAX' || p.date >= cutoffStr);

  const hasPrice = points.some((p) => p.close !== undefined);

  const step = Math.max(1, Math.ceil(points.length / 8));
  const ticks = points.filter((_, i) => i % step === 0).map((p) => p.date);

  const toggleLine = (k: LineKey) =>
    setHidden((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const LINE_DEFS: { key: LineKey; label: string; color: string }[] = [
    { key: 'nc',    label: 'Non-Comm',   color: CHART_COLORS.nc   },
    { key: 'comm',  label: 'Commercial', color: CHART_COLORS.comm },
    { key: 'nr',    label: 'Non-Rept',   color: CHART_COLORS.nr   },
    ...(hasPrice ? [{ key: 'price' as LineKey, label: 'Price', color: CHART_COLORS.price }] : []),
  ];

  if (points.length < 2) return (
    <div className="h-48 flex items-center justify-center text-slate-600 text-sm">No history data</div>
  );

  return (
    <div>
      {/* Controls row */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        {/* Toggleable legend */}
        <div className="flex items-center gap-2 flex-wrap">
          {LINE_DEFS.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => toggleLine(key)}
              className={clsx(
                'flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-all border',
                hidden.has(key)
                  ? 'border-slate-800 text-slate-700 bg-transparent'
                  : 'border-slate-700/60 bg-slate-800/40',
              )}
              style={{ color: hidden.has(key) ? undefined : color }}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: hidden.has(key) ? '#334155' : color }}
              />
              {label}
            </button>
          ))}
        </div>
        {/* Span selector */}
        <div className="flex gap-1">
          {(['1Y','2Y','5Y','MAX'] as Span[]).map((s) => (
            <button
              key={s}
              onClick={() => setSpan(s)}
              className={clsx(
                'px-2 py-0.5 rounded text-[11px] font-medium transition-colors',
                span === s
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                  : 'text-slate-600 hover:text-slate-300',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer key={span} width="100%" height={compact ? 180 : 240}>
        <ComposedChart data={points} margin={{ top: 4, right: hasPrice && !hidden.has('price') ? 48 : 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={ticks}
            tickFormatter={formatAxisDate}
            tick={{ fill: '#475569', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="net"
            tickFormatter={(v) => fmtK(v)}
            tick={{ fill: '#475569', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={52}
          />
          {hasPrice && !hidden.has('price') && (
            <YAxis
              yAxisId="price"
              orientation="right"
              tick={{ fill: '#475569', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={44}
              domain={['auto', 'auto']}
              tickFormatter={(v) => v >= 1000 ? (v/1000).toFixed(1)+'K' : String(v)}
            />
          )}
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine yAxisId="net" y={0} stroke="#334155" strokeDasharray="4 2" />
          {!hidden.has('nc') && (
            <Line
              yAxisId="net" type="stepAfter" dataKey="net"
              name="Non-Comm" stroke={CHART_COLORS.nc}
              strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          )}
          {!hidden.has('comm') && (
            <Line
              yAxisId="net" type="stepAfter" dataKey="commercial"
              name="Commercial" stroke={CHART_COLORS.comm}
              strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          )}
          {!hidden.has('nr') && (
            <Line
              yAxisId="net" type="stepAfter" dataKey="nonRept"
              name="Non-Rept" stroke={CHART_COLORS.nr}
              strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          )}
          {hasPrice && !hidden.has('price') && (
            <Line
              yAxisId="price" type="monotone" dataKey="close"
              name="Price" stroke={CHART_COLORS.price}
              strokeWidth={1} dot={false} activeDot={{ r: 3, strokeWidth: 0 }}
              strokeOpacity={0.8}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------- Detail panel ----------

function DetailPanel({ contract, compact = false }: { contract: COTContract; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Report header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-slate-100">{contract.label}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {contract.exchange} · Legacy Futures Only · as of {formatDate(contract.reportDate)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-slate-600 uppercase tracking-wider">NC Net</p>
          <p className={clsx('text-sm font-mono font-bold', contract.nonCommercial.net >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {fmtSigned(contract.nonCommercial.net)}
          </p>
        </div>
      </div>

      {/* Full table */}
      <COTTable contract={contract} />

      {/* Chart */}
      {contract.history.length >= 2 && (
        <div className="pt-1">
          <p className="text-xs font-semibold text-slate-400 mb-3">Prices &amp; Net Positions</p>
          <NetChart history={contract.history} compact={compact} />
        </div>
      )}
    </div>
  );
}

// ---------- Compare panel ----------

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

  const grouped = CATEGORIES.map((cat) => ({
    cat,
    items: contracts.filter((c) => c.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div className={clsx(
      'flex-1 flex flex-col gap-4 px-4 sm:px-5 py-4 overflow-y-auto',
      side === 'left' ? 'border-b md:border-b-0 md:border-r border-slate-800/60' : '',
    )}>
      <select
        value={selectedKey}
        onChange={(e) => onSelect(e.target.value)}
        className="w-full bg-[#0d0d0f] border border-slate-700/60 rounded-lg px-3 py-2 text-sm text-slate-200 font-semibold focus:outline-none focus:border-amber-500/50 cursor-pointer"
      >
        {grouped.map(({ cat, items }) => (
          <optgroup key={cat} label={CAT_LABELS[cat]}>
            {items.map((c) => (
              <option key={c.key} value={c.key}>{c.label} ({c.exchange})</option>
            ))}
          </optgroup>
        ))}
      </select>
      {contract && <DetailPanel contract={contract} compact />}
    </div>
  );
}

// ---------- Asset list sidebar (accordion dropdowns) ----------

function AssetList({
  contracts,
  activeKey,
  onSelect,
}: {
  contracts: COTContract[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const [open, setOpen] = useState<Set<Category>>(() => {
    try {
      const saved = localStorage.getItem('cot_cat_open');
      if (saved) return new Set(JSON.parse(saved) as Category[]);
    } catch {}
    return new Set(CATEGORIES);
  });

  const toggle = (cat: Category) =>
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      try { localStorage.setItem('cot_cat_open', JSON.stringify(Array.from(next))); } catch {}
      return next;
    });

  const groups = CATEGORIES.map((cat) => ({
    cat,
    items: contracts.filter((c) => c.category === cat),
  })).filter((g) => g.items.length > 0);

  const renderItem = (c: COTContract) => {
    const net = c.nonCommercial.net;
    const isActive = c.key === activeKey;
    return (
      <button
        key={c.key}
        onClick={() => onSelect(c.key)}
        className={clsx(
          'w-full text-left pl-4 pr-3 py-2 transition-colors flex items-center justify-between gap-2',
          isActive
            ? 'bg-amber-500/15 border-r-2 border-amber-500 text-amber-200'
            : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200',
        )}
      >
        <span className="text-xs font-medium truncate">{c.label}</span>
        <span className={clsx('text-[11px] font-mono shrink-0', net >= 0 ? 'text-emerald-500' : 'text-red-500')}>
          {fmtK(net)}
        </span>
      </button>
    );
  };

  const sidebar = (
    <div className="flex-1 overflow-y-auto">
      {groups.map(({ cat, items }) => (
        <div key={cat}>
          {/* Category header / toggle */}
          <button
            onClick={() => toggle(cat)}
            className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 hover:bg-slate-800/30 transition-colors border-b border-slate-800/40"
          >
            <span>{CAT_LABELS[cat]}</span>
            <span className="text-slate-700 text-[10px]">{open.has(cat) ? '▲' : '▼'}</span>
          </button>
          {/* Items */}
          {open.has(cat) && (
            <div className="border-b border-slate-800/20">
              {items.map(renderItem)}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <>
      {/* Mobile: compact horizontal strip (same as before) */}
      <div className="md:hidden flex flex-col border-b border-slate-800/60 bg-[#0d0d0f]/40 shrink-0">
        <div className="flex overflow-x-auto gap-1.5 px-3 py-2.5 scrollbar-none">
          {contracts.map((c) => {
            const net = c.nonCommercial.net;
            const isActive = c.key === activeKey;
            return (
              <button
                key={c.key}
                onClick={() => onSelect(c.key)}
                className={clsx(
                  'flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-medium transition-colors whitespace-nowrap',
                  isActive
                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                    : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:text-slate-200',
                )}
              >
                <span>{c.label}</span>
                <span className={clsx('font-mono text-[10px]', net >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {fmtK(net)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Desktop: vertical accordion sidebar */}
      <div className="hidden md:flex w-48 shrink-0 flex-col border-r border-slate-800/60 bg-[#0d0d0f]/40">
        {sidebar}
      </div>
    </>
  );
}

// ---------- localStorage cache ----------

const LS_KEY = 'cot_v4';
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

let _mem: COTResponse | null = null;

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
    if (!force && _mem) { setData(_mem); setLoading(false); return; }

    if (!force) {
      const ls = lsRead();
      if (ls) { _mem = ls; setData(ls); setLoading(false); return; }
    }

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
          <p className="text-xs text-slate-600 mt-0.5">CFTC · Legacy Futures Only · {contracts.length} contracts</p>
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
            title="Force refresh from Tradingster"
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
          Loading COT data — fetching {contracts.length || 28} contracts from Tradingster…
        </div>
      ) : contracts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">No COT data available.</div>
      ) : mode === 'single' ? (
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
          <AssetList contracts={contracts} activeKey={activeKey} onSelect={setActiveKey} />
          <div className="flex-1 px-4 sm:px-6 py-5 overflow-y-auto">
            {activeContract && <DetailPanel contract={activeContract} />}
          </div>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden overflow-y-auto md:overflow-hidden">
          <ComparePanel contracts={contracts} selectedKey={compareA} onSelect={setCompareA} side="left" />
          <ComparePanel contracts={contracts} selectedKey={compareB} onSelect={setCompareB} side="right" />
        </div>
      )}

      {/* Footer */}
      {!loading && contracts.length > 0 && (
        <div className="px-5 py-3 border-t border-slate-800/60 text-xs text-slate-700 shrink-0 flex items-center justify-between">
          <span>CFTC · Positions as of Tuesday each week, released Friday</span>
          <span className="font-mono">
            {data && new Date(data.fetchedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>
      )}
    </div>
  );
}
