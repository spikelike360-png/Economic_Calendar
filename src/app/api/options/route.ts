import { NextResponse } from 'next/server';
import { memCache } from '@/lib/scraper/cache';
import { buildGEX, type RawOpt } from '@/lib/gexCalc';
import YahooFinanceLib from 'yahoo-finance2';
import type {
  OptionsFlowResponse,
  VIXTermStructure,
  VIXHistoryPoint,
  OptionsChainSummary,
  UnusualOption,
  GEXData,
} from '@/lib/types';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'options_v8';
const CACHE_TTL = 15 * 60 * 1000;

const VIX_INDICES    = ['VIX9D', 'VIX', 'VIX3M', 'VIX6M', 'VVIX'] as const;
const OPTION_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'GLD', 'TLT'] as const;
const GEX_SYMBOLS    = ['SPY', 'QQQ'] as const;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── yahoo-finance2 instance ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _yf: any = null;
function getYF() {
  if (!_yf) {
    const YF = (YahooFinanceLib as unknown as { default?: typeof YahooFinanceLib }).default ?? YahooFinanceLib;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    _yf = new (YF as any)({ suppressNotices: ['yahooSurvey'] });
  }
  return _yf;
}

// ── CBOE VIX CSV ─────────────────────────────────────────────────────────

function parseCboeCsv(text: string): { date: string; close: number }[] {
  const lines = text.trim().split('\n');
  const out: { date: string; close: number }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].split(',');
    if (p.length < 5) continue;
    const raw   = p[0].replace(/"/g, '').trim();
    const close = parseFloat(p[4].replace(/"/g, '').trim());
    if (isNaN(close)) continue;
    const [mm, dd, yyyy] = raw.split('/');
    if (!mm || !dd || !yyyy) continue;
    out.push({ date: `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`, close });
  }
  return out;
}

async function fetchVixCsv(index: string): Promise<{ date: string; close: number }[] | null> {
  try {
    const res = await fetch(
      `https://cdn.cboe.com/api/global/us_indices/daily_prices/${index}_History.csv`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) return null;
    return parseCboeCsv(await res.text());
  } catch { return null; }
}

// ── Types from yahoo-finance2 response ────────────────────────────────────

interface YFOption {
  strike: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  expiration: Date | number; // yahoo-finance2 returns Date
}

interface YFOptionsResult {
  quote?: { regularMarketPrice?: number };
  expirationDates?: (Date | number)[];
  options?: { calls?: YFOption[]; puts?: YFOption[] }[];
}

// Yahoo Finance stores expiry as midnight UTC; options actually expire at market close (~20:00 UTC).
// Add 20h so T stays positive during the trading day on expiry day.
function toUnixSec(val: Date | number | undefined): number {
  if (!val) return 0;
  const ms = val instanceof Date ? val.getTime() : val * 1000;
  return Math.floor(ms / 1000) + 20 * 3600; // + 20 hours
}

// ── Flow chain (nearest expiry) ───────────────────────────────────────────

async function fetchYahooChain(symbol: string): Promise<OptionsChainSummary | null> {
  try {
    const yf     = getYF();
    const result = (await yf.options(symbol, {}, { validateResult: false })) as YFOptionsResult | null;
    if (!result) return null;

    const price: number = result.quote?.regularMarketPrice ?? 0;
    const opts          = result.options?.[0];
    if (!opts) return null;

    const calls: YFOption[] = opts.calls ?? [];
    const puts:  YFOption[] = opts.puts  ?? [];

    const callsVol = calls.reduce((s, c) => s + (c.volume ?? 0), 0);
    const putsVol  = puts.reduce((s, p)  => s + (p.volume ?? 0), 0);
    const callsOI  = calls.reduce((s, c) => s + (c.openInterest ?? 0), 0);
    const putsOI   = puts.reduce((s, p)  => s + (p.openInterest ?? 0), 0);

    const expiryDate = calls[0]?.expiration;
    const expiry     = expiryDate
      ? new Date(expiryDate instanceof Date ? expiryDate.getTime() : expiryDate * 1000).toISOString().slice(0, 10)
      : '';

    const MIN_VOL = 200, MIN_RATIO = 0.5;
    const unusual: UnusualOption[] = [];

    for (const c of calls) {
      const vol = c.volume ?? 0, oi = c.openInterest ?? 1;
      if (vol >= MIN_VOL && vol / oi >= MIN_RATIO)
        unusual.push({ symbol, strike: c.strike, type: 'call', expiry, volume: vol, openInterest: oi,
          ratio: parseFloat((vol / oi).toFixed(2)), iv: parseFloat(((c.impliedVolatility ?? 0) * 100).toFixed(1)) });
    }
    for (const p of puts) {
      const vol = p.volume ?? 0, oi = p.openInterest ?? 1;
      if (vol >= MIN_VOL && vol / oi >= MIN_RATIO)
        unusual.push({ symbol, strike: p.strike, type: 'put', expiry, volume: vol, openInterest: oi,
          ratio: parseFloat((vol / oi).toFixed(2)), iv: parseFloat(((p.impliedVolatility ?? 0) * 100).toFixed(1)) });
    }
    unusual.sort((a, b) => b.volume - a.volume);

    return {
      symbol, price, expiryDate: expiry,
      callsVolume: callsVol, putsVolume: putsVol, callsOI, putsOI,
      pcVolume: callsVol > 0 ? parseFloat((putsVol / callsVol).toFixed(2)) : 0,
      pcOI:     callsOI  > 0 ? parseFloat((putsOI  / callsOI).toFixed(2))  : 0,
      unusual: unusual.slice(0, 8),
    };
  } catch (err) {
    console.warn(`[options] chain ${symbol} failed:`, err);
    return null;
  }
}

// ── GEX: multi-expiry ─────────────────────────────────────────────────────

async function fetchGEXSymbol(symbol: string): Promise<GEXData | null> {
  try {
    const yf     = getYF();
    const base   = (await yf.options(symbol, {}, { validateResult: false })) as YFOptionsResult | null;
    if (!base) return null;

    const spot: number = base.quote?.regularMarketPrice ?? 0;
    if (!spot) return null;

    const now       = Date.now();
    const todayEOD  = new Date(); todayEOD.setUTCHours(23, 59, 59, 999);
    const expDates  = (base.expirationDates ?? [])
      .filter((d) => {
        const ms = d instanceof Date ? d.getTime() : d * 1000;
        return ms > todayEOD.getTime(); // skip today and past expiries
      });

    // Yahoo Finance uses 0.00001 as floor IV when data is unavailable (not null).
    // Filter: IV must be >= 1% (0.01) to be a real value — near-zero IV → bsGamma blows up.
    const toRaw = (arr: YFOption[]): RawOpt[] =>
      arr
        .filter((o) => (o.impliedVolatility ?? 0) >= 0.01 && (o.openInterest ?? 0) > 0)
        .map((o) => ({
          strike:            o.strike,
          openInterest:      o.openInterest!,
          impliedVolatility: o.impliedVolatility!,
          expiration:        toUnixSec(o.expiration),
        }));

    // Fetch 3 nearest future expiries in parallel
    const allCalls: RawOpt[] = [];
    const allPuts:  RawOpt[] = [];

    const expBatches = await Promise.all(
      expDates.slice(0, 3).map(async (expDate) => {
        try {
          const d = expDate instanceof Date ? expDate : new Date(expDate * 1000);
          const r = (await yf.options(symbol, { date: d }, { validateResult: false })) as YFOptionsResult | null;
          return r?.options?.[0] ?? null;
        } catch { return null; }
      }),
    );

    // Include base (nearest expiry) — toUnixSec adds 20h so same-day expiry has T > 0 until close
    const baseOpts = base.options?.[0];
    if (baseOpts) {
      allCalls.push(...toRaw(baseOpts.calls ?? []));
      allPuts.push(...toRaw(baseOpts.puts   ?? []));
    }

    const extra = expBatches;

    for (const e of extra) {
      if (!e) continue;
      allCalls.push(...toRaw(e.calls ?? []));
      allPuts.push(...toRaw(e.puts   ?? []));
    }

    const gex = buildGEX(allCalls, allPuts, spot);
    return { symbol, ...gex };
  } catch (err) {
    console.warn(`[options] GEX ${symbol} failed:`, err);
    return null;
  }
}

// ── Route ─────────────────────────────────────────────────────────────────

export async function GET() {
  const cached = memCache.get<OptionsFlowResponse>(CACHE_KEY);
  if (cached && !cached.isStale) return NextResponse.json(cached.data);

  const [vixResults, chainResults, gexResults] = await Promise.all([
    Promise.all(VIX_INDICES.map(fetchVixCsv)),
    Promise.all(OPTION_SYMBOLS.map(fetchYahooChain)),
    Promise.all(GEX_SYMBOLS.map(fetchGEXSymbol)),
  ]);

  const [vix9dData, vixData, vix3mData, vix6mData, vvixData] = vixResults;

  const lastOf = (d: { date: string; close: number }[] | null) =>
    d?.length ? d[d.length - 1] : null;

  const vixLatest = lastOf(vixData);
  const vix: VIXTermStructure = {
    date:  vixLatest?.date ?? '',
    vix9d: lastOf(vix9dData)?.close  ?? null,
    vix:   vixLatest?.close          ?? null,
    vix3m: lastOf(vix3mData)?.close  ?? null,
    vix6m: lastOf(vix6mData)?.close  ?? null,
    vvix:  lastOf(vvixData)?.close   ?? null,
  };

  const vixHistory: VIXHistoryPoint[] = (vixData ?? [])
    .slice(-60)
    .map((r) => ({ date: r.date, close: r.close }));

  const chains = chainResults.filter((c): c is OptionsChainSummary => c !== null);
  const gex    = gexResults.filter((g): g is GEXData => g !== null);

  console.log(`[options] chains=${chains.length} gex=${gex.length} vix=${vixHistory.length}`);

  const response: OptionsFlowResponse = { vix, vixHistory, chains, gex, fetchedAt: new Date().toISOString() };

  // Use shorter TTL when GEX has no OI data so it refreshes faster once market opens
  const hasGexData = gex.some((g) => g.strikes.length > 0);
  const ttl        = hasGexData ? CACHE_TTL : 3 * 60 * 1000; // 3 min when no OI

  if (chains.length > 0 || vixHistory.length > 0 || gex.length > 0) {
    memCache.set(CACHE_KEY, response, ttl);
  }

  const cdnMaxAge = hasGexData ? 900 : 180; // 3 min CDN TTL when no OI
  return NextResponse.json(response, {
    headers: { 'Cache-Control': `public, s-maxage=${cdnMaxAge}, stale-while-revalidate=3600` },
  });
}
