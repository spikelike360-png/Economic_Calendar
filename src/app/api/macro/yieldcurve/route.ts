import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

const TTL = 6 * 60 * 60 * 1000;
let _cache: { data: object; at: number } | null = null;

const SERIES = [
  { id: 'DGS1MO', label: '1M'  },
  { id: 'DGS3MO', label: '3M'  },
  { id: 'DGS6MO', label: '6M'  },
  { id: 'DGS1',   label: '1Y'  },
  { id: 'DGS2',   label: '2Y'  },
  { id: 'DGS3',   label: '3Y'  },
  { id: 'DGS5',   label: '5Y'  },
  { id: 'DGS7',   label: '7Y'  },
  { id: 'DGS10',  label: '10Y' },
  { id: 'DGS20',  label: '20Y' },
  { id: 'DGS30',  label: '30Y' },
];

export interface YieldPoint   { label: string; value: number }
export interface YieldCurveData {
  curve:      YieldPoint[];
  spread2_10: number | null;
  inverted:   boolean;
  fetchedAt:  string;
}

async function fetchSeries(id: string, key: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&limit=5&sort_order=desc&file_type=json`,
      { signal: AbortSignal.timeout(7000) },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const obs = (j.observations as Array<{ value: string }>).find((o) => o.value !== '.');
    return obs ? parseFloat(obs.value) : null;
  } catch { return null; }
}

export async function GET() {
  if (_cache && Date.now() - _cache.at < TTL) return NextResponse.json(_cache.data);
  const key = process.env.FRED_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: 'No FRED key' }, { status: 500 });
  try {
    const raw = await Promise.all(SERIES.map(async ({ id, label }) => ({ label, value: await fetchSeries(id, key) })));
    const curve = raw.filter((r): r is YieldPoint => r.value !== null);
    const y2    = curve.find((r) => r.label === '2Y')?.value  ?? null;
    const y10   = curve.find((r) => r.label === '10Y')?.value ?? null;
    const spread2_10 = y2 !== null && y10 !== null ? +(y10 - y2).toFixed(2) : null;
    const data: YieldCurveData = { curve, spread2_10, inverted: !!spread2_10 && spread2_10 < 0, fetchedAt: new Date().toISOString() };
    _cache = { data, at: Date.now() };
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
