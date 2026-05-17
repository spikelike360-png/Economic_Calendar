// FRED (Federal Reserve Economic Data) API client.
// Free API key: https://fred.stlouisfed.org/docs/api/api_key.html
// Set FRED_API_KEY in .env.local
//
// World Bank API (no key) used as fallback for metrics where FRED series
// have been discontinued (EUR unemployment, JPY CPI).

import type { Currency, MacroMetric, MacroValue, Trend } from '../types';
import { macroMetrics as FALLBACK } from '../macroData';

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';
const WB_BASE = 'https://api.worldbank.org/v2/country';

interface FredObs {
  date: string;   // "2026-01-01"
  value: string;  // "4.33" or "." for missing
}

interface WbObs {
  date: string;   // "2024" (year string)
  value: number | null;
}

interface SeriesCfg {
  id: string;
  label: string;
  units?: string;        // FRED units transform: 'pc1' = YoY%, 'pca' = % annualized
  quarterly?: boolean;
  alreadyPct?: boolean;  // series already in % form, no transform needed
  maxAgeDays?: number;   // reject FRED data older than this many days
  wbFallback?: { country: string; indicator: string; label: string };
}

const SERIES: Record<Currency, {
  rate: SeriesCfg;
  cpi: SeriesCfg;
  unem: SeriesCfg;
  gdp: SeriesCfg;
}> = {
  USD: {
    rate: { id: 'FEDFUNDS',           label: 'Federal Reserve' },
    cpi:  { id: 'CPIAUCSL',           label: 'BLS CPI',               units: 'pc1' },
    unem: { id: 'UNRATE',             label: 'BLS',                   alreadyPct: true },
    gdp:  { id: 'A191RL1Q225SBEA',    label: 'BEA',                   alreadyPct: true, quarterly: true },
  },
  EUR: {
    rate: { id: 'ECBDFR',             label: 'ECB Deposit Rate' },
    cpi:  { id: 'DEUCPIALLMINMEI',    label: 'Destatis CPI',           units: 'pc1' },
    unem: {
      id: 'LRHUTTTTDEM156S', label: 'Destatis', alreadyPct: true, maxAgeDays: 365,
      wbFallback: { country: 'DE', indicator: 'SL.UEM.TOTL.ZS', label: 'World Bank / Destatis' },
    },
    gdp:  { id: 'NAEXKP01DEQ657S',    label: 'Destatis',               alreadyPct: true, quarterly: true },
  },
  GBP: {
    rate: { id: 'IRSTCI01GBM156N',    label: 'Overnight Rate (SONIA)' },
    cpi:  { id: 'GBRCPIALLMINMEI',    label: 'ONS CPI',               units: 'pc1' },
    unem: { id: 'LRHUTTTTGBM156S',    label: 'ONS',                   alreadyPct: true },
    gdp:  { id: 'NAEXKP01GBQ657S',    label: 'ONS',                   alreadyPct: true, quarterly: true },
  },
  JPY: {
    rate: { id: 'IRSTCI01JPM156N',    label: 'Overnight Call Rate' },
    cpi:  {
      id: 'JPNCPIALLMINMEI', label: 'MIC CPI', units: 'pc1', maxAgeDays: 180,
      wbFallback: { country: 'JP', indicator: 'FP.CPI.TOTL.ZG', label: 'World Bank / MIC' },
    },
    unem: { id: 'LRHUTTTTJPM156S',    label: 'MIC',                   alreadyPct: true },
    gdp:  { id: 'NAEXKP01JPQ657S',    label: 'Cabinet Office',        alreadyPct: true, quarterly: true },
  },
  CAD: {
    rate: { id: 'IRSTCI01CAM156N',    label: 'Overnight Rate (CORRA)' },
    cpi:  { id: 'CANCPIALLMINMEI',    label: 'Statistics Canada CPI', units: 'pc1' },
    unem: { id: 'LRHUTTTTCAM156S',    label: 'Statistics Canada',     alreadyPct: true },
    gdp:  { id: 'NAEXKP01CAQ657S',    label: 'Statistics Canada',     alreadyPct: true, quarterly: true },
  },
  AUD: {
    rate: { id: 'IRSTCI01AUM156N',    label: 'Overnight Rate (RBA)' },
    cpi:  { id: 'AUSCPIALLQINMEI',    label: 'ABS CPI',               units: 'pc1', quarterly: true },
    unem: { id: 'LRHUTTTTAUM156S',    label: 'ABS',                   alreadyPct: true },
    gdp:  { id: 'NAEXKP01AUQ657S',    label: 'ABS',                   alreadyPct: true, quarterly: true },
  },
};

// ---------- helpers ----------

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatPeriod(date: string, quarterly: boolean): string {
  // date is "2026-01-01" (FRED) or "2024" (World Bank annual)
  if (!date.includes('-')) return date; // bare year
  const [year, month] = date.split('-').map(Number);
  if (quarterly) return `Q${Math.ceil(month / 3)} ${year}`;
  return `${MONTH_ABBR[month - 1]} ${year}`;
}

function calcTrend(vals: number[]): Trend {
  if (vals.length < 2) return 'flat';
  const diff = vals[0] - vals[1];
  if (diff > 0.05) return 'up';
  if (diff < -0.05) return 'down';
  return 'flat';
}

function formatValue(num: number): string {
  const fixed = Math.abs(num) < 10 ? num.toFixed(2) : num.toFixed(1);
  return `${fixed.replace(/\.?0+$/, '')}%`;
}

// ---------- fetchers ----------

async function fetchFredObs(seriesId: string, apiKey: string, units?: string): Promise<FredObs[] | null> {
  try {
    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: apiKey,
      file_type: 'json',
      sort_order: 'desc',
      limit: '3',
      ...(units ? { units } : {}),
    });
    const res = await fetch(`${FRED_BASE}?${params}`, { signal: AbortSignal.timeout(7_000) });
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch { /* ignore */ }
      console.warn(`[metrics] FRED ${seriesId}: HTTP ${res.status} — ${body.slice(0, 200)}`);
      return null;
    }
    const json = await res.json();
    const obs: FredObs[] = (json.observations ?? []).filter(
      (o: FredObs) => o.value !== '.' && o.value !== '',
    );
    if (obs.length > 0) {
      console.log(`[metrics] FRED ${seriesId}: ok, latest=${obs[0].date}`);
    }
    return obs.length > 0 ? obs : null;
  } catch (err) {
    console.warn(`[metrics] FRED ${seriesId}: failed —`, err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function fetchWorldBankObs(country: string, indicator: string): Promise<WbObs[] | null> {
  try {
    const url = `${WB_BASE}/${country}/indicator/${indicator}?format=json&mrv=3&per_page=3`;
    const res = await fetch(url, { signal: AbortSignal.timeout(7_000) });
    if (!res.ok) return null;
    const json: [unknown, WbObs[]] = await res.json();
    const obs = json[1]?.filter((o) => o.value != null) ?? [];
    return obs.length > 0 ? obs : null;
  } catch {
    return null;
  }
}

// ---------- builders ----------

function macroValueFromFred(obs: FredObs[], cfg: SeriesCfg): MacroValue {
  const nums = obs.map((o) => parseFloat(o.value));
  return {
    value: formatValue(nums[0]),
    period: formatPeriod(obs[0].date, cfg.quarterly ?? false),
    trend: calcTrend(nums),
    source: cfg.label,
    lastUpdated: obs[0].date.slice(0, 7),
  };
}

function macroValueFromWb(obs: WbObs[], label: string): MacroValue {
  const vals = obs.map((o) => o.value as number);
  return {
    value: formatValue(vals[0]),
    period: obs[0].date,  // bare year e.g. "2025"
    trend: calcTrend(vals),
    source: label,
    lastUpdated: obs[0].date,
  };
}

function isFresh(dateStr: string, maxAgeDays: number): boolean {
  const obsDate = new Date(dateStr);
  const ageMs = Date.now() - obsDate.getTime();
  return ageMs < maxAgeDays * 86_400_000;
}

async function buildMetric(
  cfg: SeriesCfg,
  apiKey: string,
  fallback: MacroValue,
): Promise<MacroValue> {
  // 1. Try FRED — reject if older than maxAgeDays
  const fredObs = await fetchFredObs(cfg.id, apiKey, cfg.units);
  if (fredObs) {
    const fresh = cfg.maxAgeDays == null || isFresh(fredObs[0].date, cfg.maxAgeDays);
    if (fresh) return macroValueFromFred(fredObs, cfg);
  }

  // 2. Try World Bank fallback (no key needed)
  if (cfg.wbFallback) {
    const wbObs = await fetchWorldBankObs(cfg.wbFallback.country, cfg.wbFallback.indicator);
    if (wbObs) return macroValueFromWb(wbObs, cfg.wbFallback.label);
  }

  // 3. Static fallback
  console.warn(`[metrics] ${cfg.id}: using static fallback (lastUpdated=${fallback.lastUpdated})`);
  return fallback;
}

// ---------- public ----------

export async function fetchFredMetrics(apiKey: string, currencies: Currency[] = Object.keys(SERIES) as Currency[]): Promise<MacroMetric[]> {

  return Promise.all(
    currencies.map(async (currency) => {
      const cfg = SERIES[currency];
      const fallback = FALLBACK.find((m) => m.id === currency)!;

      const [interestRate, inflation, unemployment, gdpGrowth] = await Promise.all([
        buildMetric(cfg.rate, apiKey, fallback.interestRate),
        buildMetric(cfg.cpi,  apiKey, fallback.inflation),
        buildMetric(cfg.unem, apiKey, fallback.unemployment),
        buildMetric(cfg.gdp,  apiKey, fallback.gdpGrowth),
      ]);

      return { id: currency, countryName: fallback.countryName, flag: fallback.flag,
        interestRate, inflation, unemployment, gdpGrowth } satisfies MacroMetric;
    }),
  );
}
