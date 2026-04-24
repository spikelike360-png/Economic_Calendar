// OECD Data API — free, no key required.
// DP_LIVE: direct indicators (CPI YoY%, unemployment, interest rate, GDP)
// MEI: Main Economic Indicators (interest rate, unemployment, GDP)

import type { Currency, MacroMetric, MacroValue, Trend } from '../types';
import { macroMetrics as FALLBACK } from '../macroData';

const OECD_BASE = 'https://stats.oecd.org/SDMX-JSON/data';
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

type Freq = 'M' | 'Q';

interface OecdPoint {
  period: string;
  value: number;
}

const COUNTRY: Record<Exclude<Currency, 'USD'>, string> = {
  EUR: 'EA19',
  GBP: 'GBR',
  JPY: 'JPN',
  CAD: 'CAN',
  AUD: 'AUS',
};

// AUD CPI is published quarterly
const CPI_FREQ: Record<Exclude<Currency, 'USD'>, Freq> = {
  EUR: 'M', GBP: 'M', JPY: 'M', CAD: 'M', AUD: 'Q',
};

// ---------- fetcher ----------

async function fetchOecdSeries(dataset: string, filter: string, n: number): Promise<OecdPoint[] | null> {
  try {
    const url = `${OECD_BASE}/${dataset}/${filter}/all?format=jsondata&lastNObservations=${n}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const json = await res.json();

    // SDMX-JSON structure: series keyed by dimension indices, observations keyed by time index
    const dimObs: { id: string; values: { id: string }[] }[] =
      json.structure?.dimensions?.observation ?? [];
    const timeDim = dimObs.find((d) => d.id === 'TIME_PERIOD');
    if (!timeDim) return null;
    const timeVals = timeDim.values;

    const seriesMap: Record<string, { observations: Record<string, [number | null, ...unknown[]]> }> =
      json.dataSets?.[0]?.series ?? {};
    const firstSeries = Object.values(seriesMap)[0];
    if (!firstSeries) return null;

    const points: OecdPoint[] = Object.entries(firstSeries.observations)
      .map(([timeIdx, obs]) => {
        const val = obs[0];
        if (val == null || isNaN(val as number)) return null;
        const period = timeVals[parseInt(timeIdx)]?.id;
        if (!period) return null;
        return { period, value: val as number };
      })
      .filter((p): p is OecdPoint => p !== null)
      .sort((a, b) => b.period.localeCompare(a.period));

    return points.length > 0 ? points : null;
  } catch {
    return null;
  }
}

// ---------- formatters ----------

function calcTrend(a: number, b: number, threshold = 0.05): Trend {
  if (a - b > threshold) return 'up';
  if (a - b < -threshold) return 'down';
  return 'flat';
}

function formatValue(num: number): string {
  const fixed = Math.abs(num) < 10 ? num.toFixed(2) : num.toFixed(1);
  return `${fixed.replace(/\.?0+$/, '')}%`;
}

function formatPeriod(period: string): string {
  if (/^\d{4}$/.test(period)) return period;
  const qm = period.match(/^(\d{4})-?(Q\d)$/);
  if (qm) return `${qm[2]} ${qm[1]}`;
  const mm = period.match(/^(\d{4})-(\d{2})$/);
  if (mm) return `${MONTH_ABBR[parseInt(mm[2]) - 1]} ${mm[1]}`;
  return period;
}

function makeValue(num: number, period: string, trend: Trend, source: string): MacroValue {
  return { value: formatValue(num), period: formatPeriod(period), trend, source, lastUpdated: period };
}

// ---------- builders ----------

function buildDirect(pts: OecdPoint[] | null, fallback: MacroValue, source = 'OECD'): MacroValue {
  if (!pts) return fallback;
  const trend = pts.length >= 2 ? calcTrend(pts[0].value, pts[1].value) : 'flat';
  return makeValue(pts[0].value, pts[0].period, trend, source);
}

function buildGdp(pts: OecdPoint[] | null, fallback: MacroValue): MacroValue {
  if (!pts || pts.length < 2) return fallback;
  // NAEXKP01 in OECD MEI may be index or % — detect by magnitude
  const isIndex = Math.abs(pts[0].value) > 10;
  let q0: number, q1: number;
  if (isIndex) {
    q0 = (pts[0].value - pts[1].value) / pts[1].value * 100;
    q1 = pts.length >= 3 ? (pts[1].value - pts[2].value) / pts[2].value * 100 : q0;
  } else {
    q0 = pts[0].value;
    q1 = pts[1].value;
  }
  return makeValue(q0, pts[0].period, calcTrend(q0, q1), 'OECD MEI');
}

// ---------- public ----------

export async function fetchOecdMetrics(): Promise<MacroMetric[]> {
  const currencies: Exclude<Currency, 'USD'>[] = ['EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

  return Promise.all(
    currencies.map(async (currency) => {
      const country = COUNTRY[currency];
      const cpiFreq = CPI_FREQ[currency];
      const fb = FALLBACK.find((m) => m.id === currency)!;

      // DP_LIVE: CPI YoY% directly (GY = growth over previous year)
      // MEI: interest rate (IRSTCI01), unemployment (LRHUTTTT), GDP (NAEXKP01)
      const [ratePts, cpiPts, unemPts, gdpPts] = await Promise.all([
        fetchOecdSeries('MEI', `IRSTCI01.${country}.M`, 3),
        fetchOecdSeries('DP_LIVE', `${country}.CPI.TOT.GY.${cpiFreq}`, 3),
        fetchOecdSeries('MEI', `LRHUTTTT.${country}.M`, 3),
        fetchOecdSeries('MEI', `NAEXKP01.${country}.Q`, 4),
      ]);

      return {
        id: currency,
        countryName: fb.countryName,
        flag: fb.flag,
        interestRate: buildDirect(ratePts, fb.interestRate, 'OECD MEI'),
        inflation:    buildDirect(cpiPts,  fb.inflation,     'OECD DP_LIVE'),
        unemployment: buildDirect(unemPts, fb.unemployment,  'OECD MEI'),
        gdpGrowth:    buildGdp(gdpPts, fb.gdpGrowth),
      } satisfies MacroMetric;
    }),
  );
}
