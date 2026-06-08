import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

// Proxy FinancialJuice Centrifugo token — avoids CORS from browser
// Token grants access to feed:all and feed:lite_feed channels
const TTL = 60 * 60 * 1000; // 1h cache (token valid ~1 year)
let _cache: { token: string; at: number } | null = null;

export async function GET() {
  if (_cache && Date.now() - _cache.at < TTL) {
    return NextResponse.json({ token: _cache.token });
  }
  try {
    const r = await fetch('https://www.financialjuice.com/widgets/centrifugo-token.ashx', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.financialjuice.com/home',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if (!j.token) throw new Error('No token in response');
    _cache = { token: j.token, at: Date.now() };
    return NextResponse.json({ token: j.token });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
