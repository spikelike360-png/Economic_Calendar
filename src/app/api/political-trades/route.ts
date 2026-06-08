import { NextResponse } from 'next/server';
import { get as nodeGet } from 'https';
import type { RequestOptions } from 'https';

export const dynamic = 'force-dynamic';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PoliticalTrade {
  id:                string;
  chamber:           'house' | 'senate';
  politician:        string;
  party:             string;
  state:             string;
  ticker:            string;
  assetDescription:  string;
  assetType:         string;
  transactionType:   'purchase' | 'sale' | 'sale_partial' | 'exchange' | 'unknown';
  amount:            string;
  tradeDate:         string;
  disclosureDate:    string;
  disclosureLagDays: number;
}

export interface PoliticalTradesResponse {
  trades:     PoliticalTrade[];
  fetchedAt:  string;
  source:     'live' | 'cache' | 'error';
  error?:     string;
  errorType?: 'setup_required' | 'fetch_failed';
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL = 60 * 60 * 1000;
let memCache: { data: PoliticalTrade[]; ts: number } | null = null;

// ── Tickers to query ──────────────────────────────────────────────────────────
// Congress members trade these most frequently

const CONGRESS_TICKERS = [
  // Tech
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','TSLA','AMD','INTC','QCOM','CRM','ORCL','NFLX',
  // Finance
  'JPM','BAC','WFC','GS','MS','V','MA','C','AXP','BRK.B',
  // Defense
  'RTX','LMT','NOC','GD','BA','HII',
  // Healthcare
  'JNJ','PFE','UNH','CVS','MRK','ABBV','LLY',
  // Energy
  'XOM','CVX','OXY','COP',
  // Consumer
  'DIS','SBUX','MCD','WMT','TGT','COST',
  // ETFs
  'SPY','QQQ','IWM','XLE','XLF','XLK',
];

// ── HTTP helper ───────────────────────────────────────────────────────────────

function fetchUrl(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const opts: RequestOptions = {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept':          'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        ...extraHeaders,
      },
    };
    const req = nodeGet(url, opts, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location, extraHeaders).then(resolve).catch(reject);
        return;
      }
      if (!res.statusCode || res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode ?? 0}`));
        return;
      }
      let data = '';
      res.on('data', (c: Buffer) => { data += c.toString(); });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function lagDays(trade: string, disclose: string): number {
  try {
    const t = new Date(trade    + 'T12:00:00Z').getTime();
    const d = new Date(disclose + 'T12:00:00Z').getTime();
    return Math.max(0, Math.round((d - t) / 86_400_000));
  } catch { return 0; }
}

function normalizeType(raw: string): PoliticalTrade['transactionType'] {
  const s = raw.toLowerCase().replace(/[\s_()\-]/g, '');
  if (s.includes('purchase') || s === 'buy') return 'purchase';
  if (s.includes('salepartial') || s.includes('partialsale')) return 'sale_partial';
  if (s.includes('sale') || s === 'sell') return 'sale';
  if (s.includes('exchange') || s.includes('recv')) return 'exchange';
  return 'unknown';
}

function normalizeChamber(raw: string | undefined): 'house' | 'senate' {
  if (!raw) return 'house';
  const c = raw.toLowerCase();
  return c.includes('senate') || c === 's' ? 'senate' : 'house';
}

function normalizeParty(raw: string | undefined): string {
  if (!raw) return '';
  const p = raw.toUpperCase().trim();
  if (p === 'D' || p.startsWith('DEM')) return 'Democrat';
  if (p === 'R' || p.startsWith('REP')) return 'Republican';
  return raw;
}

// ── Finnhub congressional trading ─────────────────────────────────────────────

interface FinnhubTrade {
  id?:              string;
  name?:            string;
  transaction?:     string; // "Buy" / "Sell" / "Purchase" / "Sale"
  transactionDate?: string; // "YYYY-MM-DD"
  filingDate?:      string;
  owner?:           string; // "Self" / "Spouse" / "Child"
  symbol?:          string;
  securityType?:    string;
  amount?:          string;
  comment?:         string;
  chamber?:         string;
  party?:           string;
  state?:           string;
}

interface FinnhubResp { data?: FinnhubTrade[]; symbol?: string; }

async function fetchFinnhubTicker(ticker: string, key: string, from: string): Promise<FinnhubTrade[]> {
  const url = `https://finnhub.io/api/v1/stock/congressional-trading?symbol=${encodeURIComponent(ticker)}&from=${from}&token=${key}`;
  const text = await fetchUrl(url);
  const json: FinnhubResp = JSON.parse(text);
  const rows = json.data ?? (Array.isArray(json) ? json as FinnhubTrade[] : []);
  return rows.map((t) => ({ ...t, symbol: t.symbol ?? ticker }));
}

async function fetchFinnhub(key: string): Promise<PoliticalTrade[]> {
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  const fromStr = from.toISOString().slice(0, 10);

  const results = await Promise.allSettled(
    CONGRESS_TICKERS.map((t) => fetchFinnhubTicker(t, key, fromStr)),
  );

  const raw: FinnhubTrade[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') raw.push(...r.value);
  }

  if (!raw.length) throw new Error('No data returned from Finnhub (all tickers empty)');

  // Deduplicate
  const seen = new Set<string>();
  const unique: FinnhubTrade[] = [];
  for (const t of raw) {
    const k = t.id ?? `${t.name}-${t.symbol}-${t.transactionDate}`;
    if (!seen.has(k)) { seen.add(k); unique.push(t); }
  }

  return unique
    .filter((t) => t.symbol && t.transactionDate)
    .map((t, i): PoliticalTrade => {
      const disclosure = t.filingDate ?? t.transactionDate ?? '';
      return {
        id:               t.id ?? `fh-${i}-${t.symbol}-${t.transactionDate}`,
        chamber:          normalizeChamber(t.chamber),
        politician:       t.name ?? 'Unknown',
        party:            normalizeParty(t.party),
        state:            t.state ?? '',
        ticker:           (t.symbol ?? '').toUpperCase(),
        assetDescription: [t.securityType, t.owner].filter(Boolean).join(' · '),
        assetType:        t.securityType ?? 'Stock',
        transactionType:  normalizeType(t.transaction ?? ''),
        amount:           t.amount ?? '',
        tradeDate:        t.transactionDate!,
        disclosureDate:   disclosure,
        disclosureLagDays: lagDays(t.transactionDate!, disclosure),
      };
    });
}

// ── Unusual Whales ────────────────────────────────────────────────────────────

interface UWTrade {
  id?:               string;
  politician?:       string;
  senator?:          string;
  representative?:   string;
  first_name?:       string;
  last_name?:        string;
  ticker?:           string;
  asset_description?: string;
  transaction_type?: string;
  type?:             string;
  amount?:           string;
  amount_range?:     string;
  transaction_date?: string;
  traded_at?:        string;
  filing_date?:      string;
  filed_at?:         string;
  chamber?:          string;
  party?:            string;
  state?:            string;
}

async function fetchUnusualWhales(key: string): Promise<PoliticalTrade[]> {
  const text = await fetchUrl('https://api.unusualwhales.com/api/congress/recent_trades?limit=500', {
    Authorization: `Bearer ${key}`,
  });
  const json = JSON.parse(text);
  const raw: UWTrade[] = json.data ?? json.trades ?? (Array.isArray(json) ? json : []);
  if (!raw.length) throw new Error('Unusual Whales returned empty data');

  return raw
    .filter((t) => (t.ticker || t.id))
    .map((t, i): PoliticalTrade => {
      const name = t.politician ?? t.senator ?? t.representative ??
        ((`${t.first_name ?? ''} ${t.last_name ?? ''}`.trim()) || 'Unknown');
      const ticker = (t.ticker ?? '').toUpperCase();
      const tradeDate = t.transaction_date ?? t.traded_at ?? '';
      const disclosureDate = t.filing_date ?? t.filed_at ?? tradeDate;
      return {
        id:               t.id ?? `uw-${i}-${ticker}-${tradeDate}`,
        chamber:          normalizeChamber(t.chamber),
        politician:       name,
        party:            normalizeParty(t.party),
        state:            t.state ?? '',
        ticker,
        assetDescription: t.asset_description ?? '',
        assetType:        'Stock',
        transactionType:  normalizeType(t.transaction_type ?? t.type ?? ''),
        amount:           t.amount_range ?? t.amount ?? '',
        tradeDate,
        disclosureDate,
        disclosureLagDays: lagDays(tradeDate, disclosureDate),
      };
    });
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  if (memCache && Date.now() - memCache.ts < CACHE_TTL) {
    return NextResponse.json<PoliticalTradesResponse>({
      trades: memCache.data, fetchedAt: new Date(memCache.ts).toISOString(), source: 'cache',
    });
  }

  const uwKey       = process.env.UNUSUAL_WHALES_API_KEY?.trim();
  const finnhubKey  = process.env.FINNHUB_API_KEY?.trim();
  const fmpKey      = process.env.FMP_API_KEY?.trim();

  let trades: PoliticalTrade[] = [];
  const errors: string[] = [];

  // Strategy 1: Unusual Whales
  if (uwKey) {
    try { trades = await fetchUnusualWhales(uwKey); }
    catch (e) { errors.push(`UW: ${(e as Error).message}`); }
  }

  // Strategy 2: Finnhub (premium plan required)
  if (!trades.length && finnhubKey) {
    try { trades = await fetchFinnhub(finnhubKey); }
    catch (e) { errors.push(`Finnhub: ${(e as Error).message}`); }
  }

  // FMP placeholder (add fetchFMP() if user has FMP key)
  if (!trades.length && fmpKey) {
    errors.push('FMP: not yet implemented — contact support');
  }

  if (!trades.length) {
    return NextResponse.json<PoliticalTradesResponse>({
      trades: [], fetchedAt: new Date().toISOString(), source: 'error',
      errorType: errors.length ? 'fetch_failed' : 'setup_required',
      error: errors.join(' · ') || 'No API keys configured',
    }, { status: 502 });
  }

  trades.sort((a, b) => {
    const d = b.disclosureDate.localeCompare(a.disclosureDate);
    return d !== 0 ? d : b.tradeDate.localeCompare(a.tradeDate);
  });

  const result = trades.slice(0, 500);
  const now = Date.now();
  memCache = { data: result, ts: now };

  return NextResponse.json<PoliticalTradesResponse>({
    trades: result, fetchedAt: new Date(now).toISOString(), source: 'live',
  }, { headers: { 'X-Data-Source': 'Finnhub' } });
}
