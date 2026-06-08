import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

const TTL = 60 * 60 * 1000;
const UA  = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
let _cache: { data: object; at: number } | null = null;

export interface MeetingProb {
  date:   string;           // YYYY-MM-DD (announcement day)
  probs:  Array<{ rate: number; prob: number }>; // rate in %, prob 0-100
}
export interface FedWatchData {
  currentRate:  number | null;
  meetings:     MeetingProb[];
  fetchedAt:    string;
  source:       'cme' | 'unavailable';
}

async function fetchCurrentRate(key: string): Promise<number | null> {
  try {
    const r = await fetch(
      `https://api.stlouisfed.org/fred/series/observations?series_id=DFEDTARMID&api_key=${key}&limit=1&sort_order=desc&file_type=json`,
      { signal: AbortSignal.timeout(7000) },
    );
    if (!r.ok) return null;
    const j = await r.json();
    const obs = j.observations?.[0];
    return obs?.value && obs.value !== '.' ? parseFloat(obs.value) : null;
  } catch { return null; }
}

// CME FedWatch API — returns probability data per upcoming meeting
async function fetchCMEProbs(): Promise<MeetingProb[]> {
  try {
    const r = await fetch('https://www.cmegroup.com/CmeWS/mvc/Meeting/probability', {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Referer: 'https://www.cmegroup.com/',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return [];
    const j = await r.json();

    // CME returns array of meetings with probability arrays
    // Each item: { meetingDate, probability: [{ strikePct, probability }] }
    if (!Array.isArray(j)) return [];
    return j.slice(0, 4).map((m: { meetingDate?: string; probability?: Array<{ strikePct?: string; probability?: string }> }) => ({
      date:  m.meetingDate ?? '',
      probs: (m.probability ?? []).map((p) => ({
        rate: parseFloat(p.strikePct ?? '0') / 100,
        prob: parseFloat(p.probability ?? '0'),
      })).filter((p) => isFinite(p.rate) && isFinite(p.prob)),
    })).filter((m) => m.date && m.probs.length > 0);
  } catch { return []; }
}

export async function GET() {
  if (_cache && Date.now() - _cache.at < TTL) return NextResponse.json(_cache.data);
  const key = process.env.FRED_API_KEY?.trim() ?? '';

  const [currentRate, meetings] = await Promise.all([fetchCurrentRate(key), fetchCMEProbs()]);

  const data: FedWatchData = {
    currentRate,
    meetings,
    fetchedAt: new Date().toISOString(),
    source: meetings.length > 0 ? 'cme' : 'unavailable',
  };
  _cache = { data, at: Date.now() };
  return NextResponse.json(data);
}
