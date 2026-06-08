'use client';

import { useMemo, useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, Lock, Unlock, Globe, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { clsx } from 'clsx';
import type { MacroMetric, Currency } from '@/lib/types';

// ── CB meeting dates (announcement day) ─────────────────────────────────────

const CB_MEETINGS: Record<Currency, string[]> = {
  USD: [
    '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18',
    '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
    '2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17',
    '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
  ],
  EUR: ['2026-04-17', '2026-06-05', '2026-07-24', '2026-09-10', '2026-10-29', '2026-12-17'],
  GBP: ['2026-05-07', '2026-06-19', '2026-08-06', '2026-09-17', '2026-11-05', '2026-12-17'],
  JPY: ['2026-04-30', '2026-06-16', '2026-07-30', '2026-09-18', '2026-10-29', '2026-12-18'],
  CAD: ['2026-04-16', '2026-06-04', '2026-07-15', '2026-09-09', '2026-10-28', '2026-12-09'],
  AUD: ['2026-05-19', '2026-07-07', '2026-08-04', '2026-09-01', '2026-10-06', '2026-11-03'],
};

const CB_NAME: Record<Currency, string> = {
  USD: 'Federal Reserve',
  EUR: 'European Central Bank',
  GBP: 'Bank of England',
  JPY: 'Bank of Japan',
  CAD: 'Bank of Canada',
  AUD: 'Reserve Bank of Australia',
};

// ── Stance config ────────────────────────────────────────────────────────────

type Stance = 'hawkish' | 'slightly_hawkish' | 'neutral' | 'slightly_dovish' | 'dovish';

const STANCE_CONFIG: Record<Stance, {
  label: string; short: string;
  color: string; bg: string; border: string; gradFrom: string;
}> = {
  hawkish:          { label: 'Hawkish',         short: 'HAWK',   color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.25)',  gradFrom: 'rgba(239,68,68,0.12)' },
  slightly_hawkish: { label: 'Slightly Hawkish', short: 'S.HAWK', color: '#f97316', bg: 'rgba(249,115,22,0.08)',  border: 'rgba(249,115,22,0.25)', gradFrom: 'rgba(249,115,22,0.12)' },
  neutral:          { label: 'Neutral',          short: 'NEUT',   color: '#64748b', bg: 'rgba(100,116,139,0.06)', border: 'rgba(100,116,139,0.2)', gradFrom: 'rgba(100,116,139,0.08)' },
  slightly_dovish:  { label: 'Slightly Dovish',  short: 'S.DOVE', color: '#22d3ee', bg: 'rgba(34,211,238,0.08)',  border: 'rgba(34,211,238,0.25)', gradFrom: 'rgba(34,211,238,0.12)' },
  dovish:           { label: 'Dovish',           short: 'DOVE',   color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)', gradFrom: 'rgba(59,130,246,0.12)' },
};

const STANCES: Stance[] = ['hawkish', 'slightly_hawkish', 'neutral', 'slightly_dovish', 'dovish'];

const STANCE_SCORE: Record<Stance, number> = {
  hawkish: 2, slightly_hawkish: 1, neutral: 0, slightly_dovish: -1, dovish: -2,
};

// ── Auto-inference ───────────────────────────────────────────────────────────

function inferStance(metric: MacroMetric): { stance: Stance; score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  if (metric.interestRate.trend === 'up') {
    score += 2;
    signals.push('Rate trend ↑ (hiking cycle)');
  } else if (metric.interestRate.trend === 'down') {
    score -= 2;
    signals.push('Rate trend ↓ (cutting cycle)');
  } else {
    signals.push('Rate trend → (on hold)');
  }

  const cpi = parseFloat(metric.inflation.value);
  if (!isNaN(cpi)) {
    if (cpi > 4) {
      score += 2;
      signals.push(`CPI ${cpi.toFixed(1)}% — well above 2% target`);
    } else if (cpi > 3) {
      score += 1;
      signals.push(`CPI ${cpi.toFixed(1)}% — above 2% target`);
    } else if (cpi > 2.5) {
      score += 0.5;
      signals.push(`CPI ${cpi.toFixed(1)}% — slightly above target`);
    } else if (cpi < 0.5) {
      score -= 2;
      signals.push(`CPI ${cpi.toFixed(1)}% — well below 2% target`);
    } else if (cpi < 1.5) {
      score -= 1;
      signals.push(`CPI ${cpi.toFixed(1)}% — below 2% target`);
    } else if (cpi < 2) {
      score -= 0.5;
      signals.push(`CPI ${cpi.toFixed(1)}% — approaching target`);
    } else {
      signals.push(`CPI ${cpi.toFixed(1)}% — at 2% target`);
    }
  }

  let stance: Stance;
  if      (score >= 3)  stance = 'hawkish';
  else if (score >= 1)  stance = 'slightly_hawkish';
  else if (score > -1)  stance = 'neutral';
  else if (score >= -3) stance = 'slightly_dovish';
  else                  stance = 'dovish';

  return { stance, score, signals };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getNextMeeting(currency: Currency): { date: string; daysAway: number } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const d of (CB_MEETINGS[currency] ?? [])) {
    const dt = new Date(d + 'T12:00:00Z');
    dt.setHours(0, 0, 0, 0);
    const diff = Math.round((dt.getTime() - today.getTime()) / 86_400_000);
    if (diff >= 0) return { date: d, daysAway: diff };
  }
  return null;
}

function fmtMeetingDate(ds: string): string {
  return new Date(ds + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}

// ── LocalStorage ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'mpd_overrides_v1';
type Overrides = Partial<Record<Currency, Stance>>;

function loadOverrides(): Overrides {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}
function saveOverrides(o: Overrides) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(o)); } catch {}
}

// ── Global Bias Bar ──────────────────────────────────────────────────────────

function GlobalBiasBar({ stances }: { stances: { currency: Currency; stance: Stance }[] }) {
  if (stances.length === 0) return null;

  const total = stances.length;
  const counts = { hawk: 0, neut: 0, dove: 0 };
  let avgScore = 0;

  for (const { stance } of stances) {
    const s = STANCE_SCORE[stance];
    avgScore += s;
    if (s > 0) counts.hawk++;
    else if (s < 0) counts.dove++;
    else counts.neut++;
  }
  avgScore /= total;

  const hawkPct = (counts.hawk / total) * 100;
  const neutPct = (counts.neut / total) * 100;
  const dovePct = (counts.dove / total) * 100;

  let biasLabel: string;
  let biasColor: string;
  if      (avgScore >  0.8) { biasLabel = 'Net Hawkish';      biasColor = '#ef4444'; }
  else if (avgScore >  0.2) { biasLabel = 'Slightly Hawkish'; biasColor = '#f97316'; }
  else if (avgScore < -0.8) { biasLabel = 'Net Dovish';       biasColor = '#3b82f6'; }
  else if (avgScore < -0.2) { biasLabel = 'Slightly Dovish';  biasColor = '#22d3ee'; }
  else                      { biasLabel = 'Neutral';           biasColor = '#64748b'; }

  const usdScore  = STANCE_SCORE[stances.find(s => s.currency === 'USD')?.stance ?? 'neutral'];
  const peerScore = stances.filter(s => s.currency !== 'USD').reduce((a, s) => a + STANCE_SCORE[s.stance], 0)
                  / Math.max(stances.filter(s => s.currency !== 'USD').length, 1);
  const diverge   = usdScore - peerScore;

  return (
    <div className="rounded-lg border border-slate-800/60 bg-[#0d0d0f] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Globe className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Global Policy Bias</span>
        </div>
        <span className="text-base font-bold font-mono" style={{ color: biasColor }}>{biasLabel}</span>
      </div>

      {/* Stacked bar */}
      <div className="h-4 rounded-full overflow-hidden flex gap-px bg-slate-900">
        <div className="h-full rounded-l-full transition-all duration-500"
          style={{ width: `${hawkPct}%`, background: 'linear-gradient(90deg,#ef4444,#f97316)' }} />
        <div className="h-full transition-all duration-500"
          style={{ width: `${neutPct}%`, background: '#1e293b' }} />
        <div className="h-full rounded-r-full transition-all duration-500"
          style={{ width: `${dovePct}%`, background: 'linear-gradient(90deg,#22d3ee,#3b82f6)' }} />
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-5">
          {[
            { label: 'Hawkish', n: counts.hawk, color: '#ef4444' },
            { label: 'Neutral', n: counts.neut, color: '#334155' },
            { label: 'Dovish',  n: counts.dove, color: '#3b82f6' },
          ].map(({ label, n, color }) => (
            <span key={label} className="flex items-center gap-2 text-xs font-mono">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} />
              <span className="text-slate-400">{label} ({n})</span>
            </span>
          ))}
        </div>
        <span className="text-xs font-mono text-slate-600">avg {avgScore >= 0 ? '+' : ''}{avgScore.toFixed(2)}</span>
      </div>

      {/* USD divergence signal */}
      {Math.abs(diverge) >= 0.5 && (
        <p className="text-xs font-mono text-slate-500 pt-2 border-t border-slate-800/40">
          {diverge > 0
            ? '💵 USD more hawkish than G5 peers → DXY strength bias'
            : '💵 USD more dovish than G5 peers → DXY weakness bias'}
        </p>
      )}
    </div>
  );
}

// ── Currency Policy Card ─────────────────────────────────────────────────────

function CurrencyPolicyCard({
  metric, autoStance, signals, override, onSetOverride, onClearOverride,
}: {
  metric: MacroMetric;
  autoStance: Stance;
  signals: string[];
  override: Stance | undefined;
  onSetOverride: (s: Stance) => void;
  onClearOverride: () => void;
}) {
  const [showSignals, setShowSignals] = useState(false);
  const isManual     = override !== undefined;
  const activeStance = override ?? autoStance;
  const cfg          = STANCE_CONFIG[activeStance];
  const next         = getNextMeeting(metric.id as Currency);

  return (
    <div className="rounded-lg overflow-hidden transition-all duration-200"
      style={{ border: `1px solid ${cfg.border}`, background: '#0d0d0f' }}>

      {/* Header band */}
      <div className="flex items-center justify-between px-4 py-3"
        style={{ background: cfg.gradFrom, borderBottom: `1px solid ${cfg.border}` }}>
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-3xl leading-none shrink-0">{metric.flag}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-100 leading-tight">{metric.id}</p>
            <p className="text-xs text-slate-500 font-mono mt-0.5 leading-none truncate">{CB_NAME[metric.id as Currency]}</p>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => isManual && onClearOverride()}
            title={isManual ? 'Manual — click to restore auto' : 'Auto-inferred from FRED data'}
            className={clsx(
              'flex items-center gap-1 px-2 py-1 rounded text-xs font-mono font-bold uppercase tracking-wide',
              isManual
                ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300 cursor-pointer hover:bg-amber-500/30'
                : 'bg-slate-800/60 border border-slate-700/30 text-slate-600 cursor-default',
            )}
          >
            {isManual ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            {isManual ? 'MAN' : 'AUTO'}
          </button>
          <span className="px-2.5 py-1 rounded text-xs font-bold font-mono uppercase tracking-wider"
            style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}>
            {cfg.short}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/40">
        {/* Rate */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-600 font-mono uppercase">Rate</span>
          <span className="text-sm font-mono font-bold text-slate-200">{metric.interestRate.value}%</span>
          {metric.interestRate.trend === 'up'   && <TrendingUp   className="w-4 h-4 text-red-400 shrink-0"  />}
          {metric.interestRate.trend === 'down' && <TrendingDown className="w-4 h-4 text-cyan-400 shrink-0" />}
          {metric.interestRate.trend === 'flat' && <Minus        className="w-4 h-4 text-slate-700 shrink-0"/>}
        </div>
        <div className="w-px h-4 bg-slate-800 shrink-0" />
        {/* CPI */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-600 font-mono uppercase">CPI</span>
          <span className="text-sm font-mono font-bold text-slate-200">{metric.inflation.value}%</span>
        </div>
        {/* Next meeting — pushed right */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-slate-600 font-mono uppercase">Next</span>
          {next ? (
            <span className={clsx(
              'text-sm font-mono font-bold',
              next.daysAway === 0 ? 'text-amber-400 animate-pulse'
              : next.daysAway <= 7 ? 'text-amber-500'
              : 'text-slate-500'
            )} title={fmtMeetingDate(next.date)}>
              {next.daysAway === 0 ? 'TODAY' : `${next.daysAway}d`}
            </span>
          ) : (
            <span className="text-xs text-slate-700 font-mono">—</span>
          )}
        </div>
      </div>

      {/* Stance picker */}
      <div className="px-4 py-3 space-y-3">
        <div className="flex gap-1.5">
          {STANCES.map((s) => {
            const sc       = STANCE_CONFIG[s];
            const isActive = activeStance === s;
            return (
              <button
                key={s}
                onClick={() => s === autoStance ? onClearOverride() : onSetOverride(s)}
                title={sc.label + (s === autoStance ? ' (auto)' : '')}
                className="flex-1 py-1.5 rounded text-xs font-mono font-bold uppercase tracking-wide transition-all duration-150"
                style={{
                  color:      isActive ? sc.color : '#475569',
                  background: isActive ? sc.bg : 'transparent',
                  border:     `1px solid ${isActive ? sc.border : '#1e293b'}`,
                }}
              >
                {sc.short}
              </button>
            );
          })}
        </div>

        {/* Signals expander */}
        <button
          onClick={() => setShowSignals(v => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 font-mono transition-colors"
        >
          {showSignals ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          signals
        </button>
        {showSignals && (
          <div className="space-y-1 pb-0.5">
            {signals.map((sig, i) => (
              <p key={i} className="text-xs font-mono text-slate-500">· {sig}</p>
            ))}
            {isManual && autoStance !== activeStance && (
              <p className="text-xs font-mono text-amber-600 mt-1">
                ⚡ Auto would be: {STANCE_CONFIG[autoStance].label}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────────────────

export default function MonetaryPolicyDirector({ metrics }: { metrics: MacroMetric[] }) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [mounted,   setMounted]   = useState(false);

  useEffect(() => {
    setOverrides(loadOverrides());
    setMounted(true);
  }, []);

  const inferences = useMemo(
    () => metrics.map(m => ({ metric: m, ...inferStance(m) })),
    [metrics],
  );

  const stanceSummary = useMemo(
    () => inferences.map(({ metric, stance }) => ({
      currency: metric.id as Currency,
      stance:   overrides[metric.id as Currency] ?? stance,
    })),
    [inferences, overrides],
  );

  function setOverride(currency: Currency, stance: Stance) {
    const next = { ...overrides, [currency]: stance };
    setOverrides(next);
    saveOverrides(next);
  }

  function clearOverride(currency: Currency) {
    const next = { ...overrides };
    delete next[currency];
    setOverrides(next);
    saveOverrides(next);
  }

  function resetAll() {
    setOverrides({});
    saveOverrides({});
  }

  if (!mounted || metrics.length === 0) return null;

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="space-y-4">
      {/* Section divider */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-slate-800/60" />
        <span className="text-xs text-slate-600 uppercase tracking-widest font-mono">Monetary Policy Director</span>
        <div className="h-px flex-1 bg-slate-800/60" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Central Bank Stances</h3>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Auto-inferred from FRED · manual override · next meeting countdown
          </p>
        </div>
        {hasOverrides && (
          <button
            onClick={resetAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-mono text-slate-500 border border-slate-800/60 hover:text-amber-300 hover:border-amber-500/30 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset all
          </button>
        )}
      </div>

      {/* Global bias */}
      <GlobalBiasBar stances={stanceSummary} />

      {/* Currency grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {inferences.map(({ metric, stance, signals }) => (
          <CurrencyPolicyCard
            key={metric.id}
            metric={metric}
            autoStance={stance}
            signals={signals}
            override={overrides[metric.id as Currency]}
            onSetOverride={(s) => setOverride(metric.id as Currency, s)}
            onClearOverride={() => clearOverride(metric.id as Currency)}
          />
        ))}
      </div>

      <p className="text-xs text-slate-700 text-center font-mono">
        Stance derived from rate trend + CPI vs 2% target · Overrides saved to localStorage
      </p>
    </div>
  );
}
