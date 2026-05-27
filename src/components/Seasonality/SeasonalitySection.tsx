'use client';

import { useEffect, useState, useCallback } from 'react';
import { BarChart, Bar, Cell, ResponsiveContainer, ReferenceLine, Tooltip } from 'recharts';
import { clsx } from 'clsx';
import type { SeasonalityPayload, MonthStat } from '@/app/api/seasonality/route';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const NOW_MONTH = new Date().getMonth() + 1;

const CATEGORIES = [
  {
    id: 'indices',
    label: 'Indices',
    symbols: [
      { symbol: 'SPY',  name: 'S&P 500'      },
      { symbol: 'QQQ',  name: 'NASDAQ 100'   },
      { symbol: 'IWM',  name: 'Russell 2000' },
      { symbol: 'DIA',  name: 'Dow Jones'    },
      { symbol: 'EFA',  name: 'MSCI EAFE'    },
      { symbol: 'EEM',  name: 'MSCI Emerg.'  },
      { symbol: '^VIX', name: 'VIX Index'    },
    ],
  },
  {
    id: 'fx',
    label: 'FX',
    symbols: [
      { symbol: 'DX-Y.NYB', name: 'DXY (Dollar)' },
      { symbol: 'EURUSD=X', name: 'EUR/USD'       },
      { symbol: 'GBPUSD=X', name: 'GBP/USD'       },
      { symbol: 'USDJPY=X', name: 'USD/JPY'       },
      { symbol: 'USDCAD=X', name: 'USD/CAD'       },
      { symbol: 'AUDUSD=X', name: 'AUD/USD'       },
      { symbol: 'NZDUSD=X', name: 'NZD/USD'       },
      { symbol: 'USDCHF=X', name: 'USD/CHF'       },
    ],
  },
  {
    id: 'metals',
    label: 'Metals',
    symbols: [
      { symbol: 'GC=F', name: 'Gold'          },
      { symbol: 'SI=F', name: 'Silver'        },
      { symbol: 'PL=F', name: 'Platinum'      },
      { symbol: 'PA=F', name: 'Palladium'     },
      { symbol: 'HG=F', name: 'Copper'        },
      { symbol: 'GLD',  name: 'SPDR Gold ETF' },
    ],
  },
  {
    id: 'energy',
    label: 'Energy',
    symbols: [
      { symbol: 'CL=F', name: 'Crude Oil (WTI)' },
      { symbol: 'BZ=F', name: 'Brent Crude'     },
      { symbol: 'NG=F', name: 'Natural Gas'     },
      { symbol: 'RB=F', name: 'RBOB Gasoline'   },
      { symbol: 'HO=F', name: 'Heating Oil'     },
      { symbol: 'XLE',  name: 'Energy ETF'      },
    ],
  },
  {
    id: 'agri',
    label: 'Agri',
    symbols: [
      { symbol: 'ZW=F', name: 'Wheat'       },
      { symbol: 'ZC=F', name: 'Corn'        },
      { symbol: 'ZS=F', name: 'Soybeans'    },
      { symbol: 'KC=F', name: 'Coffee'      },
      { symbol: 'CT=F', name: 'Cotton'      },
      { symbol: 'SB=F', name: 'Sugar'       },
      { symbol: 'CC=F', name: 'Cocoa'       },
      { symbol: 'LE=F', name: 'Live Cattle' },
    ],
  },
  {
    id: 'crypto',
    label: 'Crypto',
    symbols: [
      { symbol: 'BTC-USD', name: 'Bitcoin'     },
      { symbol: 'ETH-USD', name: 'Ethereum'    },
      { symbol: 'SOL-USD', name: 'Solana'      },
      { symbol: 'BNB-USD', name: 'BNB'         },
      { symbol: 'XRP-USD', name: 'Ripple'      },
      { symbol: 'IBIT',    name: 'Bitcoin ETF' },
    ],
  },
  {
    id: 'bonds',
    label: 'Bonds',
    symbols: [
      { symbol: 'TLT',  name: '20Y Treasury' },
      { symbol: 'IEF',  name: '10Y Treasury' },
      { symbol: 'SHY',  name: '2Y Treasury'  },
      { symbol: 'HYG',  name: 'High Yield'   },
      { symbol: 'LQD',  name: 'Corp Bonds'   },
      { symbol: '^TNX', name: '10Y Yield'    },
      { symbol: '^IRX', name: '3M T-Bill'    },
    ],
  },
] as const;

type CategoryId = typeof CATEGORIES[number]['id'];

const _cache = new Map<string, SeasonalityPayload>();

function heatBg(v: number): string {
  if (v > 4)   return 'rgba(16,185,129,0.80)';
  if (v > 2)   return 'rgba(16,185,129,0.50)';
  if (v > 0.5) return 'rgba(16,185,129,0.25)';
  if (v > -0.5) return 'rgba(100,116,139,0.15)';
  if (v > -2)  return 'rgba(239,68,68,0.25)';
  if (v > -4)  return 'rgba(239,68,68,0.50)';
  return 'rgba(239,68,68,0.80)';
}

function heatText(v: number): string {
  if (Math.abs(v) > 2) return v > 0 ? '#6ee7b7' : '#fca5a5';
  if (Math.abs(v) > 0.5) return v > 0 ? '#6ee7b7' : '#fca5a5';
  return '#64748b';
}

function symbolLabel(s: string): string {
  return s.replace('=X', '').replace('-USD', '').replace('=F', '').replace('^', '');
}

function BarTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: MonthStat & { monthName: string } }> }) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#0d0d0f] border border-slate-700/60 rounded-lg px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-slate-200 mb-1">{d.monthName}</div>
      <div className="flex gap-3">
        <span className={d.avg >= 0 ? 'text-emerald-400' : 'text-red-400'}>
          avg {d.avg >= 0 ? '+' : ''}{d.avg.toFixed(2)}%
        </span>
        <span className="text-slate-500">med {d.median >= 0 ? '+' : ''}{d.median.toFixed(2)}%</span>
        <span className="text-amber-400/80">wr {(d.winRate * 100).toFixed(0)}%</span>
        <span className="text-slate-600">{d.count}y</span>
      </div>
    </div>
  );
}

function MonthlyBars({ stats }: { stats: MonthStat[] }) {
  const data = stats.map((s, i) => ({ ...s, monthName: MONTHS[i] }));
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={data} barCategoryGap="18%" margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
        <ReferenceLine y={0} stroke="#334155" strokeWidth={1} />
        <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="avg" radius={[2, 2, 2, 2]}>
          {data.map((d, i) => (
            <Cell
              key={i}
              fill={d.avg >= 0 ? 'rgba(16,185,129,0.65)' : 'rgba(239,68,68,0.65)'}
              stroke={i + 1 === NOW_MONTH ? '#f59e0b' : 'transparent'}
              strokeWidth={i + 1 === NOW_MONTH ? 2 : 0}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function WinRateBars({ stats }: { stats: MonthStat[] }) {
  return (
    <div className="flex gap-[3px] h-10">
      {stats.map((s, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <div className="w-full flex-1 bg-slate-800/50 rounded-sm overflow-hidden flex flex-col justify-end">
            <div
              style={{ height: `${s.winRate * 100}%` }}
              className={clsx(
                'w-full rounded-sm',
                s.winRate >= 0.6 ? 'bg-emerald-500/70' : s.winRate >= 0.5 ? 'bg-amber-500/60' : 'bg-red-500/60',
              )}
            />
          </div>
          <span className={clsx('text-[8px] leading-none', i + 1 === NOW_MONTH ? 'text-amber-400' : 'text-slate-700')}>
            {MONTHS[i].charAt(0)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Heatmap({ stats, monthly }: { stats: MonthStat[]; monthly: SeasonalityPayload['monthly'] }) {
  const years = Array.from(new Set(monthly.map((m) => m.year))).sort((a, b) => b - a);
  const retMap = new Map<string, number>();
  monthly.forEach((m) => retMap.set(`${m.year}-${m.month}`, m.ret));

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 560, fontSize: 10 }}>
        <thead>
          <tr>
            <th className="text-left text-slate-600 font-normal px-1.5 py-1 w-12">Year</th>
            {MONTHS.map((m, i) => (
              <th key={m} className={clsx('text-center font-normal px-0.5 py-1', i + 1 === NOW_MONTH ? 'text-amber-500/80' : 'text-slate-600')}>
                {m}
              </th>
            ))}
            <th className="text-right text-slate-600 font-normal px-1.5 py-1 w-12">Ann.</th>
          </tr>
          <tr className="border-b border-slate-800/60">
            <td className="text-slate-600 px-1.5 py-0.5 text-[9px]">avg</td>
            {stats.map((s, i) => (
              <td key={i} className="text-center px-0.5 py-0.5">
                <div className="rounded-sm px-0.5 font-mono tabular-nums" style={{ background: heatBg(s.avg), color: heatText(s.avg) }}>
                  {s.avg >= 0 ? '+' : ''}{s.avg.toFixed(1)}
                </div>
              </td>
            ))}
            <td className="text-slate-700 text-right px-1.5 py-0.5">—</td>
          </tr>
        </thead>
        <tbody>
          {years.slice(0, 22).map((year) => {
            const vals = Array.from({ length: 12 }, (_, i) => retMap.get(`${year}-${i + 1}`) ?? null);
            const annRet = (vals.filter((v): v is number => v !== null)).reduce((a, b) => a + b, 0);
            return (
              <tr key={year} className="hover:bg-slate-800/20 transition-colors">
                <td className="text-slate-500 px-1.5 py-0.5 font-mono">{year}</td>
                {vals.map((v, i) => (
                  <td key={i} className="text-center px-0.5 py-0.5">
                    {v !== null ? (
                      <div className="rounded-sm px-0.5 font-mono tabular-nums" style={{ background: heatBg(v), color: heatText(v) }}>
                        {v >= 0 ? '+' : ''}{v.toFixed(1)}
                      </div>
                    ) : (
                      <span className="text-slate-800">—</span>
                    )}
                  </td>
                ))}
                <td className="text-right px-1.5 py-0.5 font-mono tabular-nums" style={{ color: heatText(annRet) }}>
                  {annRet >= 0 ? '+' : ''}{annRet.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SeasonalitySection() {
  const [category, setCategory] = useState<CategoryId>('indices');
  const [selectedSymbol, setSelectedSymbol] = useState('SPY');
  const [data, setData] = useState<SeasonalityPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'chart' | 'heatmap'>('chart');

  const catSymbols = CATEGORIES.find((c) => c.id === category)!.symbols;

  const fetchSymbol = useCallback(async (symbol: string, name: string) => {
    if (_cache.has(symbol)) {
      setData(_cache.get(symbol)!);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/seasonality?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json: SeasonalityPayload = await r.json();
      if ('error' in json) throw new Error((json as { error: string }).error);
      _cache.set(symbol, json);
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  // On category change: select first symbol
  useEffect(() => {
    const sym = catSymbols[0];
    setSelectedSymbol(sym.symbol);
    fetchSymbol(sym.symbol, sym.name);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // On symbol change (not triggered by category change because above already handles it)
  const handleSelectSymbol = useCallback((symbol: string) => {
    setSelectedSymbol(symbol);
    const sym = catSymbols.find((s) => s.symbol === symbol);
    if (sym) fetchSymbol(sym.symbol, sym.name);
  }, [catSymbols, fetchSymbol]);

  const currentStat = data?.stats.find((s) => s.month === NOW_MONTH) ?? null;
  const bestStat    = data ? [...data.stats].sort((a, b) => b.avg - a.avg)[0] : null;
  const worstStat   = data ? [...data.stats].sort((a, b) => a.avg - b.avg)[0] : null;

  return (
    <div className="flex flex-col gap-3" style={{ minHeight: 0 }}>
      {/* Category tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id as CategoryId)}
            className={clsx(
              'px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors',
              category === c.id
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'text-slate-600 border border-transparent hover:text-slate-400 hover:border-slate-700/60',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        {/* Left symbol list */}
        <div className="w-36 shrink-0 flex flex-col gap-0.5">
          {catSymbols.map(({ symbol, name }) => {
            const cached = _cache.get(symbol);
            const curAvg = cached?.stats.find((s) => s.month === NOW_MONTH)?.avg;
            return (
              <button
                key={symbol}
                onClick={() => handleSelectSymbol(symbol)}
                className={clsx(
                  'w-full text-left px-2.5 py-2 rounded-lg transition-colors',
                  selectedSymbol === symbol
                    ? 'bg-amber-500/15 border border-amber-500/30'
                    : 'border border-transparent hover:bg-slate-800/40 hover:border-slate-700/40',
                )}
              >
                <div className={clsx('text-[11px] font-bold leading-none', selectedSymbol === symbol ? 'text-amber-300' : 'text-slate-400')}>
                  {symbolLabel(symbol)}
                </div>
                <div className="text-[9px] text-slate-600 mt-0.5 leading-none truncate">{name}</div>
                {curAvg !== undefined && (
                  <div className={clsx('text-[9px] font-mono mt-0.5 leading-none', curAvg >= 0 ? 'text-emerald-500/80' : 'text-red-500/80')}>
                    {curAvg >= 0 ? '+' : ''}{curAvg.toFixed(1)}%
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="text-slate-600 text-sm animate-pulse">Fetching data…</div>
            </div>
          )}
          {error && !loading && (
            <div className="flex items-center justify-center py-20 text-red-500/60 text-sm">{error}</div>
          )}
          {!loading && !error && data && (
            <>
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-base font-bold text-slate-100">{data.name}</span>
                  <span className="text-xs text-slate-600">{data.symbol} · {data.years}Y · Yahoo Finance</span>
                </div>
                <div className="flex gap-1">
                  {(['chart', 'heatmap'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={clsx(
                        'px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-colors',
                        view === v
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'text-slate-600 border border-slate-800/60 hover:text-slate-400',
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[#0d0d0f] rounded-lg border border-slate-800/60 p-3">
                  <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">{MONTHS[NOW_MONTH - 1]} (now)</div>
                  {currentStat ? (
                    <>
                      <div className={clsx('text-xl font-bold font-mono', currentStat.avg >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {currentStat.avg >= 0 ? '+' : ''}{currentStat.avg.toFixed(2)}%
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        wr {(currentStat.winRate * 100).toFixed(0)}% · {currentStat.count}y
                      </div>
                    </>
                  ) : <div className="text-slate-700 text-sm">—</div>}
                </div>
                <div className="bg-[#0d0d0f] rounded-lg border border-slate-800/60 p-3">
                  <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">Best month</div>
                  {bestStat && (
                    <>
                      <div className="text-xl font-bold font-mono text-emerald-400">
                        +{bestStat.avg.toFixed(2)}%
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        {MONTHS[bestStat.month - 1]} · wr {(bestStat.winRate * 100).toFixed(0)}%
                      </div>
                    </>
                  )}
                </div>
                <div className="bg-[#0d0d0f] rounded-lg border border-slate-800/60 p-3">
                  <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-1">Worst month</div>
                  {worstStat && (
                    <>
                      <div className="text-xl font-bold font-mono text-red-400">
                        {worstStat.avg.toFixed(2)}%
                      </div>
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        {MONTHS[worstStat.month - 1]} · wr {(worstStat.winRate * 100).toFixed(0)}%
                      </div>
                    </>
                  )}
                </div>
              </div>

              {view === 'chart' ? (
                <>
                  <div className="bg-[#0d0d0f] rounded-lg border border-slate-800/60 p-3">
                    <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">Avg monthly return — hover for details</div>
                    <MonthlyBars stats={data.stats} />
                  </div>
                  <div className="bg-[#0d0d0f] rounded-lg border border-slate-800/60 p-3">
                    <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">Win rate by month</div>
                    <WinRateBars stats={data.stats} />
                  </div>
                </>
              ) : (
                <div className="bg-[#0d0d0f] rounded-lg border border-slate-800/60 p-3 overflow-auto">
                  <div className="text-[10px] text-slate-600 uppercase tracking-wider mb-2">Year-by-year monthly returns (%)</div>
                  <Heatmap stats={data.stats} monthly={data.monthly} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
