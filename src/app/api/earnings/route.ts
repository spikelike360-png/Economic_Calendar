import { NextResponse } from 'next/server';
import type { EarningsEvent, EarningsResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

const MIN_MARKET_CAP = 2e9;
const FINNHUB_BASE   = 'https://finnhub.io/api/v1';

let memCache: { data: EarningsResponse; ts: number } | null = null;
const CACHE_TTL = 4 * 60 * 60 * 1000;

// ── exchange heuristic ───────────────────────────────────────────────────────
const NYSE_OVERRIDES    = new Set(['UBER','LYFT','SNAP','PINS','HOOD','AFRM','RIVN','LCID','COIN','PATH','DDOG','ZS','CRWD','NET','SNOW','PLTR','RBLX','U','BMBL','ABNB']);
const NASDAQ_OVERRIDES  = new Set(['V','MA','BRK','BX','KKR','APO','MSCI','ICE','CME','CBOE']);

function detectExchange(symbol: string): EarningsEvent['exchange'] {
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, '');
  if (NYSE_OVERRIDES.has(s))   return 'NYSE';
  if (NASDAQ_OVERRIDES.has(s)) return 'NASDAQ';
  if (s.length <= 3) return 'NYSE';
  if (s.length <= 5) return 'NASDAQ';
  return 'OTHER';
}

// ── helpers ──────────────────────────────────────────────────────────────────
function parseMarketCap(str: string | null | undefined): number {
  if (!str) return 0;
  const s = str.replace(/[$,\s]/g, '');
  if (s.endsWith('T')) return parseFloat(s) * 1e12;
  if (s.endsWith('B')) return parseFloat(s) * 1e9;
  if (s.endsWith('M')) return parseFloat(s) * 1e6;
  return parseFloat(s) || 0;
}

function parseTime(raw: string | null | undefined): EarningsEvent['time'] {
  if (!raw) return 'unknown';
  const r = raw.toLowerCase();
  if (r.includes('pre') || r === 'bmo') return 'pre-market';
  if (r.includes('after') || r.includes('amc') || r.includes('post')) return 'after-hours';
  return 'unknown';
}

function formatFiscalQuarter(raw: string | null | undefined): string {
  if (!raw) return '';
  if (raw.includes('/')) {
    const [m, y] = raw.split('/');
    const months: Record<string, string> = {
      '01':'Jan','02':'Feb','03':'Mar','04':'Apr','05':'May','06':'Jun',
      '07':'Jul','08':'Aug','09':'Sep','10':'Oct','11':'Nov','12':'Dec',
    };
    return `${months[m] ?? m} ${y}`;
  }
  return raw;
}

function getWeekDates(): string[] {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  const dates: string[] = [];
  for (let w = 0; w < 2; w++) {
    for (let d = 0; d < 5; d++) {
      const dt = new Date(mon);
      dt.setDate(mon.getDate() + w * 7 + d);
      dates.push(dt.toISOString().slice(0, 10));
    }
  }
  return dates;
}

// ── Finnhub: EPS actual + estimate for a date range ─────────────────────────
interface FinnhubEPS {
  symbol: string;
  date: string;
  epsActual: number | null;
  epsEstimate: number | null;
  revenueActual: number | null;
  revenueEstimate: number | null;
  hour: string; // "bmo" | "amc" | "dmh"
  quarter: number;
  year: number;
}

async function fetchFinnhubEPS(from: string, to: string, apiKey: string): Promise<Map<string, FinnhubEPS>> {
  const map = new Map<string, FinnhubEPS>();
  try {
    const url = `${FINNHUB_BASE}/calendar/earnings?from=${from}&to=${to}&token=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(7_000) });
    if (!res.ok) {
      console.warn(`[earnings] Finnhub HTTP ${res.status}`);
      return map;
    }
    const json = await res.json();
    const items: FinnhubEPS[] = json?.earningsCalendar ?? [];
    for (const item of items) {
      map.set(`${item.symbol}::${item.date}`, item);
    }
  } catch (err) {
    console.warn('[earnings] Finnhub fetch failed:', err instanceof Error ? err.message : err);
  }
  return map;
}

// ── Nasdaq: company names + market caps + timing ─────────────────────────────
async function fetchNasdaqDay(date: string): Promise<Map<string, { name: string; marketCap: string; marketCapValue: number; time: string; fiscalQuarter: string }>> {
  const map = new Map<string, { name: string; marketCap: string; marketCapValue: number; time: string; fiscalQuarter: string }>();
  try {
    const res = await fetch(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return map;
    const json = await res.json();
    const rows: Record<string, string>[] = json?.data?.rows ?? [];
    for (const r of rows) {
      if (!r.symbol) continue;
      map.set(r.symbol, {
        name:           r.name ?? r.symbol,
        marketCap:      r.marketCap ?? '',
        marketCapValue: parseMarketCap(r.marketCap),
        time:           r.time ?? '',
        fiscalQuarter:  formatFiscalQuarter(r.fiscalQuarterEnding),
      });
    }
  } catch { /* silent */ }
  return map;
}

function fmtRevenue(n: number | null): string | null {
  if (n === null) return null;
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9)  return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6)  return `${(n / 1e6).toFixed(1)}M`;
  return String(n);
}

export async function GET() {
  if (memCache && Date.now() - memCache.ts < CACHE_TTL) {
    return NextResponse.json(memCache.data);
  }

  const finnhubKey = process.env.FINNHUB_API_KEY?.trim();
  const dates      = getWeekDates();
  const from       = dates[0];
  const to         = dates[dates.length - 1];

  // Parallel: Finnhub (full range) + Nasdaq (per day)
  const [finnhubMap, ...nasdaqMaps] = await Promise.all([
    finnhubKey
      ? fetchFinnhubEPS(from, to, finnhubKey)
      : Promise.resolve(new Map<string, FinnhubEPS>()),
    ...dates.map(fetchNasdaqDay),
  ]);

  const events: EarningsEvent[] = [];

  for (let i = 0; i < dates.length; i++) {
    const date      = dates[i];
    const nasdaqDay = nasdaqMaps[i];

    // Collect symbols: union of Nasdaq + Finnhub for this date
    const symbols = new Set<string>(Array.from(nasdaqDay.keys()));
    Array.from(finnhubMap.keys()).forEach((key) => {
      const [sym, d] = key.split('::');
      if (d === date) symbols.add(sym);
    });

    for (const symbol of Array.from(symbols)) {
      const nasdaq  = nasdaqDay.get(symbol);
      const finnhub = finnhubMap.get(`${symbol}::${date}`);

      const marketCapValue = nasdaq?.marketCapValue ?? 0;
      if (marketCapValue < MIN_MARKET_CAP && !finnhub) continue;

      const epsEstimate = finnhub?.epsEstimate != null
        ? String(finnhub.epsEstimate)
        : null;
      const epsActual = finnhub?.epsActual != null
        ? String(finnhub.epsActual)
        : null;

      const revActual  = fmtRevenue(finnhub?.revenueActual  ?? null);
      const revEstimate = fmtRevenue(finnhub?.revenueEstimate ?? null);

      events.push({
        symbol,
        name:         nasdaq?.name ?? symbol,
        date,
        time:         parseTime(finnhub?.hour ?? nasdaq?.time),
        fiscalQuarter: nasdaq?.fiscalQuarter
          ?? (finnhub ? `Q${finnhub.quarter} ${finnhub.year}` : ''),
        epsEstimate,
        epsActual,
        lastYearEPS:  null,
        marketCap:    nasdaq?.marketCap ?? null,
        marketCapValue,
        exchange:     detectExchange(symbol),
        revenueActual:  revActual,
        revenueEstimate: revEstimate,
      });
    }
  }

  // Sort each date by market cap desc
  events.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return b.marketCapValue - a.marketCapValue;
  });

  const data: EarningsResponse = { events, fetchedAt: new Date().toISOString() };
  memCache = { data, ts: Date.now() };
  return NextResponse.json(data);
}
