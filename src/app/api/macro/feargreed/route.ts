import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

const TTL = 60 * 60 * 1000;
let _cache: { data: object; at: number } | null = null;

export interface FearGreedData {
  score:    number;
  rating:   string;
  prev1w:   { score: number; rating: string };
  prev1m:   { score: number; rating: string };
  prev1y:   { score: number; rating: string };
  source:   'crypto';
  fetchedAt: string;
}

function classify(score: number): string {
  if (score <= 25) return 'Extreme Fear';
  if (score <= 45) return 'Fear';
  if (score <= 55) return 'Neutral';
  if (score <= 75) return 'Greed';
  return 'Extreme Greed';
}

export async function GET() {
  if (_cache && Date.now() - _cache.at < TTL) return NextResponse.json(_cache.data);
  try {
    const r = await fetch(
      'https://api.alternative.me/fng/?limit=366&format=json',
      { signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const pts: Array<{ value: string; value_classification: string }> = j.data;
    if (!Array.isArray(pts) || pts.length === 0) throw new Error('Empty data');

    const parse = (i: number) => {
      const p = pts[Math.min(i, pts.length - 1)];
      const s = parseInt(p.value, 10);
      return { score: s, rating: classify(s) };
    };

    const data: FearGreedData = {
      score:   parse(0).score,
      rating:  parse(0).rating,
      prev1w:  parse(7),
      prev1m:  parse(30),
      prev1y:  parse(365),
      source:  'crypto',
      fetchedAt: new Date().toISOString(),
    };
    _cache = { data, at: Date.now() };
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
