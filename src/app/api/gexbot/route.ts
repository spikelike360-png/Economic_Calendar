import { NextResponse } from 'next/server';
import { memCache } from '@/lib/scraper/cache';
import type {
  GexbotMajors, GexbotModelData, GexbotIndex,
  GexbotStock, GexbotAggregateScore, GexbotResponse,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'gexbot_v4';
const CACHE_TTL = 60 * 1000;
const UA = 'MacroDashboard/1.0';

const INDICES: { ticker: string; label: string }[] = [
  { ticker: 'SPX',    label: 'S&P 500' },
  { ticker: 'NDX',    label: 'Nasdaq 100' },
  { ticker: 'ES_SPX', label: 'ES Futures' },
  { ticker: 'NQ_NDX', label: 'NQ Futures' },
];

const NDX_STOCKS = [
  { ticker: 'MSFT',  name: 'Microsoft', weight: 8.4 },
  { ticker: 'AAPL',  name: 'Apple',     weight: 7.9 },
  { ticker: 'NVDA',  name: 'Nvidia',    weight: 7.6 },
  { ticker: 'AMZN',  name: 'Amazon',    weight: 5.7 },
  { ticker: 'META',  name: 'Meta',      weight: 5.0 },
  { ticker: 'GOOGL', name: 'Alphabet',  weight: 4.7 },
  { ticker: 'TSLA',  name: 'Tesla',     weight: 3.8 },
  { ticker: 'AVGO',  name: 'Broadcom',  weight: 3.5 },
  { ticker: 'NFLX',  name: 'Netflix',   weight: 2.8 },
  { ticker: 'COST',  name: 'Costco',    weight: 2.6 },
] as const;

async function fetchMajors(
  ticker: string,
  model: 'classic' | 'state',
  variant: 'full' | 'zero',
  apiKey: string,
): Promise<GexbotMajors | null> {
  try {
    const res = await fetch(
      `https://api.gexbot.com/${ticker}/${model}/${variant}/majors`,
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) { console.warn(`[gexbot] ${ticker}/${model}/${variant} → HTTP ${res.status}`); return null; }
    return (await res.json()) as GexbotMajors;
  } catch (err) {
    console.warn(`[gexbot] ${ticker}/${model}/${variant} failed:`, err);
    return null;
  }
}

function calcAggregate(stocks: GexbotStock[]): GexbotAggregateScore {
  const withData = stocks.filter((s) => s.classic.full !== null);
  const totalW   = withData.reduce((s, x) => s + x.ndxWeight, 0);
  const wScore   = totalW > 0
    ? withData.reduce((s, x) => {
        const netGex = x.classic.full!.net_gex_oi;
        return s + (netGex < 0 ? -1 : 1) * x.ndxWeight;
      }, 0) / totalW
    : 0;
  return {
    weightedScore: parseFloat(wScore.toFixed(3)),
    negCount: withData.filter((s) => (s.classic.full!.net_gex_oi) < 0).length,
    posCount: withData.filter((s) => (s.classic.full!.net_gex_oi) >= 0).length,
    dataCount: withData.length,
  };
}

export async function GET() {
  const cached = memCache.get<GexbotResponse>(CACHE_KEY);
  if (cached && !cached.isStale) return NextResponse.json(cached.data);

  const apiKey = (process.env.GEXBOT_API_KEY ?? '').trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEXBOT_API_KEY not configured', indices: [], stocks: [], aggregate: { weightedScore: 0, negCount: 0, posCount: 0, dataCount: 0 }, fetchedAt: new Date().toISOString() },
      { status: 503 },
    );
  }

  // 4 indices × 4 endpoints + 10 stocks × 2 (classic full+zero) = 36 parallel calls
  const indexFetches = INDICES.flatMap(({ ticker }) => [
    fetchMajors(ticker, 'classic', 'full',  apiKey),
    fetchMajors(ticker, 'classic', 'zero',  apiKey),
    fetchMajors(ticker, 'state',   'full',  apiKey),
    fetchMajors(ticker, 'state',   'zero',  apiKey),
  ]);
  const stockFetches = NDX_STOCKS.flatMap(({ ticker }) => [
    fetchMajors(ticker, 'classic', 'full', apiKey),
    fetchMajors(ticker, 'classic', 'zero', apiKey),
  ]);

  const allResults = await Promise.all([...indexFetches, ...stockFetches]);

  const indices: GexbotIndex[] = INDICES.map(({ ticker, label }, i) => {
    const base = i * 4;
    return {
      ticker, label,
      classic: { full: allResults[base],     zero: allResults[base + 1] } as GexbotModelData,
      state:   { full: allResults[base + 2], zero: allResults[base + 3] } as GexbotModelData,
    };
  });

  const stockOffset = INDICES.length * 4;
  const stocks: GexbotStock[] = NDX_STOCKS.map(({ ticker, name, weight }, i) => {
    const base = stockOffset + i * 2;
    return {
      ticker, name, ndxWeight: weight,
      classic: { full: allResults[base], zero: allResults[base + 1] } as GexbotModelData,
    };
  });

  const aggregate = calcAggregate(stocks);

  console.log(`[gexbot] SPX classic=${indices[0]?.classic.full?.net_gex_oi?.toFixed(0)} state=${indices[0]?.state.full?.net_gex_oi?.toFixed(0)} stocks=${aggregate.dataCount}/10`);

  const response: GexbotResponse = { indices, stocks, aggregate, fetchedAt: new Date().toISOString() };
  const hasData = indices.some((i) => i.classic.full !== null || i.state.full !== null);
  if (hasData) memCache.set(CACHE_KEY, response, CACHE_TTL);

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
