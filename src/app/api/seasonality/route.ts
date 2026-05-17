import { NextResponse } from 'next/server';
import { memCache } from '@/lib/scraper/cache';
import type { Currency, CurrencySeasonality, SeasonalityMonth, SeasonalityResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'seasonality';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const PAIR_CONFIG: Record<Currency, { symbol: string; invert: boolean }> = {
  USD: { symbol: 'DX-Y.NYB', invert: false }, // DXY index — higher = USD stronger
  EUR: { symbol: 'EURUSD=X', invert: false },
  GBP: { symbol: 'GBPUSD=X', invert: false },
  JPY: { symbol: 'USDJPY=X', invert: true  }, // invert: higher = JPY weaker
  CAD: { symbol: 'USDCAD=X', invert: true  }, // invert: higher = CAD weaker
  AUD: { symbol: 'AUDUSD=X', invert: false },
};

const YF_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchMonthlyCloses(symbol: string): Promise<{ ts: number; close: number }[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=20y`;
  const res = await fetch(url, {
    headers: { 'User-Agent': YF_UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`YF HTTP ${res.status} for ${symbol}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No chart result for ${symbol}`);
  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  return timestamps
    .map((ts, i) => ({ ts: ts * 1000, close: closes[i] ?? NaN }))
    .filter((d) => !isNaN(d.close));
}

function computeSeasonality(
  data: { ts: number; close: number }[],
  invert: boolean,
): { monthly: SeasonalityMonth[]; yearsOfData: number } {
  const byMonth: Record<number, number[]> = {};
  for (let m = 1; m <= 12; m++) byMonth[m] = [];

  for (let i = 1; i < data.length; i++) {
    const ret = (data[i].close / data[i - 1].close - 1) * 100;
    if (!isFinite(ret)) continue;
    const month = new Date(data[i].ts).getUTCMonth() + 1;
    byMonth[month].push(invert ? -ret : ret);
  }

  const monthly: SeasonalityMonth[] = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const returns = byMonth[month];
    const avg = returns.length
      ? returns.reduce((a, b) => a + b, 0) / returns.length
      : 0;
    return {
      month,
      avgReturn: Math.round(avg * 100) / 100,
      positiveYears: returns.filter((r) => r > 0).length,
      totalYears: returns.length,
    };
  });

  const yearsOfData = Math.max(...monthly.map((m) => m.totalYears), 0);
  return { monthly, yearsOfData };
}

export async function GET() {
  const cached = memCache.get<SeasonalityResponse>(CACHE_KEY);
  if (cached && !cached.isStale) {
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' },
    });
  }

  const currencies = Object.keys(PAIR_CONFIG) as Currency[];

  const results = await Promise.allSettled(
    currencies.map(async (currency): Promise<CurrencySeasonality> => {
      const { symbol, invert } = PAIR_CONFIG[currency];
      const closes = await fetchMonthlyCloses(symbol);
      const { monthly, yearsOfData } = computeSeasonality(closes, invert);
      return { currency, monthly, yearsOfData };
    }),
  );

  const data: CurrencySeasonality[] = results
    .filter((r): r is PromiseFulfilledResult<CurrencySeasonality> => r.status === 'fulfilled')
    .map((r) => r.value);

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) console.warn(`[seasonality] ${failed} currency fetch(es) failed`);

  const response: SeasonalityResponse = {
    data,
    fetchedAt: new Date().toISOString(),
    source: 'Yahoo Finance',
  };

  if (data.length > 0) memCache.set(CACHE_KEY, response, CACHE_TTL);

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400' },
  });
}
