import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

const SYMBOL_MAP: Record<string, string> = {
  SPX: '%5EGSPC',
  VIX: '%5EVIX',
  NDX: '%5ENDX',
  DJI: '%5EDJI',
  RUT: '%5ERUT',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchPrice(dashSym: string): Promise<[string, number] | null> {
  const yfSym = SYMBOL_MAP[dashSym] ?? encodeURIComponent(dashSym);
  try {
    const r = await fetch(
      `https://query2.finance.yahoo.com/v8/finance/chart/${yfSym}?interval=1m&range=1d`,
      { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(5000) },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const price = j?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price ? [dashSym, price as number] : null;
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbols') ?? '';
  const symbols = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (!symbols.length) return NextResponse.json({});

  const results = await Promise.all(symbols.map(fetchPrice));
  const out: Record<string, number> = {};
  for (const r of results) { if (r) out[r[0]] = r[1]; }
  return NextResponse.json(out);
}
