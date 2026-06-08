import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

const TTL = 24 * 60 * 60 * 1000;
const UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export interface DixRow {
  date: string;
  price: number;
  dix: number;
  gex: number;
}
export interface DixData {
  rows: DixRow[];
  fetchedAt: string;
  stale?: boolean;
}

let _cache: { data: DixRow[]; at: number } | null = null;

export async function GET() {
  if (_cache && Date.now() - _cache.at < TTL) {
    return NextResponse.json({ rows: _cache.data, fetchedAt: new Date(_cache.at).toISOString() } satisfies DixData);
  }
  try {
    const r = await fetch(
      `https://squeezemetrics.com/monitor/static/DIX.csv?_t=${Date.now()}`,
      {
        headers: {
          'User-Agent': UA,
          'Referer': 'https://squeezemetrics.com/monitor/dix',
          'Accept': 'text/csv,text/plain,*/*',
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const lines = text.trim().split('\n');
    const start = lines[0].startsWith('date') ? 1 : 0;
    const rows: DixRow[] = lines.slice(start)
      .filter((l) => l.trim())
      .map((line) => {
        const [date, price, dix, gex] = line.split(',');
        return { date: date.trim(), price: parseFloat(price), dix: parseFloat(dix), gex: parseFloat(gex) };
      })
      .filter((row) => isFinite(row.price) && isFinite(row.dix) && isFinite(row.gex));

    _cache = { data: rows, at: Date.now() };
    return NextResponse.json({ rows, fetchedAt: new Date().toISOString() } satisfies DixData);
  } catch (e) {
    if (_cache) {
      return NextResponse.json({ rows: _cache.data, fetchedAt: new Date(_cache.at).toISOString(), stale: true } satisfies DixData);
    }
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
