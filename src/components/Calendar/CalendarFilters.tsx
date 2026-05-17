'use client';

import { clsx } from 'clsx';
import { X } from 'lucide-react';
import type { CalendarFilters, Currency, DateFilter, Impact } from '@/lib/types';

const CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];
const IMPACTS: { value: Impact; label: string; dots: string }[] = [
  { value: 'high',    label: 'High',    dots: '●●●' },
  { value: 'medium',  label: 'Med',     dots: '●●○' },
  { value: 'low',     label: 'Low',     dots: '●○○' },
  { value: 'holiday', label: 'Holiday', dots: '—'   },
];
const DATE_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'all',      label: 'All'      },
  { value: 'past7',    label: 'Past 7d'  },
  { value: 'today',    label: 'Today'    },
  { value: 'thisweek', label: 'This Wk'  },
  { value: 'next7',    label: 'Next 7d'  },
  { value: 'next30',   label: 'Next 30d' },
  { value: 'upcoming', label: 'Upcoming' },
];

const CURRENCY_COLOR: Record<Currency, string> = {
  USD: 'border-sky-500/40 text-sky-400 bg-sky-500/15',
  EUR: 'border-indigo-500/40 text-indigo-400 bg-indigo-500/15',
  GBP: 'border-purple-500/40 text-purple-400 bg-purple-500/15',
  JPY: 'border-rose-500/40 text-rose-400 bg-rose-500/15',
  CAD: 'border-orange-500/40 text-orange-400 bg-orange-500/15',
  AUD: 'border-amber-500/40 text-amber-400 bg-amber-500/15',
};

const IMPACT_COLOR: Record<Impact, string> = {
  high:    'border-red-500/40 text-red-400 bg-red-500/15',
  medium:  'border-orange-500/40 text-orange-400 bg-orange-500/15',
  low:     'border-yellow-500/40 text-yellow-500 bg-yellow-500/15',
  holiday: 'border-slate-500/40 text-slate-400 bg-slate-700/50',
  none:    'border-slate-600/40 text-slate-500 bg-slate-700/30',
};

interface Props {
  filters: CalendarFilters;
  onChange: (f: CalendarFilters) => void;
  totalCount: number;
  filteredCount: number;
}

export default function CalendarFilters({ filters, onChange, totalCount, filteredCount }: Props) {
  const toggleCurrency = (c: Currency) => {
    const next = filters.currencies.includes(c)
      ? filters.currencies.filter((x) => x !== c)
      : [...filters.currencies, c];
    onChange({ ...filters, currencies: next });
  };

  const toggleImpact = (imp: Impact) => {
    const next = filters.impacts.includes(imp)
      ? filters.impacts.filter((x) => x !== imp)
      : [...filters.impacts, imp];
    onChange({ ...filters, impacts: next });
  };

  const allCurrencies = filters.currencies.length === 0;
  const allImpacts = filters.impacts.length === 0;

  return (
    <div className="border-b border-slate-800/60 bg-[#0d0d0f]/80 px-3 sm:px-4 py-2.5 space-y-2">
      {/* Row 1: Currency */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="hidden sm:inline text-xs text-slate-600 uppercase tracking-wider w-16 shrink-0">Currency</span>
        <button
          onClick={() => onChange({ ...filters, currencies: [] })}
          className={clsx(
            'px-2.5 py-1 rounded border text-xs font-medium transition-colors',
            allCurrencies
              ? 'border-amber-500/40 text-amber-300 bg-amber-500/15'
              : 'border-slate-700/60 text-slate-500 hover:text-slate-300 hover:border-slate-600',
          )}
        >
          All
        </button>
        {CURRENCIES.map((c) => (
          <button
            key={c}
            onClick={() => toggleCurrency(c)}
            className={clsx(
              'px-2 py-1 rounded border text-xs font-bold font-mono transition-colors',
              filters.currencies.includes(c)
                ? CURRENCY_COLOR[c]
                : 'border-slate-700/60 text-slate-500 hover:text-slate-300 hover:border-slate-600',
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Row 2: Impact */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="hidden sm:inline text-xs text-slate-600 uppercase tracking-wider w-16 shrink-0">Impact</span>
        <button
          onClick={() => onChange({ ...filters, impacts: [] })}
          className={clsx(
            'px-2.5 py-1 rounded border text-xs font-medium transition-colors',
            allImpacts
              ? 'border-amber-500/40 text-amber-300 bg-amber-500/15'
              : 'border-slate-700/60 text-slate-500 hover:text-slate-300 hover:border-slate-600',
          )}
        >
          All
        </button>
        {IMPACTS.map(({ value, label, dots }) => (
          <button
            key={value}
            onClick={() => toggleImpact(value)}
            className={clsx(
              'inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 rounded border text-xs font-medium font-mono transition-colors',
              filters.impacts.includes(value)
                ? IMPACT_COLOR[value]
                : 'border-slate-700/60 text-slate-500 hover:text-slate-300 hover:border-slate-600',
            )}
          >
            <span className="tracking-tight">{dots}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* Row 3: Date range + date picker + count */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="hidden sm:inline text-xs text-slate-600 uppercase tracking-wider w-16 shrink-0">Range</span>
          {DATE_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onChange({ ...filters, dateFilter: value, selectedDate: undefined })}
              className={clsx(
                'px-2 sm:px-2.5 py-1 rounded border text-xs font-medium transition-colors',
                filters.dateFilter === value && !filters.selectedDate
                  ? 'border-amber-500/40 text-amber-300 bg-amber-500/15'
                  : 'border-slate-700/60 text-slate-500 hover:text-slate-300 hover:border-slate-600',
              )}
            >
              {label}
            </button>
          ))}

          {/* Date picker */}
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={filters.selectedDate ?? ''}
              onChange={(e) => {
                const d = e.target.value;
                onChange({ ...filters, selectedDate: d || undefined });
              }}
              className={clsx(
                'text-[11px] font-mono bg-transparent border py-0.5 px-1.5 transition-colors [color-scheme:dark] cursor-pointer',
                filters.selectedDate
                  ? 'border-amber-500/40 text-amber-300'
                  : 'border-slate-700/60 text-slate-500 hover:border-slate-600 hover:text-slate-400',
              )}
            />
            {filters.selectedDate && (
              <button
                onClick={() => onChange({ ...filters, selectedDate: undefined })}
                className="text-slate-600 hover:text-amber-400 transition-colors"
                title="Clear date"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        <span className="text-xs text-slate-600 font-mono">
          {filteredCount} / {totalCount}
        </span>
      </div>
    </div>
  );
}
