import { NextRequest, NextResponse } from 'next/server';
import type { Currency, CalendarEvent } from '@/lib/types';
import { readCalendarDiskCache } from '@/lib/scraper/calendarDiskCache';
import { fetchTEHistoryTail } from '@/lib/scraper/tradingEconomicsApi';

export const dynamic = 'force-dynamic';

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

type MetricField = 'rate' | 'cpi' | 'unem' | 'gdp';

const SERIES: Record<Currency, Record<MetricField, { id: string; units?: string; quarterly?: boolean; daily?: boolean }>> = {
  USD: {
    rate: { id: 'FEDFUNDS' },
    cpi:  { id: 'CPIAUCSL',            units: 'pc1' },
    unem: { id: 'UNRATE' },
    gdp:  { id: 'A191RL1Q225SBEA',     quarterly: true },
  },
  EUR: {
    rate: { id: 'ECBDFR',              daily: true },   // daily series — needs frequency=m
    cpi:  { id: 'CP0000EZ19M086NEST',  units: 'pc1' },
    unem: { id: 'LRHUTTTTEZM156S' },
    gdp:  { id: 'CLVMEURSCAB1GQEA19',  units: 'pca', quarterly: true },
  },
  GBP: {
    rate: { id: 'IRSTCI01GBM156N' },
    cpi:  { id: 'GBRCPIALLMINMEI',     units: 'pc1' },
    unem: { id: 'LRHUTTTTGBM156S' },
    gdp:  { id: 'NAEXKP01GBQ657S',     quarterly: true },
  },
  JPY: {
    rate: { id: 'IRSTCI01JPM156N' },
    cpi:  { id: 'JPNCPIALLMINMEI',     units: 'pc1' }, // FRED stale at Jun 2021, TE tail supplements
    unem: { id: 'LRHUTTTTJPM156S' },
    gdp:  { id: 'NAEXKP01JPQ657S',     quarterly: true },
  },
  CAD: {
    rate: { id: 'IRSTCI01CAM156N' },
    cpi:  { id: 'CANCPIALLMINMEI',     units: 'pc1' },
    unem: { id: 'LRHUTTTTCAM156S' },
    gdp:  { id: 'NAEXKP01CAQ657S',     quarterly: true },
  },
  AUD: {
    rate: { id: 'IRSTCI01AUM156N' },
    cpi:  { id: 'AUSCPIALLQINMEI',     units: 'pc1', quarterly: true },
    unem: { id: 'LRHUTTTTAUM156S' },
    gdp:  { id: 'NAEXKP01AUQ657S',     quarterly: true },
  },
};

// Calendar event title patterns per field (mirrors calendarEnrich.ts)
const CAL_PATTERNS: Record<MetricField, {
  titlePatterns: string[];
  excludePatterns?: string[];
  monthOffset: number;
  quarterly?: boolean;
}[]> = {
  rate: [
    { titlePatterns: ['fed funds rate'],                                                                       monthOffset: 0 },
    { titlePatterns: ['deposit facility rate', 'deposit rate', 'ecb rate decision', 'main refinancing rate'],  monthOffset: 0 },
    { titlePatterns: ['official bank rate', 'boe rate decision', 'boe interest rate'],                        monthOffset: 0 },
    { titlePatterns: ['boj rate decision', 'boj policy rate', 'boj interest rate'],                           monthOffset: 0 },
    { titlePatterns: ['overnight rate', 'boc rate decision', 'boc interest rate'],                            monthOffset: 0 },
    { titlePatterns: ['cash rate', 'rba rate decision'],                                                       monthOffset: 0 },
  ],
  cpi: [
    { titlePatterns: ['german cpi y/y', 'german cpi m/m'],                                                    monthOffset: -1 },
    { titlePatterns: ['cpi y/y'],              excludePatterns: ['core'],                                     monthOffset: -1 },
    { titlePatterns: ['cpi flash y/y', 'flash cpi y/y'], excludePatterns: ['core'],                           monthOffset: -1 },
    { titlePatterns: ['national cpi y/y', 'tokyo cpi y/y'],                                                   monthOffset: -1 },
    { titlePatterns: ['trimmed mean cpi q/q'],                                                                 monthOffset: -3, quarterly: true },
  ],
  unem: [
    { titlePatterns: ['german unemployment change', 'german unemployment rate'],                               monthOffset: -1 },
    { titlePatterns: ['unemployment rate'],                                                                    monthOffset: -1 },
  ],
  gdp: [
    { titlePatterns: ['german prelim gdp q/q', 'german gdp q/q'],                                            monthOffset: -3, quarterly: true },
    { titlePatterns: ['advance gdp q/q', 'prelim gdp q/q', 'gdp q/q'], excludePatterns: ['m/m'],             monthOffset: -3, quarterly: true },
    { titlePatterns: ['gdp m/m'],                                                                              monthOffset: -2 },
  ],
};

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatPeriod(date: string, quarterly: boolean): string {
  if (!date.includes('-')) return date;
  const [year, month] = date.split('-').map(Number);
  if (quarterly) return `Q${Math.ceil(month / 3)} ${year}`;
  return `${MONTH_ABBR[month - 1]} ${year}`;
}

function derivePeriodFromEvent(eventDate: string, monthOffset: number, quarterly: boolean): string {
  const d = new Date(eventDate + 'T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + monthOffset);
  if (quarterly) return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  return `${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Extract extra data points from calendar events for a given currency+field
function calendarPoints(events: CalendarEvent[], currency: Currency, field: MetricField): HistoryPoint[] {
  const patterns = CAL_PATTERNS[field];
  const results: HistoryPoint[] = [];

  for (const ev of events) {
    if (ev.currency !== currency) continue;
    if (!ev.actual || !ev.isReleased) continue;
    const titleLc = ev.title.toLowerCase();

    for (const pat of patterns) {
      if (!pat.titlePatterns.some((p) => titleLc.includes(p))) continue;
      if (pat.excludePatterns?.some((p) => titleLc.includes(p))) continue;
      const val = parseFloat(ev.actual.replace('%', '').trim());
      if (isNaN(val)) continue;
      results.push({
        date: ev.date,
        value: val,
        period: derivePeriodFromEvent(ev.date, pat.monthOffset, pat.quarterly ?? false),
        fromCalendar: true,
      });
      break;
    }
  }

  // Deduplicate by period, keep most recent event date
  const byPeriod = new Map<string, HistoryPoint>();
  for (const pt of results) {
    const existing = byPeriod.get(pt.period);
    if (!existing || pt.date > existing.date) byPeriod.set(pt.period, pt);
  }
  return Array.from(byPeriod.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export interface HistoryPoint {
  date: string;
  value: number;
  period: string;
  fromCalendar?: boolean;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const currency = searchParams.get('currency') as Currency | null;
  const field    = searchParams.get('field') as MetricField | null;

  if (!currency || !field || !SERIES[currency]?.[field]) {
    return NextResponse.json({ error: 'Invalid currency or field' }, { status: 400 });
  }

  const apiKey = process.env.FRED_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'No FRED API key' }, { status: 500 });

  const cfg   = SERIES[currency][field];
  const limit = cfg.quarterly ? '40' : '120'; // 10 years monthly / ~10 years quarterly

  try {
    const params = new URLSearchParams({
      series_id:  cfg.id,
      api_key:    apiKey,
      file_type:  'json',
      sort_order: 'desc',
      limit,
      ...(cfg.units      ? { units: cfg.units }         : {}),
      ...(cfg.daily      ? { frequency: 'm' }           : {}), // aggregate daily series to monthly
      ...(!cfg.quarterly && !cfg.daily ? { frequency: 'm' } : {}), // enforce monthly for all non-quarterly
      ...(cfg.quarterly  ? { frequency: 'q' }           : {}),
    });

    const res = await fetch(`${FRED_BASE}?${params}`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return NextResponse.json({ error: `FRED error ${res.status}` }, { status: 502 });

    const json = await res.json();
    const fredPoints: HistoryPoint[] = (json.observations ?? [])
      .filter((o: { value: string }) => o.value !== '.' && o.value !== '')
      .map((o: { date: string; value: string }) => ({
        date:   o.date,
        value:  parseFloat(parseFloat(o.value).toFixed(3)),
        period: formatPeriod(o.date, cfg.quarterly ?? false),
      }))
      .reverse();

    // Tail: TE recent points + calendar actuals, both newer than last FRED point
    const lastFredDate = fredPoints.length > 0 ? fredPoints[fredPoints.length - 1].date : '0000-00-00';

    const [teTail, calEvents] = await Promise.all([
      fetchTEHistoryTail(currency, field),
      Promise.resolve(readCalendarDiskCache()),
    ]);

    const calPts = calendarPoints(calEvents, currency, field).filter((p) => p.date > lastFredDate);
    const tePts  = teTail.filter((p) => p.date > lastFredDate).map((p) => ({ ...p, fromCalendar: true as const }));

    // Merge: deduplicate by period, prefer TE over calendar
    const tailByPeriod = new Map<string, HistoryPoint>();
    for (const pt of [...calPts, ...tePts]) {
      tailByPeriod.set(pt.period, pt);
    }
    const tail = Array.from(tailByPeriod.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Final dedup by period across FRED + tail (tail wins — more current)
    const byPeriod = new Map<string, HistoryPoint>();
    for (const pt of [...fredPoints, ...tail]) byPeriod.set(pt.period, pt);
    const points = Array.from(byPeriod.values()).sort((a, b) => a.date.localeCompare(b.date));

    return NextResponse.json({ points }, {
      headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=300' },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
