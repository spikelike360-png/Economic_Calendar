import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const CACHE_DIR  = path.join(process.cwd(), 'data', 'seasonality');
const CACHE_TTL  = 24 * 60 * 60 * 1000;
const YF_UA      = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface MonthlyReturn { year: number; month: number; ret: number }
export interface MonthStat      { month: number; avg: number; median: number; winRate: number; count: number }

export interface SeasonalityPayload {
  symbol:   string;
  name:     string;
  currency: string;
  monthly:  MonthlyReturn[];
  stats:    MonthStat[];
  years:    number;
  fetchedAt: string;
}

function diskPath(symbol: string) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  return path.join(CACHE_DIR, `${symbol.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
}

function readDisk(symbol: string): SeasonalityPayload | null {
  try {
    const p = diskPath(symbol);
    if (!fs.existsSync(p)) return null;
    const d: SeasonalityPayload = JSON.parse(fs.readFileSync(p, 'utf-8'));
    if (Date.now() - new Date(d.fetchedAt).getTime() > CACHE_TTL) return null;
    return d;
  } catch { return null; }
}

function writeDisk(symbol: string, data: SeasonalityPayload) {
  try { fs.writeFileSync(diskPath(symbol), JSON.stringify(data), 'utf-8'); } catch {}
}

async function fetchYF(symbol: string): Promise<{ ts: number; close: number }[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=20y`;
  const res = await fetch(url, {
    headers: { 'User-Agent': YF_UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`YF ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('no chart result');
  const timestamps: number[]  = result.timestamp ?? [];
  const closes: number[]      = result.indicators?.adjclose?.[0]?.adjclose
                              ?? result.indicators?.quote?.[0]?.close
                              ?? [];
  return timestamps
    .map((ts, i) => ({ ts: ts * 1000, close: closes[i] }))
    .filter((p) => p.close != null && isFinite(p.close));
}

function computeStats(monthly: MonthlyReturn[]): MonthStat[] {
  return Array.from({ length: 12 }, (_, i) => {
    const m   = i + 1;
    const rets = monthly.filter((r) => r.month === m).map((r) => r.ret);
    if (!rets.length) return { month: m, avg: 0, median: 0, winRate: 0, count: 0 };
    const avg     = rets.reduce((a, b) => a + b, 0) / rets.length;
    const sorted  = [...rets].sort((a, b) => a - b);
    const median  = sorted[Math.floor(sorted.length / 2)];
    const winRate = rets.filter((r) => r > 0).length / rets.length;
    return { month: m, avg: +avg.toFixed(3), median: +median.toFixed(3), winRate: +winRate.toFixed(3), count: rets.length };
  });
}

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get('symbol')?.toUpperCase();
  if (!symbol) return NextResponse.json({ error: 'missing symbol' }, { status: 400 });

  const cached = readDisk(symbol);
  if (cached) return NextResponse.json(cached);

  try {
    const raw   = await fetchYF(symbol);
    const monthly: MonthlyReturn[] = [];

    for (let i = 1; i < raw.length; i++) {
      const prev = raw[i - 1];
      const curr = raw[i];
      if (!prev.close || !curr.close) continue;
      const ret = ((curr.close - prev.close) / prev.close) * 100;
      if (!isFinite(ret)) continue;
      const d = new Date(curr.ts);
      monthly.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, ret: +ret.toFixed(3) });
    }

    const years = new Set(monthly.map((m) => m.year)).size;
    const stats = computeStats(monthly);

    const payload: SeasonalityPayload = {
      symbol,
      name:      req.nextUrl.searchParams.get('name') ?? symbol,
      currency:  'USD',
      monthly,
      stats,
      years,
      fetchedAt: new Date().toISOString(),
    };

    writeDisk(symbol, payload);
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
