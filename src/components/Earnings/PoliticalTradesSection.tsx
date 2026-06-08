'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, X, Zap, Landmark, TrendingUp, TrendingDown } from 'lucide-react';
import { clsx } from 'clsx';
import type { PoliticalTrade, PoliticalTradesResponse } from '@/app/api/political-trades/route';

// ── Constants ─────────────────────────────────────────────────────────────────

const NOTABLE = new Set([
  'nancy pelosi', 'paul pelosi', 'dan crenshaw', 'josh gottheimer',
  'tommy tuberville', 'marjorie taylor greene', 'michael mccaul',
  'mark warner', 'virginia foxx', 'david rouzer', 'greg gianforte',
  'ro khanna', 'alan lowenthal', 'brian mast', 'pete sessions',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNotable(name: string) {
  return NOTABLE.has(name.toLowerCase());
}

function parseMaxAmount(amount: string): number {
  const nums = amount.replace(/[$,]/g, '').match(/\d+/g);
  if (!nums?.length) return 0;
  return parseInt(nums[nums.length - 1]);
}

function amountMeta(amount: string): { label: string; color: string; weight: number } {
  const max = parseMaxAmount(amount);
  if (max >= 5_000_000) return { label: '$5M+',   color: '#f59e0b', weight: 6 };
  if (max >= 1_000_000) return { label: '$1M+',   color: '#fb923c', weight: 5 };
  if (max >= 500_000)   return { label: '$500K+', color: '#a78bfa', weight: 4 };
  if (max >= 250_000)   return { label: '$250K+', color: '#818cf8', weight: 3 };
  if (max >= 100_000)   return { label: '$100K+', color: '#60a5fa', weight: 2 };
  if (max >= 50_000)    return { label: '$50K+',  color: '#94a3b8', weight: 1 };
  return                       { label: '<$50K',  color: '#334155', weight: 0 };
}

function fmtDate(ds: string): string {
  if (!ds) return '—';
  return new Date(ds + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: '2-digit', timeZone: 'UTC',
  });
}

function daysAgo(ds: string): string {
  const diff = Math.round((Date.now() - new Date(ds + 'T12:00:00Z').getTime()) / 86_400_000);
  if (diff <= 0) return 'today';
  if (diff === 1) return '1d ago';
  return `${diff}d ago`;
}

// ── Cluster detection (same ticker, 3+ distinct politicians, last 90 days) ───

interface ClusterSignal {
  ticker:      string;
  count:       number;
  buyCount:    number;
  sellCount:   number;
  politicians: string[];
  lastDate:    string;
}

function detectClusters(trades: PoliticalTrade[]): ClusterSignal[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const byTicker: Record<string, PoliticalTrade[]> = {};
  for (const t of trades) {
    if (t.tradeDate < cutoffStr) continue;
    if (!byTicker[t.ticker]) byTicker[t.ticker] = [];
    byTicker[t.ticker].push(t);
  }

  const signals: ClusterSignal[] = [];
  for (const ticker of Object.keys(byTicker)) {
    const group       = byTicker[ticker];
    const politicians = Array.from(new Set(group.map((t: PoliticalTrade) => t.politician)));
    if (politicians.length < 3) continue;
    const buyCount  = group.filter((t: PoliticalTrade) => t.transactionType === 'purchase').length;
    const sellCount = group.filter((t: PoliticalTrade) => t.transactionType === 'sale' || t.transactionType === 'sale_partial').length;
    const lastDate  = group.map((t: PoliticalTrade) => t.tradeDate).sort().reverse()[0];
    signals.push({ ticker, count: group.length, buyCount, sellCount, politicians, lastDate });
  }

  return signals.sort((a, b) => b.count - a.count).slice(0, 8);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PartyDot({ party }: { party: string }) {
  const p = party.toLowerCase();
  const color = p.includes('democrat') ? '#3b82f6' : p.includes('republican') ? '#ef4444' : '#475569';
  return <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: color }} title={party} />;
}

function ChamberBadge({ chamber }: { chamber: 'house' | 'senate' }) {
  return (
    <span className={clsx(
      'text-[9px] font-mono font-bold uppercase tracking-wider px-1 py-0.5 rounded border shrink-0',
      chamber === 'senate'
        ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
        : 'bg-sky-500/10 border-sky-500/20 text-sky-400',
    )}>
      {chamber === 'senate' ? 'SEN' : 'HSE'}
    </span>
  );
}

function TypeBadge({ type }: { type: PoliticalTrade['transactionType'] }) {
  if (type === 'purchase') return (
    <span className="flex items-center gap-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border bg-emerald-500/10 border-emerald-500/25 text-emerald-400 shrink-0 whitespace-nowrap">
      <TrendingUp className="w-2.5 h-2.5" /> BUY
    </span>
  );
  if (type === 'sale' || type === 'sale_partial') return (
    <span className="flex items-center gap-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border bg-red-500/10 border-red-500/25 text-red-400 shrink-0 whitespace-nowrap">
      <TrendingDown className="w-2.5 h-2.5" /> {type === 'sale_partial' ? 'SELL P' : 'SELL'}
    </span>
  );
  if (type === 'exchange') return (
    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border bg-amber-500/10 border-amber-500/20 text-amber-500 shrink-0">EXCH</span>
  );
  return <span className="text-[10px] text-slate-700 shrink-0">—</span>;
}

function TradeRow({ trade }: { trade: PoliticalTrade }) {
  const amt     = amountMeta(trade.amount);
  const notable = isNotable(trade.politician);

  return (
    <div className={clsx(
      'flex items-center gap-3 px-4 py-2.5 border-b border-slate-800/30 last:border-0 hover:bg-slate-800/20 transition-colors',
      notable && 'bg-amber-500/3',
    )}>
      {/* Politician */}
      <div className="flex items-center gap-1.5 w-44 shrink-0 min-w-0">
        <PartyDot party={trade.party} />
        <ChamberBadge chamber={trade.chamber} />
        <div className="min-w-0">
          <p className={clsx('text-xs font-medium truncate leading-none', notable ? 'text-amber-300' : 'text-slate-300')}>
            {trade.politician}
            {notable && <span className="ml-1 text-amber-500 text-[9px]">★</span>}
          </p>
          <p className="text-[9px] text-slate-700 font-mono mt-0.5">{trade.state}</p>
        </div>
      </div>

      {/* Ticker */}
      <div className="w-16 shrink-0">
        <p className="text-sm font-bold font-mono text-amber-300 leading-none">{trade.ticker}</p>
        <p className="text-[9px] text-slate-700 mt-0.5 font-mono uppercase">{trade.assetType}</p>
      </div>

      {/* Type */}
      <div className="w-20 shrink-0">
        <TypeBadge type={trade.transactionType} />
      </div>

      {/* Amount */}
      <div className="w-16 shrink-0 text-right">
        <span className="text-xs font-mono font-bold" style={{ color: amt.color }}>{amt.label}</span>
        <p className="text-[9px] text-slate-700 font-mono mt-0.5 truncate" title={trade.amount}>{trade.amount.replace('$', '').replace(' - $', '–$')}</p>
      </div>

      {/* Trade date */}
      <div className="w-20 shrink-0 text-right hidden sm:block">
        <p className="text-xs font-mono text-slate-400">{fmtDate(trade.tradeDate)}</p>
        <p className="text-[9px] text-slate-700 font-mono mt-0.5">{daysAgo(trade.tradeDate)}</p>
      </div>

      {/* Disclosure lag */}
      <div className="w-16 shrink-0 text-right hidden md:block">
        <p className={clsx('text-xs font-mono font-bold', trade.disclosureLagDays > 35 ? 'text-red-500' : 'text-slate-600')}>
          {trade.disclosureLagDays}d lag
        </p>
        <p className="text-[9px] text-slate-700 font-mono mt-0.5">{daysAgo(trade.disclosureDate)}</p>
      </div>

      {/* Asset */}
      <div className="flex-1 min-w-0 hidden lg:block">
        <p className="text-[10px] text-slate-600 truncate">{trade.assetDescription}</p>
      </div>
    </div>
  );
}

// ── Filter types ──────────────────────────────────────────────────────────────

type TypeFilter    = 'all' | 'purchase' | 'sale';
type ChamberFilter = 'all' | 'house' | 'senate';
type WindowFilter  = '7d' | '30d' | '90d' | 'all';

const WINDOW_DAYS: Record<WindowFilter, number> = { '7d': 7, '30d': 30, '90d': 90, all: 9999 };

// ── Main export ───────────────────────────────────────────────────────────────

export default function PoliticalTradesSection() {
  const [data,       setData]       = useState<PoliticalTradesResponse | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter,    setTypeFilter]    = useState<TypeFilter>('all');
  const [chamberFilter, setChamberFilter] = useState<ChamberFilter>('all');
  const [window_,       setWindow_]       = useState<WindowFilter>('30d');
  const [query,         setQuery]         = useState('');
  const [notableOnly,   setNotableOnly]   = useState(false);

  async function load(silent = false) {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const r  = await fetch('/api/political-trades', { cache: 'no-store' });
      const j: PoliticalTradesResponse = await r.json();
      setData(j);
    } catch {
      setData((prev) => prev ? { ...prev, source: 'error', error: 'Network error' } : null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(false); }, []);

  const clusters = useMemo(() => detectClusters(data?.trades ?? []), [data]);

  const filtered = useMemo(() => {
    const trades = data?.trades ?? [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - WINDOW_DAYS[window_]);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    const q = query.trim().toLowerCase();

    return trades.filter((t) => {
      if (t.disclosureDate < cutoffStr) return false;
      if (typeFilter === 'purchase' && t.transactionType !== 'purchase') return false;
      if (typeFilter === 'sale' && t.transactionType !== 'sale' && t.transactionType !== 'sale_partial') return false;
      if (chamberFilter !== 'all' && t.chamber !== chamberFilter) return false;
      if (notableOnly && !isNotable(t.politician)) return false;
      if (q && !t.ticker.toLowerCase().includes(q) && !t.politician.toLowerCase().includes(q) && !t.assetDescription.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, typeFilter, chamberFilter, window_, query, notableOnly]);

  return (
    <div className="space-y-4">
      {/* Divider */}
      <div className="flex items-center gap-3 pt-4">
        <div className="h-px flex-1 bg-slate-800/60" />
        <div className="flex items-center gap-2">
          <Landmark className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-xs text-slate-600 uppercase tracking-widest font-mono">Congressional Trades</span>
        </div>
        <div className="h-px flex-1 bg-slate-800/60" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Political Trades Intelligence</h3>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            STOCK Act filings · House + Senate · up to 45d disclosure lag
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.fetchedAt && (
            <span className="text-xs text-slate-600 font-mono hidden sm:inline">
              {data.source === 'cache' ? 'cached · ' : ''}
              {new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} ET
            </span>
          )}
          <button
            onClick={() => load(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/60 text-xs text-slate-400 hover:bg-amber-500/10 hover:text-amber-300 hover:border-amber-500/30 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* Cluster signals */}
      {clusters.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">Cluster Signals — 3+ politicians same ticker (90d)</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {clusters.map((c) => (
              <button
                key={c.ticker}
                onClick={() => { setQuery(c.ticker); setWindow_('90d'); }}
                className="flex items-center gap-2 px-3 py-1.5 rounded border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-colors"
              >
                <span className="text-sm font-bold font-mono text-amber-300">{c.ticker}</span>
                <span className="text-[10px] font-mono text-slate-400">{c.count} trades · {c.politicians.length} pols</span>
                {c.buyCount > c.sellCount
                  ? <span className="text-[10px] font-bold text-emerald-400">↑ {c.buyCount}B/{c.sellCount}S</span>
                  : <span className="text-[10px] font-bold text-red-400">↓ {c.buyCount}B/{c.sellCount}S</span>}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-700 font-mono">Click ticker to filter · data reflects STOCK Act disclosures only</p>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Type */}
        <div className="flex gap-1">
          {(['all', 'purchase', 'sale'] as TypeFilter[]).map((f) => (
            <button key={f} onClick={() => setTypeFilter(f)}
              className={clsx('px-2.5 py-1 rounded border text-xs font-bold uppercase tracking-wider transition-colors',
                typeFilter === f
                  ? f === 'purchase' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                    : f === 'sale' ? 'bg-red-500/15 border-red-500/30 text-red-400'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                  : 'border-slate-700/60 text-slate-600 hover:text-slate-400',
              )}>
              {f === 'purchase' ? 'Buy' : f === 'sale' ? 'Sell' : 'All'}
            </button>
          ))}
        </div>

        {/* Chamber */}
        <div className="flex gap-1">
          {(['all', 'house', 'senate'] as ChamberFilter[]).map((f) => (
            <button key={f} onClick={() => setChamberFilter(f)}
              className={clsx('px-2.5 py-1 rounded border text-xs font-medium transition-colors',
                chamberFilter === f
                  ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                  : 'border-slate-700/60 text-slate-600 hover:text-slate-400',
              )}>
              {f === 'house' ? 'House' : f === 'senate' ? 'Senate' : 'Both'}
            </button>
          ))}
        </div>

        {/* Window */}
        <div className="flex gap-1">
          {(['7d', '30d', '90d', 'all'] as WindowFilter[]).map((w) => (
            <button key={w} onClick={() => setWindow_(w)}
              className={clsx('px-2.5 py-1 rounded border text-xs font-mono transition-colors',
                window_ === w
                  ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                  : 'border-slate-700/60 text-slate-600 hover:text-slate-400',
              )}>
              {w}
            </button>
          ))}
        </div>

        {/* Notable only */}
        <button
          onClick={() => setNotableOnly((v) => !v)}
          className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-medium transition-colors',
            notableOnly
              ? 'border-amber-500/40 text-amber-300 bg-amber-500/10'
              : 'border-slate-700/60 text-slate-600 hover:text-slate-400',
          )}>
          ★ Notable only
        </button>

        {/* Search */}
        <div className="relative flex-1 min-w-[150px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ticker or politician…"
            className="w-full pl-8 pr-7 py-1.5 rounded-md border border-slate-700/60 bg-slate-900/60 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 transition-colors"
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-xs text-slate-600 font-mono">
          {filtered.length} trades · {data?.trades?.length ?? 0} total loaded
        </p>
      )}

      {/* Table */}
      <div className="rounded-lg border border-slate-800/60 bg-[#0d0d0f] overflow-hidden">
        {/* Table header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-slate-800/60 bg-[#0a0a0c] text-[10px] font-mono text-slate-600 uppercase tracking-wider">
          <span className="w-44 shrink-0">Politician</span>
          <span className="w-16 shrink-0">Ticker</span>
          <span className="w-20 shrink-0">Type</span>
          <span className="w-16 shrink-0 text-right">Amount</span>
          <span className="w-20 shrink-0 text-right hidden sm:block">Trade Date</span>
          <span className="w-16 shrink-0 text-right hidden md:block">Disclosed</span>
          <span className="flex-1 hidden lg:block">Asset</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-600 text-xs animate-pulse uppercase tracking-widest">
            Loading congressional filings…
          </div>
        ) : (data?.source === 'error' || (data?.errorType)) && !filtered.length ? (
          <div className="flex flex-col items-center justify-center gap-5 py-12 px-8 text-center">
            <Landmark className="w-10 h-10 text-slate-800" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-400">Congressional Trade Data Unavailable</p>
              <p className="text-xs text-slate-600 font-mono max-w-lg leading-relaxed">
                Free data sources for STOCK Act disclosures are currently offline. A paid API key is required.
              </p>
            </div>
            <div className="text-left space-y-2 max-w-sm">
              <p className="text-[10px] text-slate-600 uppercase tracking-wider font-mono mb-1">Available sources (paid)</p>
              <div className="space-y-1.5">
                {[
                  { name: 'Unusual Whales', env: 'UNUSUAL_WHALES_API_KEY', url: 'unusualwhales.com/pricing' },
                  { name: 'Finnhub Premium', env: 'FINNHUB_API_KEY', url: 'finnhub.io/pricing' },
                  { name: 'Financial Modeling Prep', env: 'FMP_API_KEY', url: 'financialmodelingprep.com/pricing' },
                ].map((s) => (
                  <div key={s.name} className="flex items-center gap-2 px-3 py-1.5 rounded border border-slate-800/60 bg-slate-900/40">
                    <span className="text-xs text-slate-400 font-medium w-40 shrink-0">{s.name}</span>
                    <span className="text-[10px] font-mono text-slate-600 flex-1 truncate">{s.env}=…</span>
                    <span className="text-[10px] text-slate-700 shrink-0">{s.url}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-700 font-mono pt-1">Add key to .env.local → restart server</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-600 text-xs uppercase tracking-widest">
            No trades match filters
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[560px]">
            {filtered.slice(0, 200).map((t) => <TradeRow key={t.id} trade={t} />)}
            {filtered.length > 200 && (
              <p className="px-4 py-3 text-center text-xs text-slate-700 font-mono">
                Showing 200 of {filtered.length} — narrow filters to see more
              </p>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-[10px] text-slate-700 font-mono">
        <span><span className="text-emerald-500">■</span> Purchase</span>
        <span><span className="text-red-500">■</span> Sale</span>
        <span><span className="text-blue-500">●</span> Democrat</span>
        <span><span className="text-red-500">●</span> Republican</span>
        <span><span className="text-purple-400">SEN</span> Senate</span>
        <span><span className="text-sky-400">HSE</span> House</span>
        <span><span className="text-amber-400">★</span> High-profile</span>
        <span className="text-slate-800">· Data: Finnhub · STOCK Act disclosures</span>
      </div>
    </div>
  );
}
