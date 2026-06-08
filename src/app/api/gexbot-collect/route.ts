import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { GexbotMajors } from '@/lib/types';

export const dynamic = 'force-dynamic';

const UA = 'MacroDashboard/1.0';

const TICKERS = [
  'SPX', 'NDX', 'ES_SPX', 'NQ_NDX',
  'MSFT', 'AAPL', 'NVDA', 'AMZN', 'META',
  'GOOGL', 'TSLA', 'AVGO', 'NFLX', 'COST',
  'SPY', 'QQQ', 'IWM', 'VIX',
];

async function fetchOne(
  ticker: string,
  model: 'classic' | 'state',
  variant: 'full' | 'zero',
  apiKey: string,
): Promise<GexbotMajors | null> {
  try {
    const res = await fetch(
      `https://api.gexbot.com/${ticker}/${model}/${variant}/majors`,
      { headers: { Authorization: `Bearer ${apiKey}`, 'User-Agent': UA }, signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    return (await res.json()) as GexbotMajors;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-collect-secret') ?? '';
  const expectedSecret = (process.env.COLLECT_SECRET ?? '').trim();
  if (expectedSecret && secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = (process.env.GEXBOT_API_KEY ?? '').trim();
  if (!apiKey) return NextResponse.json({ error: 'GEXBOT_API_KEY not set' }, { status: 503 });

  const fetches = TICKERS.flatMap((ticker) => [
    fetchOne(ticker, 'classic', 'full',  apiKey).then((d) => ({ ticker, model: 'classic', variant: 'full',  data: d })),
    fetchOne(ticker, 'classic', 'zero',  apiKey).then((d) => ({ ticker, model: 'classic', variant: 'zero',  data: d })),
    fetchOne(ticker, 'state',   'full',  apiKey).then((d) => ({ ticker, model: 'state',   variant: 'full',  data: d })),
    fetchOne(ticker, 'state',   'zero',  apiKey).then((d) => ({ ticker, model: 'state',   variant: 'zero',  data: d })),
  ]);

  const results = await Promise.all(fetches);
  const collectedAt = new Date().toISOString();
  const dateStr = collectedAt.slice(0, 10); // YYYY-MM-DD

  const snapshot = {
    collectedAt,
    data: results.filter((r) => r.data !== null),
  };

  try {
    const dir = join(process.cwd(), 'data', 'gex');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${dateStr}.json`), JSON.stringify(snapshot, null, 2));
  } catch (e) {
    console.warn('[gexbot-collect] write failed (expected on Vercel):', e);
    // On Vercel, filesystem writes fail — data returned in response for GH Actions to save
  }

  const successCount = results.filter((r) => r.data !== null).length;
  console.log(`[gexbot-collect] ${dateStr}: ${successCount}/${results.length} points collected`);

  return NextResponse.json({ date: dateStr, collectedAt, successCount, total: results.length, snapshot });
}
