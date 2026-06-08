import { NextResponse } from 'next/server';
import { get as nodeGet } from 'https';
import type { RequestOptions } from 'https';

export const dynamic = 'force-dynamic';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CyclePhase =
  | 'capitulation_recovery'   // 80–100: best buy zones ever
  | 'deep_value'              // 60–80:  historically good entry
  | 'early_value'             // 40–60:  getting interesting
  | 'neutral'                 // 25–40:  wait & see
  | 'distribution';           // 0–25:   risky to buy

export interface BtcMetrics {
  price:           number;
  priceChg24:      number;
  sma200:          number;
  priceToSma200:   number;
  // CheckOnChain real on-chain data
  mvrvRatio:       number | null;   // Standard MVRV ratio (current/realized)
  mvrvPlus1SD:     number | null;   // +1 standard deviation band
  mvrvPlus2SD:     number | null;   // +2 std dev = "euphoria" zone
  conditionSum:    number | null;   // CheckOnChain composite oscillator (-4 to +4)
  puellOscillator: number | null;   // Puell Multiple normalized oscillator
  fearGreed:       number;
  fearGreedLabel:  string;
  cycleScore:      number;          // 0–100 (higher = more buy opportunity)
  cyclePhase:      CyclePhase;
  priceHistory:    { t: number; v: number }[];
  fetchedAt:       string;
  source:          'live' | 'partial' | 'error';
  errors:          string[];
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL = 30 * 60 * 1000;
let memCache: { data: BtcMetrics; ts: number } | null = null;

// ── HTTP helper ───────────────────────────────────────────────────────────────

function fetchRaw(url: string, extraHeaders: Record<string, string> = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const opts: RequestOptions = {
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept':          '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...extraHeaders,
      },
    };
    const req = nodeGet(url, opts, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchRaw(res.headers.location, extraHeaders).then(resolve).catch(reject);
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
    req.setTimeout(12_000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── CheckOnChain HTML parser ──────────────────────────────────────────────────
// Charts embed all data as Plotly binary (bdata = base64 float64 LE arrays)

function extractTrace(html: string, traceName: string): number[] | null {
  let searchFrom = 0;
  while (true) {
    const nameIdx = html.indexOf(`"name":"${traceName}"`, searchFrom);
    if (nameIdx === -1) break;
    searchFrom = nameIdx + 1;

    const yIdx = html.indexOf('"y":', nameIdx);
    if (yIdx === -1 || yIdx - nameIdx > 200_000) continue;

    const yCtx = html.slice(yIdx + 4, yIdx + 30);
    if (!yCtx.includes('bdata')) continue;

    const bdataMarker = '"bdata":"';
    const bdataStart  = html.indexOf(bdataMarker, yIdx);
    if (bdataStart === -1) continue;
    const contentStart = bdataStart + bdataMarker.length;
    let endPos = contentStart;
    while (endPos < html.length && html[endPos] !== '"') endPos++;

    const bdataRaw = html.slice(contentStart, endPos).replace(/\\u002f/g, '/');
    const buf = Buffer.from(bdataRaw, 'base64');

    const vals: number[] = [];
    for (let i = 0; i < buf.length - 7; i += 8) {
      const v = buf.readDoubleLE(i);
      if (isFinite(v) && !isNaN(v) && Math.abs(v) < 1e12) vals.push(v);
    }

    if (vals.length > 50) return vals;
  }
  return null;
}

function lastVal(arr: number[] | null, fallback: null): number | null;
function lastVal(arr: number[] | null, fallback: number): number;
function lastVal(arr: number[] | null, fallback: number | null = null): number | null {
  if (!arr || arr.length === 0) return fallback;
  return arr[arr.length - 1];
}

// ── Fetch CheckOnChain Euphoria Zone chart ─────────────────────────────────────
// Gives: real MVRV ratio, MVRV +1SD, MVRV +2SD, price

async function fetchEuphoriaZone(): Promise<{
  mvrv: number; mvrvPlus1SD: number; mvrvPlus2SD: number; price: number;
}> {
  const html = await fetchRaw(
    'https://charts.checkonchain.com/btconchain/pricing/pricing_euphoriazone/pricing_euphoriazone_dark.html',
  );
  const mvrv       = lastVal(extractTrace(html, 'MVRV Ratio'),   null);
  const mvrvPlus1SD = lastVal(extractTrace(html, 'MVRV + 1sd'), null);
  const mvrvPlus2SD = lastVal(extractTrace(html, 'MVRV + 2sd'), null);
  const price      = lastVal(extractTrace(html, 'Price'),        null);
  if (!mvrv || !price) throw new Error('MVRV/Price missing from chart');
  return { mvrv, mvrvPlus1SD: mvrvPlus1SD ?? 2.5, mvrvPlus2SD: mvrvPlus2SD ?? 3.3, price };
}

// ── Fetch CheckOnChain Confluence (Cycle Extreme Oscillators) chart ────────────
// Gives: Condition Sum (composite oscillator), Puell Multiple oscillator

async function fetchConfluence(): Promise<{ conditionSum: number; puell: number }> {
  const html = await fetchRaw(
    'https://charts.checkonchain.com/btconchain/confluence/confluence_cycleextremeoscillators_1/confluence_cycleextremeoscillators_1_dark.html',
  );
  const condArr  = extractTrace(html, 'Condition Sum');
  const puellArr = extractTrace(html, 'Puell Multiple');

  // Get last non-zero value for Condition Sum
  let condSum = 0;
  if (condArr) {
    for (let i = condArr.length - 1; i >= 0; i--) {
      if (condArr[i] !== 0) { condSum = condArr[i]; break; }
    }
  }
  let puell = 0;
  if (puellArr) {
    for (let i = puellArr.length - 1; i >= 0; i--) {
      if (puellArr[i] !== 0) { puell = puellArr[i]; break; }
    }
  }
  return { conditionSum: condSum, puell };
}

// ── Yahoo Finance BTC history ─────────────────────────────────────────────────

interface YahooChart {
  chart: {
    result: {
      meta: { regularMarketPrice: number; chartPreviousClose: number };
      timestamp: number[];
      indicators: { quote: { close: (number | null)[] }[] };
    }[];
  };
}

async function fetchYahooBtc(): Promise<{
  price: number; chg24: number; sma200: number; priceToSma200: number;
  history: { t: number; v: number }[];
}> {
  const text = await fetchRaw(
    'https://query2.finance.yahoo.com/v8/finance/chart/BTC-USD?interval=1d&range=2y',
  );
  const json: YahooChart = JSON.parse(text);
  const result    = json.chart.result[0];
  const rawCloses = result.indicators.quote[0].close;
  const rawTs     = result.timestamp;

  const pairs: { t: number; v: number }[] = rawCloses
    .map((v, i) => ({ v, t: rawTs[i] }))
    .filter((x): x is { t: number; v: number } => x.v !== null && x.v > 0);

  const closes    = pairs.map((x) => x.v);
  const price     = result.meta.regularMarketPrice;
  const prevClose = result.meta.chartPreviousClose;
  const chg24     = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;

  const recent200 = closes.slice(-200);
  const sma200    = recent200.reduce((a, b) => a + b, 0) / recent200.length;

  return {
    price, chg24,
    sma200,
    priceToSma200: price / sma200,
    history: pairs.slice(-365),
  };
}

// ── Fear & Greed ──────────────────────────────────────────────────────────────

interface FngResponse { data: { value: string; value_classification: string }[] }

async function fetchFearGreed(): Promise<{ value: number; label: string }> {
  const text = await fetchRaw('https://api.alternative.me/fng/?limit=1');
  const json: FngResponse = JSON.parse(text);
  return { value: parseInt(json.data[0].value), label: json.data[0].value_classification };
}

// ── Composite cycle signal ─────────────────────────────────────────────────────
// Mirrors the Bitcoin Model (Fabio Valentini methodology):
//   0–25  = Distribution,          25–40 = Neutral
//   40–60 = Early Value,           60–80 = Deep Value
//   80–100= Capitulation Recovery

function computePhase(
  mvrv: number | null, mvrvPlus1SD: number | null,
  conditionSum: number | null, fg: number,
): { score: number; phase: CyclePhase } {
  // 1. MVRV signal (40% weight)
  let mvrvScore = 50;
  if (mvrv !== null) {
    const sd1 = mvrvPlus1SD ?? 2.5;
    if      (mvrv < 1.0)         mvrvScore = 92;
    else if (mvrv < 1.2)         mvrvScore = 78;
    else if (mvrv < 1.5)         mvrvScore = 65;
    else if (mvrv < sd1 * 0.75)  mvrvScore = 50;  // approaching +1SD
    else if (mvrv < sd1)         mvrvScore = 35;   // below +1SD
    else                         mvrvScore = 12;   // above +1SD = heated/distributing
  }

  // 2. CheckOnChain Condition Sum (35% weight)
  // Oscillator range: typically -4 to +4. Buy zone: < -0.70, Sell zone: > +0.85
  let condScore = 50;
  if (conditionSum !== null) {
    if      (conditionSum < -1.5)   condScore = 95;
    else if (conditionSum < -0.70)  condScore = 85;
    else if (conditionSum < -0.20)  condScore = 68;
    else if (conditionSum < 0.20)   condScore = 52;
    else if (conditionSum < 0.50)   condScore = 35;
    else if (conditionSum < 0.85)   condScore = 20;
    else                            condScore = 8;
  }

  // 3. Fear & Greed (25% weight) — contrarian: extreme fear = high opportunity
  const fgScore = 100 - fg;

  const w1 = mvrv !== null ? 0.40 : 0;
  const w2 = conditionSum !== null ? 0.35 : 0;
  const w3 = 1 - w1 - w2; // remaining weight goes to F&G
  const score = Math.round(mvrvScore * w1 + condScore * w2 + fgScore * w3);

  let phase: CyclePhase;
  if      (score >= 80) phase = 'capitulation_recovery';
  else if (score >= 60) phase = 'deep_value';
  else if (score >= 40) phase = 'early_value';
  else if (score >= 25) phase = 'neutral';
  else                  phase = 'distribution';

  return { score, phase };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  if (memCache && Date.now() - memCache.ts < CACHE_TTL) {
    return NextResponse.json(memCache.data);
  }

  const errors: string[] = [];

  const [btcRes, cocEuphoriaRes, cocConfluenceRes, fgRes] = await Promise.allSettled([
    fetchYahooBtc(),
    fetchEuphoriaZone(),
    fetchConfluence(),
    fetchFearGreed(),
  ]);

  if (btcRes.status          === 'rejected') errors.push(`BTC: ${(btcRes.reason as Error).message}`);
  if (cocEuphoriaRes.status  === 'rejected') errors.push(`CheckOnChain Euphoria: ${(cocEuphoriaRes.reason as Error).message}`);
  if (cocConfluenceRes.status=== 'rejected') errors.push(`CheckOnChain Confluence: ${(cocConfluenceRes.reason as Error).message}`);
  if (fgRes.status           === 'rejected') errors.push(`F&G: ${(fgRes.reason as Error).message}`);

  const btc        = btcRes.status        === 'fulfilled' ? btcRes.value        : null;
  const cocEuphoria= cocEuphoriaRes.status === 'fulfilled' ? cocEuphoriaRes.value : null;
  const cocConf    = cocConfluenceRes.status === 'fulfilled' ? cocConfluenceRes.value : null;
  const fg         = fgRes.status         === 'fulfilled' ? fgRes.value         : { value: 50, label: 'Neutral' };

  const price         = cocEuphoria?.price         ?? btc?.price         ?? 0;
  const mvrv          = cocEuphoria?.mvrv           ?? null;
  const mvrvPlus1SD   = cocEuphoria?.mvrvPlus1SD    ?? null;
  const mvrvPlus2SD   = cocEuphoria?.mvrvPlus2SD    ?? null;
  const conditionSum  = cocConf?.conditionSum        ?? null;
  const puellOscillator = cocConf?.puell             ?? null;

  const { score, phase } = computePhase(mvrv, mvrvPlus1SD, conditionSum, fg.value);

  const result: BtcMetrics = {
    price,
    priceChg24:      btc?.chg24          ?? 0,
    sma200:          btc?.sma200         ?? 0,
    priceToSma200:   btc?.priceToSma200  ?? 0,
    mvrvRatio:       mvrv,
    mvrvPlus1SD,
    mvrvPlus2SD,
    conditionSum,
    puellOscillator,
    fearGreed:       fg.value,
    fearGreedLabel:  fg.label,
    cycleScore:      score,
    cyclePhase:      phase,
    priceHistory:    btc?.history        ?? [],
    fetchedAt:       new Date().toISOString(),
    source:          errors.length === 0 ? 'live' : errors.length < 3 ? 'partial' : 'error',
    errors,
  };

  memCache = { data: result, ts: Date.now() };
  return NextResponse.json(result);
}
