import { NextResponse } from 'next/server';
import { memCache } from '@/lib/scraper/cache';
import type {
  GexbotMajors, GexbotInstrument, GexbotStockRow,
  GexbotAggregateScore, GexbotResponse,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'gexbot_v3';
const CACHE_TTL = 60 * 1000;

const INDICES = ['SPX', 'NDX'] as const;

const NQ_STOCKS = [
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

const UA = 'MacroDashboard/1.0';

function calcBreakoutProb(spot: number, zeroGamma: number, netGex: number): number {
  const base    = netGex < 0 ? 0.68 : 0.28;
  const distPct = spot > 0 ? Math.abs(spot - zeroGamma) / spot : 0;
  const nearFlip = distPct < 0.005 ? 0.10 : 0;
  return Math.round(Math.min(0.92, Math.max(0.08, base + nearFlip)) * 100);
}

async function fetchMajors(ticker: string, apiKey: string): Promise<GexbotMajors | null> {
  try {
    const res = await fetch(
      `https://api.gexbot.com/${ticker}/classic/zero/majors`,
      {
        headers: { Authorization: `Bearer ${apiKey}`, 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) { console.warn(`[gexbot] ${ticker} → HTTP ${res.status}`); return null; }
    return (await res.json()) as GexbotMajors;
  } catch (err) {
    console.warn(`[gexbot] ${ticker} failed:`, err);
    return null;
  }
}

function toInstrument(ticker: string, d: GexbotMajors | null): GexbotInstrument {
  if (!d) return { ticker, majors: null, breakoutProb: 50, regime: 'positive', distToFlipPts: 0, aboveFlip: true };
  const regime        = d.net_gex_oi < 0 ? ('negative' as const) : ('positive' as const);
  const distToFlipPts = d.spot - d.zero_gamma;
  return {
    ticker, majors: d, regime,
    breakoutProb: calcBreakoutProb(d.spot, d.zero_gamma, d.net_gex_oi),
    distToFlipPts,
    aboveFlip: distToFlipPts > 0,
  };
}

function toStockRow(ticker: string, name: string, weight: number, d: GexbotMajors | null): GexbotStockRow {
  const { ticker: _t, ...rest } = toInstrument(ticker, d);
  return { ticker, name, ndxWeight: weight, ...rest };
}

function calcAggregate(stocks: GexbotStockRow[]): GexbotAggregateScore {
  const withData = stocks.filter((s) => s.majors !== null);
  const totalW   = withData.reduce((s, x) => s + x.ndxWeight, 0);
  const wScore   = totalW > 0
    ? withData.reduce((s, x) => s + (x.regime === 'positive' ? 1 : -1) * x.ndxWeight, 0) / totalW
    : 0;
  return {
    weightedScore: parseFloat(wScore.toFixed(3)),
    negCount: withData.filter((s) => s.regime === 'negative').length,
    posCount: withData.filter((s) => s.regime === 'positive').length,
    dataCount: withData.length,
  };
}

export async function GET() {
  const cached = memCache.get<GexbotResponse>(CACHE_KEY);
  if (cached && !cached.isStale) return NextResponse.json(cached.data);

  const apiKey = (process.env.GEXBOT_API_KEY ?? '').trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'GEXBOT_API_KEY not configured', instruments: [], stocks: [], aggregate: { weightedScore: 0, negCount: 0, posCount: 0, dataCount: 0 }, fetchedAt: new Date().toISOString() },
      { status: 503 },
    );
  }

  // Fetch all in parallel: 2 indices + 10 stocks = 12 calls
  const allTickers = [...INDICES, ...NQ_STOCKS.map((s) => s.ticker)];
  const allResults = await Promise.all(allTickers.map((t) => fetchMajors(t, apiKey)));

  const instruments: GexbotInstrument[] = INDICES.map((ticker, i) => toInstrument(ticker, allResults[i]));
  const stocks: GexbotStockRow[] = NQ_STOCKS.map((s, i) =>
    toStockRow(s.ticker, s.name, s.weight, allResults[INDICES.length + i]),
  );
  const aggregate = calcAggregate(stocks);

  console.log(
    `[gexbot] SPX=${instruments[0]?.breakoutProb}% NDX=${instruments[1]?.breakoutProb}% ` +
    `stocks=${aggregate.dataCount}/10 score=${aggregate.weightedScore.toFixed(2)}`,
  );

  const response: GexbotResponse = { instruments, stocks, aggregate, fetchedAt: new Date().toISOString() };
  const hasData = instruments.some((i) => i.majors !== null) || stocks.some((s) => s.majors !== null);
  if (hasData) memCache.set(CACHE_KEY, response, CACHE_TTL);

  return NextResponse.json(response, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
