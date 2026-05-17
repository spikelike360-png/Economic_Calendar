'use client';

import { useEffect, useState } from 'react';
import type { CurrencySeasonality, SeasonalityResponse } from '@/lib/types';
import { clsx } from 'clsx';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_INIT = ['J','F','M','A','M','J','J','A','S','O','N','D'];

const CURRENCY_META: Record<string, { flag: string; name: string; pair: string }> = {
  USD: { flag: '🇺🇸', name: 'US Dollar',      pair: 'DXY'      },
  EUR: { flag: '🇪🇺', name: 'Euro',            pair: 'EUR/USD'  },
  GBP: { flag: '🇬🇧', name: 'Brit. Pound',    pair: 'GBP/USD'  },
  JPY: { flag: '🇯🇵', name: 'Jap. Yen',       pair: 'USD/JPY ⁻¹' },
  CAD: { flag: '🇨🇦', name: 'Can. Dollar',    pair: 'USD/CAD ⁻¹' },
  AUD: { flag: '🇦🇺', name: 'Aus. Dollar',    pair: 'AUD/USD'  },
};

function SeasonalChart({ data }: { data: CurrencySeasonality }) {
  const { monthly, yearsOfData } = data;
  const maxAbs = Math.max(...monthly.map((m) => Math.abs(m.avgReturn)), 0.01);
  const bullishMonths = monthly.filter((m) => m.avgReturn > 0).length;

  return (
    <div className="flex flex-col gap-1.5">
      {/* bars */}
      <div className="flex gap-[2px]">
        {monthly.map((m, i) => {
          const posH = m.avgReturn > 0 ? Math.round((m.avgReturn / maxAbs) * 44) : 0;
          const negH = m.avgReturn < 0 ? Math.round((Math.abs(m.avgReturn) / maxAbs) * 44) : 0;
          const isPos = m.avgReturn >= 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center group cursor-default">
              {/* positive half */}
              <div className="h-11 w-full flex items-end">
                {posH > 0 && (
                  <div
                    style={{ height: posH }}
                    className="w-full bg-emerald-500/70 hover:bg-emerald-400/90 rounded-t-[2px] transition-colors"
                  />
                )}
              </div>
              {/* zero line */}
              <div className="h-px w-full bg-slate-700/60" />
              {/* negative half */}
              <div className="h-11 w-full flex items-start">
                {negH > 0 && (
                  <div
                    style={{ height: negH }}
                    className="w-full bg-red-500/70 hover:bg-red-400/90 rounded-b-[2px] transition-colors"
                  />
                )}
              </div>
              {/* month label */}
              <span className="mt-1 text-[9px] text-slate-600 leading-none">
                {MONTH_INIT[i]}
              </span>
              {/* avg return — shown on hover via group */}
              <span
                className={clsx(
                  'text-[8px] font-mono leading-none mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity',
                  isPos ? 'text-emerald-400' : 'text-red-400',
                )}
              >
                {m.avgReturn >= 0 ? '+' : ''}{m.avgReturn.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>

      {/* footer stats */}
      <div className="flex items-center justify-between text-[10px] text-slate-600 pt-0.5 border-t border-slate-800/60">
        <span>
          <span className="text-emerald-500/80">{bullishMonths}</span>
          <span> / 12 months bullish</span>
        </span>
        <span>{yearsOfData}Y data</span>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-[#0d0d0f] p-4 animate-pulse">
      <div className="h-4 w-32 bg-slate-800 rounded mb-4" />
      <div className="h-24 bg-slate-800/60 rounded mb-2" />
      <div className="h-3 w-24 bg-slate-800 rounded" />
    </div>
  );
}

export default function SeasonalitySection() {
  const [data, setData] = useState<CurrencySeasonality[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/seasonality')
      .then((r) => r.json())
      .then((json: SeasonalityResponse) => {
        setData(json.data ?? []);
        setFetchedAt(json.fetchedAt);
      })
      .catch(() => setError('Failed to load seasonality data'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Seasonality</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            20-year avg monthly returns · hover bars for values
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="px-2 py-0.5 rounded border border-slate-800 bg-slate-900">
            Yahoo Finance
          </span>
          {fetchedAt && (
            <span className="font-mono">
              {new Date(fetchedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* month axis legend */}
      <div className="hidden sm:flex gap-[2px] px-4 text-[9px] text-slate-700">
        {MONTHS.map((m) => (
          <div key={m} className="flex-1 text-center">{m}</div>
        ))}
      </div>

      {/* cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-20 text-slate-600 text-sm">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {data.map((d) => {
            const meta = CURRENCY_META[d.currency];
            return (
              <div
                key={d.currency}
                className="rounded-xl border border-slate-800/60 bg-[#0d0d0f] p-4 hover:border-slate-700/60 transition-colors"
              >
                {/* card header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{meta.flag}</span>
                    <div>
                      <div className="text-xs font-semibold text-slate-200">{meta.name}</div>
                      <div className="text-[10px] text-slate-600">{meta.pair}</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400/80">
                    {d.currency}
                  </span>
                </div>

                <SeasonalChart data={d} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
