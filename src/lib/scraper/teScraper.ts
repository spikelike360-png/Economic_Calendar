// Trading Economics scraper — extracts macro values from meta descriptions.
// No API key required. Data is server-side rendered in public HTML.

import type { Currency, MacroMetric, MacroValue, Trend } from '../types';
import { macroMetrics as FALLBACK } from '../macroData';

const TE_BASE = 'https://tradingeconomics.com';
const UA = 'Mozilla/5.0 (X11; CrOS x86_64 12871.102.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.141 Safari/537.36';

// TE country path prefix for each currency
const TE_COUNTRY: Record<Exclude<Currency, 'USD'>, string> = {
  EUR: 'euro-area',
  GBP: 'united-kingdom',
  JPY: 'japan',
  CAD: 'canada',
  AUD: 'australia',
};

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTH_NAMES = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const QUARTER_NAMES: Record<string, string> = { first:'1', second:'2', third:'3', fourth:'4' };

// ---------- fetch ----------

async function fetchMetaDesc(path: string): Promise<string | null> {
  try {
    const res = await fetch(`${TE_BASE}/${path}`, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/name=["']description["'] content=["']([^"']{0,300})/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

// ---------- period helpers ----------

function inferYear(monthIdx: number): number {
  const now = new Date();
  const etOffset = -4; // EST/EDT approximation
  const etMonth = new Date(now.getTime() + etOffset * 3_600_000).getMonth(); // 0-based
  // If the reported month is ahead of current ET month, it's previous year
  return monthIdx > etMonth ? now.getFullYear() - 1 : now.getFullYear();
}

function parseMonthPeriod(desc: string): string {
  // Match only actual month names (not country names)
  const pattern = new RegExp(`\\bin\\s+(${MONTH_NAMES.join('|')})\\b`, 'i');
  const m = desc.match(pattern);
  if (!m) return 'Latest';
  const monthIdx = MONTH_NAMES.indexOf(m[1].toLowerCase());
  if (monthIdx < 0) return 'Latest';
  const year = inferYear(monthIdx);
  return `${MONTH_ABBR[monthIdx]} ${year}`;
}

function parseQuarterPeriod(desc: string): string {
  const m = desc.match(/\bthe\s+(first|second|third|fourth)\s+quarter\b/i);
  if (!m) return 'Latest';
  const q = QUARTER_NAMES[m[1].toLowerCase()] ?? '?';
  // GDP lags ~2 quarters; if we're in Q1/Q2 current year, last complete = previous year Q4/Q3
  const now = new Date();
  const curQ = Math.ceil((now.getMonth() + 1) / 3);
  const qNum = parseInt(q);
  const year = qNum >= curQ ? now.getFullYear() - 1 : now.getFullYear();
  return `Q${q} ${year}`;
}

// ---------- parsers ----------

function parseRate(desc: string, fallback: MacroValue): MacroValue {
  // "benchmark interest rate... was last recorded at X.XX percent"
  const m = desc.match(/last recorded at ([0-9.]+)\s*percent/i);
  if (!m) return fallback;
  return {
    value: `${m[1]}%`,
    period: 'Latest',
    trend: 'flat',
    source: 'Trading Economics',
    lastUpdated: new Date().toISOString().slice(0, 7),
  };
}

function parseCpi(desc: string, fallback: MacroValue): MacroValue {
  // "Inflation Rate... increased/decreased to X.XX percent in Month from..."
  const m = desc.match(/(increased|decreased|remained unchanged)\s+(?:to\s+|at\s+)?([0-9.]+)\s*percent/i);
  if (!m) return fallback;
  const trend: Trend = m[1].toLowerCase() === 'increased' ? 'up'
    : m[1].toLowerCase() === 'decreased' ? 'down' : 'flat';
  return {
    value: `${m[2]}%`,
    period: parseMonthPeriod(desc),
    trend,
    source: 'Trading Economics',
    lastUpdated: new Date().toISOString().slice(0, 7),
  };
}

function parseUnem(desc: string, fallback: MacroValue): MacroValue {
  // "Unemployment Rate... increased/decreased/remained unchanged at X.XX percent in Month"
  const m = desc.match(/(increased|decreased|remained unchanged)\s+(?:to\s+|at\s+)?([0-9.]+)\s*percent/i);
  if (!m) return fallback;
  const trend: Trend = m[1].toLowerCase() === 'increased' ? 'up'
    : m[1].toLowerCase() === 'decreased' ? 'down' : 'flat';
  return {
    value: `${m[2]}%`,
    period: parseMonthPeriod(desc),
    trend,
    source: 'Trading Economics',
    lastUpdated: new Date().toISOString().slice(0, 7),
  };
}

function parseGdp(desc: string, fallback: MacroValue): MacroValue {
  // "GDP... expanded/contracted X.XX percent in the fourth quarter"
  const m = desc.match(/(expanded|contracted|grew|shrank)\s+([0-9.]+)\s*percent/i);
  if (!m) return fallback;
  const contracted = ['contracted','shrank'].includes(m[1].toLowerCase());
  const trend: Trend = contracted ? 'down' : 'up';
  return {
    value: `${contracted ? '-' : ''}${m[2]}%`,
    period: parseQuarterPeriod(desc),
    trend,
    source: 'Trading Economics',
    lastUpdated: new Date().toISOString().slice(0, 7),
  };
}

// ---------- public ----------

export async function fetchTEMetrics(): Promise<MacroMetric[]> {
  const currencies: Exclude<Currency, 'USD'>[] = ['EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

  return Promise.all(
    currencies.map(async (currency) => {
      const country = TE_COUNTRY[currency];
      const fb = FALLBACK.find((m) => m.id === currency)!;

      const [rateDesc, cpiDesc, unemDesc, gdpDesc] = await Promise.all([
        fetchMetaDesc(`${country}/interest-rate`),
        fetchMetaDesc(`${country}/inflation-cpi`),
        fetchMetaDesc(`${country}/unemployment-rate`),
        fetchMetaDesc(`${country}/gdp-growth`),
      ]);

      return {
        id: currency,
        countryName: fb.countryName,
        flag: fb.flag,
        interestRate: rateDesc ? parseRate(rateDesc, fb.interestRate) : fb.interestRate,
        inflation:    cpiDesc  ? parseCpi(cpiDesc, fb.inflation)       : fb.inflation,
        unemployment: unemDesc ? parseUnem(unemDesc, fb.unemployment)  : fb.unemployment,
        gdpGrowth:    gdpDesc  ? parseGdp(gdpDesc, fb.gdpGrowth)       : fb.gdpGrowth,
      } satisfies MacroMetric;
    }),
  );
}
