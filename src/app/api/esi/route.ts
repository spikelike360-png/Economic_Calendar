import { NextRequest, NextResponse } from 'next/server';
import { readCalendarDiskCache } from '@/lib/scraper/calendarDiskCache';
import type { Currency } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

const CURRENCY_INFO: Record<Currency, { flag: string; name: string }> = {
  USD: { flag: '🇺🇸', name: 'United States' },
  EUR: { flag: '🇩🇪', name: 'Euro Area'     },
  GBP: { flag: '🇬🇧', name: 'United Kingdom'},
  JPY: { flag: '🇯🇵', name: 'Japan'         },
  CAD: { flag: '🇨🇦', name: 'Canada'        },
  AUD: { flag: '🇦🇺', name: 'Australia'     },
};

export interface ESIPoint {
  date: string;   // YYYY-MM-DD (week ending)
  score: number;  // -100 to 100
}

export interface ESICurrency {
  currency: Currency;
  flag: string;
  name: string;
  score: number;       // current window score
  beatCount: number;
  missCount: number;
  inlineCount: number; // |surprise| < 0.3 stdev
  totalReleases: number;
  points: ESIPoint[];  // weekly sparkline
}

export interface ESIResponse {
  results: ESICurrency[];
  fetchedAt: string;
  windowDays: number;
}

// Parse "4.3%", "25.9K", "-0.5", "1.2B" → number in same relative units
function parseVal(s: string | null): number | null {
  if (!s) return null;
  const match = s.trim().match(/^([+-]?[\d,]+\.?\d*)\s*[%KMBkmb]?$/);
  if (!match) return null;
  const n = parseFloat(match[1].replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function stdev(arr: number[]): number {
  if (arr.length < 2) return 1;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
  return Math.sqrt(variance) || 1;
}

function impactWeight(impact: string): number {
  if (impact === 'high')   return 3;
  if (impact === 'medium') return 2;
  return 1;
}

function dateMinusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const windowDays = parseInt(req.nextUrl.searchParams.get('window') ?? '90');
  const events = readCalendarDiskCache();

  // Only released events with both actual and forecast
  const usable = events.filter(
    (e) => e.isReleased && e.actual && e.forecast && CURRENCIES.includes(e.currency as Currency),
  );

  // Build per-title historical surprise list (ALL history) for stdev normalisation
  const histByTitle = new Map<string, number[]>();
  for (const ev of usable) {
    const a = parseVal(ev.actual);
    const f = parseVal(ev.forecast);
    if (a === null || f === null) continue;
    const key = ev.title.toLowerCase();
    if (!histByTitle.has(key)) histByTitle.set(key, []);
    histByTitle.get(key)!.push(a - f);
  }

  // Compute weekly sparkline points (last 26 weeks, 4-week trailing window each)
  function weeklyPoints(currency: Currency): ESIPoint[] {
    const points: ESIPoint[] = [];
    for (let w = 25; w >= 0; w--) {
      const endDate   = dateMinusDays(w * 7);
      const startDate = dateMinusDays(w * 7 + 28);
      const slice = usable.filter(
        (e) => e.currency === currency && e.date >= startDate && e.date <= endDate,
      );
      let wSum = 0; let wCount = 0;
      for (const ev of slice) {
        const a = parseVal(ev.actual);
        const f = parseVal(ev.forecast);
        if (a === null || f === null) continue;
        const hist = histByTitle.get(ev.title.toLowerCase()) ?? [a - f];
        const z    = Math.max(-3, Math.min(3, (a - f) / stdev(hist)));
        const w2   = impactWeight(ev.impact);
        wSum += z * w2; wCount += w2;
      }
      const score = wCount > 0 ? Math.round((wSum / wCount / 3) * 100) : 0;
      points.push({ date: endDate, score });
    }
    return points;
  }

  const windowStart = dateMinusDays(windowDays);
  const recent = usable.filter((e) => e.date >= windowStart);

  const results: ESICurrency[] = CURRENCIES.map((currency) => {
    const evs = recent.filter((e) => e.currency === currency);

    let wSum = 0; let wCount = 0;
    let beatCount = 0; let missCount = 0; let inlineCount = 0;

    for (const ev of evs) {
      const a = parseVal(ev.actual);
      const f = parseVal(ev.forecast);
      if (a === null || f === null) continue;
      const hist = histByTitle.get(ev.title.toLowerCase()) ?? [a - f];
      const sd   = stdev(hist);
      const z    = Math.max(-3, Math.min(3, (a - f) / sd));
      const wt   = impactWeight(ev.impact);
      wSum += z * wt; wCount += wt;
      if      (z >  0.3) beatCount++;
      else if (z < -0.3) missCount++;
      else               inlineCount++;
    }

    const score = wCount > 0 ? Math.round((wSum / wCount / 3) * 100) : 0;

    return {
      currency,
      ...CURRENCY_INFO[currency],
      score,
      beatCount,
      missCount,
      inlineCount,
      totalReleases: evs.filter((e) => parseVal(e.actual) !== null && parseVal(e.forecast) !== null).length,
      points: weeklyPoints(currency),
    };
  });

  return NextResponse.json(
    { results, fetchedAt: new Date().toISOString(), windowDays } satisfies ESIResponse,
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
