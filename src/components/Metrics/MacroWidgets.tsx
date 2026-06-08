'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ComposedChart,
} from 'recharts';
import { clsx } from 'clsx';
import type { FearGreedData } from '@/app/api/macro/feargreed/route';
import type { YieldCurveData } from '@/app/api/macro/yieldcurve/route';
import type { FedWatchData }   from '@/app/api/macro/fedwatch/route';
import type { DixData, DixRow } from '@/app/api/macro/dix/route';

// ── FOMC hardcoded dates (announcement day = 2nd day of each meeting) ────────

const FOMC_DATES = [
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18',
  '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
  '2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
];

function getTodayET(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

function fmtDate(ds: string): string {
  const d = new Date(ds + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function dte(ds: string): number {
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const dateMs  = new Date(ds + 'T12:00:00Z').setHours(0, 0, 0, 0);
  return Math.round((dateMs - todayMs) / 86_400_000);
}

// ── Fear & Greed ─────────────────────────────────────────────────────────────

const FG_ZONES = [
  { max: 25,  label: 'Extreme Fear', color: '#ef4444' },
  { max: 45,  label: 'Fear',         color: '#f97316' },
  { max: 55,  label: 'Neutral',      color: '#eab308' },
  { max: 75,  label: 'Greed',        color: '#84cc16' },
  { max: 100, label: 'Extreme Greed',color: '#22c55e' },
];

function fgColor(score: number): string {
  return FG_ZONES.find((z) => score <= z.max)?.color ?? '#22c55e';
}
function fgLabel(score: number): string {
  return FG_ZONES.find((z) => score <= z.max)?.label ?? 'Extreme Greed';
}

function ScoreChange({ label, current, prev }: { label: string; current: number; prev: number }) {
  const diff  = current - prev;
  const color = diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-slate-600';
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] text-slate-600 font-mono uppercase">{label}</span>
      <span className="text-[10px] font-mono font-bold text-slate-400">{prev}</span>
      <span className={clsx('text-[9px] font-mono', color)}>{diff >= 0 ? '+' : ''}{diff}</span>
    </div>
  );
}

export function FearGreedWidget() {
  const [data, setData] = useState<FearGreedData | null>(null);
  const [err,  setErr]  = useState(false);

  useEffect(() => {
    fetch('/api/macro/feargreed')
      .then((r) => r.json())
      .then((j) => { if (j.error) setErr(true); else setData(j); })
      .catch(() => setErr(true));
  }, []);

  if (err) return (
    <WidgetShell title="Fear & Greed" source="alternative.me">
      <div className="flex items-center justify-center h-24 text-slate-600 text-xs">Unavailable</div>
    </WidgetShell>
  );
  if (!data) return <WidgetShell title="Fear & Greed" source="alternative.me"><WidgetSkeleton h={120} /></WidgetShell>;

  const color  = fgColor(data.score);
  const pct    = data.score;

  return (
    <WidgetShell title="Fear & Greed" source="alternative.me · Crypto Sentiment">
      <div className="flex items-center gap-4">
        {/* Score */}
        <div className="flex flex-col items-center shrink-0">
          <span className="text-4xl font-bold font-mono tabular-nums leading-none" style={{ color }}>
            {data.score}
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wider mt-1" style={{ color }}>
            {fgLabel(data.score)}
          </span>
        </div>

        {/* Gauge bar + comparisons */}
        <div className="flex-1 min-w-0 space-y-2.5">
          {/* Gauge */}
          <div className="relative">
            <div className="h-2.5 rounded-full w-full overflow-hidden" style={{
              background: 'linear-gradient(to right, #ef4444 0%, #f97316 25%, #eab308 45%, #84cc16 65%, #22c55e 100%)',
            }}>
              <div
                className="absolute top-0 w-2 h-2.5 rounded-sm bg-white shadow-md shadow-black/50 -translate-x-1/2"
                style={{ left: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between mt-0.5 text-[8px] text-slate-700 font-mono">
              <span>Ext. Fear</span><span>Fear</span><span>Neutral</span><span>Greed</span><span>Ext. Greed</span>
            </div>
          </div>

          {/* History */}
          <div className="flex justify-around">
            <ScoreChange label="1W ago"  current={data.score} prev={data.prev1w.score} />
            <ScoreChange label="1M ago"  current={data.score} prev={data.prev1m.score} />
            <ScoreChange label="1Y ago"  current={data.score} prev={data.prev1y.score} />
          </div>
        </div>
      </div>
    </WidgetShell>
  );
}

// ── FOMC Calendar ─────────────────────────────────────────────────────────────

export function FOMCWidget({ currentRate }: { currentRate: number | null }) {
  const today   = getTodayET();
  const upcoming = FOMC_DATES.map((d) => ({ date: d, daysAway: dte(d) }))
    .filter((m) => m.daysAway >= -1)
    .slice(0, 6);

  const next = upcoming[0];
  const isToday = next?.daysAway === 0;

  return (
    <WidgetShell title="FOMC Calendar" source="Federal Reserve · 2025–2026">
      <div className="flex gap-4">
        {/* Next meeting highlight */}
        <div className="shrink-0 flex flex-col items-center justify-center bg-[#0a0a0c] border border-slate-800/60 rounded-lg px-4 py-3 text-center">
          <span className="text-[9px] text-slate-600 uppercase tracking-wider font-mono">Next meeting</span>
          {next ? (
            <>
              <span className={clsx('text-3xl font-bold font-mono leading-none mt-1', isToday ? 'text-amber-400 animate-pulse' : 'text-slate-100')}>
                {isToday ? 'TODAY' : `${next.daysAway}d`}
              </span>
              <span className="text-[10px] text-slate-500 font-mono mt-1">{fmtDate(next.date)}</span>
            </>
          ) : <span className="text-slate-600 text-xs mt-1">—</span>}
          {currentRate !== null && (
            <div className="mt-2 pt-2 border-t border-slate-800/60 w-full">
              <span className="text-[9px] text-slate-600 uppercase font-mono">FF Rate</span>
              <p className="text-sm font-bold font-mono text-amber-300">{currentRate.toFixed(2)}%</p>
            </div>
          )}
        </div>

        {/* Meeting list */}
        <div className="flex-1 min-w-0 flex flex-col gap-0.5 overflow-y-auto max-h-32">
          {upcoming.map(({ date, daysAway }) => {
            const isNext  = date === next?.date;
            const isPast  = daysAway < 0;
            const isToday = daysAway === 0;
            return (
              <div key={date} className={clsx(
                'flex items-center justify-between px-2 py-1 rounded text-[10px] font-mono',
                isNext  ? 'bg-amber-500/10 border border-amber-500/20' : 'border border-transparent',
                isPast  && 'opacity-40',
              )}>
                <span className={clsx(isNext ? 'text-amber-300' : 'text-slate-400')}>{fmtDate(date)}</span>
                <span className={clsx(
                  'font-bold',
                  isToday ? 'text-amber-400' : daysAway <= 14 ? 'text-amber-500/80' : 'text-slate-600',
                )}>
                  {isToday ? 'TODAY' : `${daysAway}d`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </WidgetShell>
  );
}

// ── Yield Curve ───────────────────────────────────────────────────────────────

function YCTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { label: string; value: number } }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#0d0d0f] border border-slate-700/60 rounded px-2.5 py-1.5 text-xs shadow-xl">
      <span className="text-slate-400 font-mono">{d.label} </span>
      <span className="text-amber-300 font-mono font-bold">{d.value.toFixed(2)}%</span>
    </div>
  );
}

export function YieldCurveWidget() {
  const [data, setData] = useState<YieldCurveData | null>(null);
  const [err,  setErr]  = useState(false);

  useEffect(() => {
    fetch('/api/macro/yieldcurve')
      .then((r) => r.json())
      .then((j) => { if (j.error) setErr(true); else setData(j); })
      .catch(() => setErr(true));
  }, []);

  if (err) return (
    <WidgetShell title="Yield Curve" source="FRED · U.S. Treasuries">
      <div className="flex items-center justify-center h-32 text-slate-600 text-xs">Unavailable</div>
    </WidgetShell>
  );
  if (!data) return <WidgetShell title="Yield Curve" source="FRED · U.S. Treasuries"><WidgetSkeleton h={160} /></WidgetShell>;

  const lineColor = data.inverted ? '#ef4444' : '#22d3ee';

  return (
    <WidgetShell title="Yield Curve" source="FRED · U.S. Treasuries" fullWidth>
      <div className="flex items-center gap-4 mb-2">
        <div className="flex items-center gap-2">
          {data.inverted && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono bg-red-500/15 border border-red-500/40 text-red-400">
              ⚠ INVERTED
            </span>
          )}
          {data.spread2_10 !== null && (
            <span className="text-xs font-mono text-slate-400">
              2Y–10Y spread: <span className={clsx('font-bold', data.inverted ? 'text-red-400' : 'text-emerald-400')}>
                {data.spread2_10 >= 0 ? '+' : ''}{data.spread2_10}%
              </span>
            </span>
          )}
        </div>
        <span className="ml-auto text-[10px] text-slate-700 font-mono">
          {new Date(data.fetchedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })} ET
        </span>
      </div>
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={data.curve} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#475569' }} axisLine={false} tickLine={false} />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fontSize: 10, fill: '#475569' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          />
          <Tooltip content={<YCTooltip />} cursor={{ stroke: '#334155', strokeDasharray: '3 3' }} />
          <ReferenceLine y={0} stroke="#334155" strokeWidth={1} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={lineColor}
            strokeWidth={2}
            dot={{ fill: lineColor, r: 3 }}
            activeDot={{ r: 4, fill: lineColor }}
          />
        </LineChart>
      </ResponsiveContainer>
    </WidgetShell>
  );
}

// ── FedWatch ──────────────────────────────────────────────────────────────────

function ProbBar({ rate, prob, currentRate }: { rate: number; prob: number; currentRate: number | null }) {
  const diff  = currentRate !== null ? Math.round((rate - currentRate) * 100) : 0;
  const isHold = diff === 0;
  const isCut  = diff < 0;
  const color  = isHold ? '#64748b' : isCut ? '#22d3ee' : '#f97316';
  const label  = isHold ? 'Hold' : isCut ? `Cut ${Math.abs(diff)}bp` : `Hike ${diff}bp`;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-mono text-slate-500 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-800/60 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${prob}%`, background: color }} />
      </div>
      <span className="text-[10px] font-mono font-bold w-10 text-right" style={{ color }}>{prob.toFixed(0)}%</span>
    </div>
  );
}

export function FedWatchWidget() {
  const [data, setData] = useState<FedWatchData | null>(null);
  const [err,  setErr]  = useState(false);

  useEffect(() => {
    fetch('/api/macro/fedwatch')
      .then((r) => r.json())
      .then((j) => { if (j.error && !j.currentRate) setErr(true); else setData(j); })
      .catch(() => setErr(true));
  }, []);

  if (err) return (
    <WidgetShell title="CME FedWatch" source="Rate cut probabilities">
      <div className="flex items-center justify-center h-24 text-slate-600 text-xs">Unavailable</div>
    </WidgetShell>
  );
  if (!data) return <WidgetShell title="CME FedWatch" source="Rate cut probabilities"><WidgetSkeleton h={120} /></WidgetShell>;

  const hasCME = data.source === 'cme' && data.meetings.length > 0;

  return (
    <WidgetShell title="CME FedWatch" source="Rate cut probabilities · next meetings">
      {hasCME ? (
        <div className="space-y-4">
          {data.meetings.slice(0, 3).map((m) => (
            <div key={m.date}>
              <p className="text-[10px] text-slate-500 font-mono mb-1.5">{fmtDate(m.date)}</p>
              <div className="space-y-1">
                {m.probs
                  .filter((p) => p.prob >= 1)
                  .sort((a, b) => b.prob - a.prob)
                  .map((p) => (
                    <ProbBar key={p.rate} rate={p.rate} prob={p.prob} currentRate={data.currentRate} />
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-6 py-2">
          {data.currentRate !== null && (
            <div className="flex flex-col items-center shrink-0 bg-[#0a0a0c] border border-slate-800/60 rounded-lg px-5 py-3">
              <span className="text-[9px] text-slate-600 uppercase tracking-wider font-mono">FF Target Rate</span>
              <span className="text-3xl font-bold font-mono tabular-nums text-amber-300 leading-none mt-1">
                {data.currentRate.toFixed(2)}%
              </span>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs text-slate-600 font-mono">Probability data unavailable</p>
            <p className="text-[10px] text-slate-700 font-mono">CME blocks server-side requests</p>
            <a
              href="https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-amber-500/60 hover:text-amber-400 font-mono underline"
            >
              View CME FedWatch →
            </a>
          </div>
        </div>
      )}
    </WidgetShell>
  );
}

// ── DIX / GEX ─────────────────────────────────────────────────────────────────

const DIX_THRESHOLD = 0.45;
const DIX_WINDOWS = { '6M': 120, '2Y': 480, 'MAX': 0 } as const;
type DixWin = keyof typeof DIX_WINDOWS;

// Bloomberg palette
const BLM = {
  amber:    '#ffb300',
  amberDim: '#1a1200',
  slate:    '#1e2d3d',
  cyan:     '#00d4d8',
  red:      '#ff3b3b',
  spx:      '#4a5568',
  grid:     '#1a2233',
  axis:     '#4a5568',
  axisSpx:  '#2d3748',
} as const;

function fmtGexAxis(v: number) {
  const b = v / 1e9;
  return `${b.toFixed(0)}b`;
}

function fmtDixDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

function DixTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const dix = payload.find((p) => p.name === 'dix');
  const gex = payload.find((p) => p.name === 'gex');
  const spx = payload.find((p) => p.name === 'price');
  return (
    <div className="bg-[#070a0e] border border-[#1e2d3d] rounded px-3 py-2 text-[10px] font-mono shadow-2xl space-y-1">
      <p className="text-[#4a5568] tracking-wider">{label}</p>
      {spx && <p><span className="text-[#4a5568]">SPX  </span><span className="text-[#e2e8f0] font-bold">{spx.value.toFixed(0)}</span></p>}
      {dix && <p><span className="text-[#4a5568]">DIX  </span><span className="font-bold" style={{ color: (dix.value ?? 0) >= DIX_THRESHOLD ? BLM.amber : '#64748b' }}>{((dix.value ?? 0) * 100).toFixed(1)}%</span></p>}
      {gex && <p><span className="text-[#4a5568]">GEX  </span><span className="font-bold" style={{ color: (gex.value ?? 0) >= 0 ? BLM.cyan : BLM.red }}>{fmtGexAxis(gex.value ?? 0)}</span></p>}
    </div>
  );
}

export function DixGexWidget() {
  const [data,      setData]      = useState<DixRow[] | null>(null);
  const [err,       setErr]       = useState(false);
  const [win,       setWin]       = useState<DixWin>('2Y');
  const [fetchedAt, setFetchedAt] = useState('');

  useEffect(() => {
    fetch('/api/macro/dix')
      .then((r) => r.json())
      .then((j: DixData & { error?: string }) => {
        if (j.error) setErr(true);
        else { setData(j.rows); setFetchedAt(j.fetchedAt); }
      })
      .catch(() => setErr(true));
  }, []);

  const sliced = useMemo(() => {
    if (!data) return [];
    const n = DIX_WINDOWS[win];
    return n === 0 ? data : data.slice(-n);
  }, [data, win]);

  const tickInterval = useMemo(() => {
    if (sliced.length <= 120) return Math.floor(sliced.length / 5);
    if (sliced.length <= 480) return Math.floor(sliced.length / 7);
    return Math.floor(sliced.length / 10);
  }, [sliced.length]);

  if (err) return (
    <WidgetShell title="DIX / GEX" source="squeezemetrics.com" fullWidth>
      <div className="flex items-center justify-center h-24 text-slate-600 text-xs">Unavailable</div>
    </WidgetShell>
  );
  if (!data) return (
    <WidgetShell title="DIX / GEX" source="squeezemetrics.com" fullWidth>
      <WidgetSkeleton h={520} />
    </WidgetShell>
  );

  const chartMargin = { top: 6, right: 52, left: 4, bottom: 0 };

  return (
    <WidgetShell title="DIX / GEX" source="squeezemetrics.com · Dark Index + Gamma Exposure" fullWidth>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1.5">
          {(Object.keys(DIX_WINDOWS) as DixWin[]).map((w) => (
            <button
              key={w}
              onClick={() => setWin(w)}
              className={clsx(
                'px-3 py-1 rounded text-[10px] font-mono font-bold tracking-widest transition-colors',
                win === w
                  ? 'bg-amber-500/15 border border-amber-500/50 text-amber-300'
                  : 'bg-[#0a0e14] border border-[#1e2d3d] text-[#4a5568] hover:text-slate-400 hover:border-slate-600',
              )}
            >{w}</button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-[9px] font-mono">
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: BLM.amber }} />DIX ≥ 45%</span>
          <span className="flex items-center gap-1.5 text-[#334155]"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#1e2d3d]" />DIX &lt; 45%</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: BLM.cyan }} />GEX +</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: BLM.red }} />GEX −</span>
          {fetchedAt && <span className="text-[#1e2d3d]">· {new Date(fetchedAt).toLocaleDateString()}</span>}
        </div>
      </div>

      {/* DIX chart */}
      <p className="text-[9px] font-mono uppercase tracking-widest mb-1.5 ml-1" style={{ color: BLM.amber }}>Dark Index (DIX)</p>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={sliced} margin={chartMargin} barCategoryGap="0%">
          <XAxis
            dataKey="date"
            tickFormatter={fmtDixDate}
            interval={tickInterval}
            tick={{ fontSize: 9, fill: BLM.axis, fontFamily: 'monospace' }}
            axisLine={{ stroke: BLM.grid }}
            tickLine={false}
          />
          <YAxis
            yAxisId="dix"
            domain={[0.33, 0.57]}
            tick={{ fontSize: 9, fill: BLM.axis, fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            width={32}
          />
          <YAxis
            yAxisId="price"
            orientation="right"
            domain={['auto', 'auto']}
            tick={{ fontSize: 9, fill: BLM.axisSpx, fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
            width={40}
          />
          <Tooltip content={<DixTooltip />} cursor={{ fill: 'rgba(255,255,255,0.025)' }} />
          <ReferenceLine yAxisId="dix" y={DIX_THRESHOLD} stroke={BLM.amber} strokeDasharray="4 4" strokeWidth={1} strokeOpacity={0.4} />
          <Bar yAxisId="dix" dataKey="dix" maxBarSize={8}>
            {sliced.map((row, i) => (
              <Cell key={i} fill={row.dix >= DIX_THRESHOLD ? BLM.amber : BLM.slate} fillOpacity={row.dix >= DIX_THRESHOLD ? 0.9 : 0.6} />
            ))}
          </Bar>
          <Line yAxisId="price" type="monotone" dataKey="price" stroke={BLM.spx} strokeWidth={1.5} dot={false} strokeOpacity={0.6} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* GEX chart */}
      <p className="text-[9px] font-mono uppercase tracking-widest mt-5 mb-1.5 ml-1" style={{ color: BLM.cyan }}>Gamma Exposure (GEX)</p>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={sliced} margin={chartMargin} barCategoryGap="0%">
          <XAxis
            dataKey="date"
            tickFormatter={fmtDixDate}
            interval={tickInterval}
            tick={{ fontSize: 9, fill: BLM.axis, fontFamily: 'monospace' }}
            axisLine={{ stroke: BLM.grid }}
            tickLine={false}
          />
          <YAxis
            yAxisId="gex"
            domain={['auto', 'auto']}
            tick={{ fontSize: 9, fill: BLM.axis, fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={fmtGexAxis}
            width={32}
          />
          <YAxis
            yAxisId="price"
            orientation="right"
            domain={['auto', 'auto']}
            tick={{ fontSize: 9, fill: BLM.axisSpx, fontFamily: 'monospace' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v)}
            width={40}
          />
          <Tooltip content={<DixTooltip />} cursor={{ fill: 'rgba(255,255,255,0.025)' }} />
          <ReferenceLine yAxisId="gex" y={0} stroke={BLM.grid} strokeWidth={1.5} />
          <Bar yAxisId="gex" dataKey="gex" maxBarSize={8}>
            {sliced.map((row, i) => (
              <Cell key={i} fill={row.gex >= 0 ? BLM.cyan : BLM.red} fillOpacity={0.85} />
            ))}
          </Bar>
          <Line yAxisId="price" type="monotone" dataKey="price" stroke={BLM.spx} strokeWidth={1.5} dot={false} strokeOpacity={0.6} />
        </ComposedChart>
      </ResponsiveContainer>
    </WidgetShell>
  );
}

// ── Shell + Skeleton helpers ──────────────────────────────────────────────────

function WidgetShell({ title, source, fullWidth, children }: {
  title: string;
  source?: string;
  fullWidth?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={clsx('rounded-lg border border-slate-800/60 bg-[#111113] overflow-hidden', fullWidth && 'col-span-full')}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60 bg-[#0d0d0f]">
        <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">{title}</span>
        {source && <span className="text-[10px] text-slate-700 font-mono hidden sm:inline">{source}</span>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function WidgetSkeleton({ h }: { h: number }) {
  return <div className="animate-pulse bg-slate-800/40 rounded-md" style={{ height: h }} />;
}

// ── Combined export ───────────────────────────────────────────────────────────

export default function MacroWidgets() {
  const [fedData, setFedData] = useState<FedWatchData | null>(null);

  useEffect(() => {
    fetch('/api/macro/fedwatch')
      .then((r) => r.json())
      .then((j) => setFedData(j))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-4">
      {/* Divider */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-slate-800/60" />
        <span className="text-[10px] text-slate-700 uppercase tracking-widest font-mono">Market Intelligence</span>
        <div className="h-px flex-1 bg-slate-800/60" />
      </div>

      {/* Row 1: F&G + FOMC */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FearGreedWidget />
        <FOMCWidget currentRate={fedData?.currentRate ?? null} />
      </div>

      {/* Row 2: Yield Curve full width */}
      <YieldCurveWidget />

      {/* Row 3: FedWatch full width */}
      <FedWatchWidget />
    </div>
  );
}
