import * as cheerio from 'cheerio';
import type { Currency, MacroMetric, MacroValue, Trend } from '@/lib/types';

const TE_BASE = 'https://tradingeconomics.com';
const TE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// TE slug for each currency+field
const TE_SLUGS: Record<Currency, Record<'rate' | 'cpi' | 'unem' | 'gdp', string>> = {
  USD: { rate: 'united-states/interest-rate',   cpi: 'united-states/inflation-cpi',   unem: 'united-states/unemployment-rate', gdp: 'united-states/gdp-growth'    },
  EUR: { rate: 'euro-area/interest-rate',        cpi: 'germany/inflation-cpi',          unem: 'germany/unemployment-rate',       gdp: 'germany/gdp-growth'           },
  GBP: { rate: 'united-kingdom/interest-rate',   cpi: 'united-kingdom/inflation-cpi',   unem: 'united-kingdom/unemployment-rate',gdp: 'united-kingdom/gdp-growth'    },
  JPY: { rate: 'japan/interest-rate',            cpi: 'japan/inflation-cpi',            unem: 'japan/unemployment-rate',         gdp: 'japan/gdp-growth'             },
  CAD: { rate: 'canada/interest-rate',           cpi: 'canada/inflation-cpi',           unem: 'canada/unemployment-rate',        gdp: 'canada/gdp-growth'            },
  AUD: { rate: 'australia/interest-rate',        cpi: 'australia/inflation-cpi',        unem: 'australia/unemployment-rate',     gdp: 'australia/gdp-growth'         },
};

// Indicator names to skip (projections, forecasts, not the main rate)
const SKIP_KEYWORDS = ['projection', 'forecast', 'outlook', 'estimate'];

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface TERow {
  date: string;     // YYYY-MM-DD (release date)
  indicator: string;
  reference: string;  // "Mar" or "Q1" or ""
  actual: number;
  previous: number | null;
  unit: string;       // "%" or ""
}

async function fetchTEPage(slug: string): Promise<string | null> {
  try {
    const res = await fetch(`${TE_BASE}/${slug}`, {
      headers: { 'User-Agent': TE_UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function parseValue(s: string): { value: number; unit: string } | null {
  if (!s) return null;
  const unit = s.includes('%') ? '%' : '';
  const clean = s.replace(/[^0-9.\-]/g, '');
  const n = parseFloat(clean);
  return isNaN(n) ? null : { value: n, unit };
}

function buildPeriod(releaseDate: string, reference: string, isQuarterly: boolean): string {
  const [year, month] = releaseDate.split('-').map(Number);

  if (isQuarterly) {
    if (reference.match(/^Q[1-4]/)) return `${reference} ${year}`;
    return `Q${Math.ceil(month / 3)} ${year}`;
  }

  if (reference && MONTH_NAMES.includes(reference)) {
    const refMonthIdx = MONTH_NAMES.indexOf(reference);
    // If reference month is later in year than release month, it belongs to previous year
    const adjustedYear = refMonthIdx > (month - 1) ? year - 1 : year;
    return `${reference} ${adjustedYear}`;
  }

  return `${MONTH_NAMES[month - 1]} ${year}`;
}

function parseCalendarTable(html: string): TERow[] {
  const $ = cheerio.load(html);
  const today = new Date().toISOString().slice(0, 10);
  const rows: TERow[] = [];

  $('#calendar tr[data-id]').each((_, el) => {
    const $row = $(el);
    const cells = $row.find('td');

    const date = $(cells[0]).text().trim();
    if (!date.match(/^\d{4}-\d{2}-\d{2}$/) || date > today) return;

    const indicator = (
      $(cells[2]).find('div.d-none').text().trim() ||
      $(cells[2]).text().trim()
    ).replace(/\s+/g, ' ');

    // Skip projections and similar
    const indLower = indicator.toLowerCase();
    if (SKIP_KEYWORDS.some((k) => indLower.includes(k))) return;

    const reference = $(cells[3]).text().trim().replace(/[^A-Za-z0-9 ]/g, '').trim();

    const actualText = $(cells[4]).text().trim();
    const previousText = $(cells[5]).text().trim();

    const actualParsed = parseValue(actualText);
    if (!actualParsed) return;

    const prevParsed = parseValue(previousText);

    rows.push({
      date,
      indicator,
      reference,
      actual: actualParsed.value,
      previous: prevParsed?.value ?? null,
      unit: actualParsed.unit,
    });
  });

  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

function makeMacroValue(
  rows: TERow[],
  isQuarterly: boolean,
  sourceLabel: string,
): MacroValue {
  // Use most recent past row as current
  const current = rows[rows.length - 1];
  if (!current) {
    return { value: 'N/A', period: '', trend: 'flat', source: sourceLabel, lastUpdated: '' };
  }

  const prev = rows.length > 1 ? rows[rows.length - 2] : null;
  const trend: Trend =
    prev === null || current.actual === prev.actual ? 'flat'
    : current.actual > prev.actual ? 'up' : 'down';

  const valueStr = current.unit === '%'
    ? `${current.actual.toFixed(current.actual % 1 === 0 ? 0 : 2)}%`
    : String(current.actual);

  const period = buildPeriod(current.date, current.reference, isQuarterly);
  const lastUpdated = current.date.slice(0, 7);

  return { value: valueStr, period, trend, source: sourceLabel, lastUpdated };
}

// Country/flag mappings
const COUNTRY_INFO: Record<Currency, { countryName: string; flag: string }> = {
  USD: { countryName: 'United States', flag: '🇺🇸' },
  EUR: { countryName: 'Germany',       flag: '🇩🇪' },
  GBP: { countryName: 'United Kingdom',flag: '🇬🇧' },
  JPY: { countryName: 'Japan',         flag: '🇯🇵' },
  CAD: { countryName: 'Canada',        flag: '🇨🇦' },
  AUD: { countryName: 'Australia',     flag: '🇦🇺' },
};

export async function fetchTEMetrics(): Promise<MacroMetric[]> {
  const currencies: Currency[] = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

  // Fetch all 24 pages in parallel
  const slugEntries = currencies.flatMap((c) =>
    (['rate', 'cpi', 'unem', 'gdp'] as const).map((f) => ({
      currency: c, field: f, slug: TE_SLUGS[c][f],
    }))
  );

  const htmlResults = await Promise.allSettled(
    slugEntries.map(({ slug }) => fetchTEPage(slug))
  );

  // Parse results
  const parsed = new Map<string, TERow[]>();
  slugEntries.forEach(({ currency, field }, i) => {
    const res = htmlResults[i];
    const html = res.status === 'fulfilled' ? res.value : null;
    parsed.set(`${currency}:${field}`, html ? parseCalendarTable(html) : []);
  });

  return currencies.map((c) => {
    const { countryName, flag } = COUNTRY_INFO[c];
    const get = (f: string) => parsed.get(`${c}:${f}`) ?? [];

    return {
      id: c,
      countryName,
      flag,
      interestRate: makeMacroValue(get('rate'), false, 'Trading Economics'),
      inflation:    makeMacroValue(get('cpi'),  false, 'Trading Economics'),
      unemployment: makeMacroValue(get('unem'), false, 'Trading Economics'),
      gdpGrowth:    makeMacroValue(get('gdp'),  true,  'Trading Economics'),
    };
  });
}

// TE data points for chart history tail (supplement FRED)
export interface TEHistoryPoint {
  date: string;
  value: number;
  period: string;
}

export async function fetchTEHistoryTail(
  currency: Currency,
  field: 'rate' | 'cpi' | 'unem' | 'gdp',
): Promise<TEHistoryPoint[]> {
  const slug = TE_SLUGS[currency][field];
  const html = await fetchTEPage(slug);
  if (!html) return [];

  const rows = parseCalendarTable(html);
  const isQuarterly = field === 'gdp' || (currency === 'AUD' && field === 'cpi');

  return rows.map((r) => ({
    date:   r.date,
    value:  r.actual,
    period: buildPeriod(r.date, r.reference, isQuarterly),
  }));
}
