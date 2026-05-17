import type { CalendarEvent, MacroMetric, Currency } from './types';

type MetricField = 'inflation' | 'unemployment' | 'interestRate' | 'gdpGrowth';

interface EventMapping {
  currency: Currency;
  field: MetricField;
  titlePatterns: string[];   // lowercase substrings; any match = candidate
  excludePatterns?: string[]; // lowercase substrings; any match = discard
  sourceLabel: string;
  periodSuffix: string;
  monthOffset: number;       // months to subtract from event date to get data period
}

// Priority order: first entry whose titlePatterns produce a match wins for that currency+field.
// excludePatterns filter out false positives (e.g. "Core CPI y/y" when wanting headline).
const MAPPINGS: EventMapping[] = [
  // ── USD ──────────────────────────────────────────────────────────────────
  { currency: 'USD', field: 'inflation',
    titlePatterns: ['cpi y/y'], excludePatterns: ['core'],
    sourceLabel: 'BLS CPI',        periodSuffix: ' YoY', monthOffset: -1 },
  { currency: 'USD', field: 'unemployment',
    titlePatterns: ['unemployment rate'],
    sourceLabel: 'BLS',            periodSuffix: '',     monthOffset: -1 },
  { currency: 'USD', field: 'interestRate',
    titlePatterns: ['fed funds rate'],
    sourceLabel: 'Federal Reserve', periodSuffix: '',    monthOffset:  0 },
  { currency: 'USD', field: 'gdpGrowth',
    titlePatterns: ['advance gdp q/q', 'prelim gdp q/q', 'gdp q/q'],
    sourceLabel: 'BEA',            periodSuffix: ' q/q', monthOffset: -3 },

  // ── EUR / Germany ─────────────────────────────────────────────────────────
  // FF tags German events as EUR currency. Prefer German-specific events.
  { currency: 'EUR', field: 'inflation',
    titlePatterns: ['german cpi y/y', 'german cpi m/m'],
    sourceLabel: 'Destatis CPI',   periodSuffix: ' YoY', monthOffset: -1 },
  { currency: 'EUR', field: 'inflation',
    titlePatterns: ['cpi flash y/y', 'flash cpi y/y', 'cpi y/y'], excludePatterns: ['core'],
    sourceLabel: 'Destatis CPI',   periodSuffix: ' YoY', monthOffset: -1 },
  { currency: 'EUR', field: 'unemployment',
    titlePatterns: ['german unemployment change', 'german unemployment rate'],
    sourceLabel: 'Destatis',       periodSuffix: '',     monthOffset: -1 },
  { currency: 'EUR', field: 'unemployment',
    titlePatterns: ['unemployment rate'],
    sourceLabel: 'Destatis',       periodSuffix: '',     monthOffset: -2 },
  { currency: 'EUR', field: 'interestRate',
    titlePatterns: ['deposit facility rate', 'deposit rate', 'ecb rate decision', 'main refinancing rate', 'minimum bid rate'],
    sourceLabel: 'ECB Deposit Rate', periodSuffix: '',   monthOffset:  0 },
  { currency: 'EUR', field: 'gdpGrowth',
    titlePatterns: ['german prelim gdp q/q', 'german gdp q/q'],
    sourceLabel: 'Destatis',       periodSuffix: ' q/q', monthOffset: -3 },
  { currency: 'EUR', field: 'gdpGrowth',
    titlePatterns: ['flash gdp q/q', 'prelim gdp q/q', 'gdp q/q'],
    sourceLabel: 'Destatis',       periodSuffix: ' q/q', monthOffset: -3 },

  // ── GBP ──────────────────────────────────────────────────────────────────
  { currency: 'GBP', field: 'inflation',
    titlePatterns: ['cpi y/y'], excludePatterns: ['core'],
    sourceLabel: 'ONS CPI',        periodSuffix: ' YoY', monthOffset: -1 },
  { currency: 'GBP', field: 'unemployment',
    titlePatterns: ['unemployment rate'],
    sourceLabel: 'ONS',            periodSuffix: '',     monthOffset: -2 },
  { currency: 'GBP', field: 'interestRate',
    titlePatterns: ['official bank rate', 'boe rate decision', 'mpc rate decision', 'boe interest rate'],
    sourceLabel: 'Bank of England', periodSuffix: '',    monthOffset:  0 },
  { currency: 'GBP', field: 'gdpGrowth',
    titlePatterns: ['prelim gdp q/q', 'gdp q/q'],
    sourceLabel: 'ONS',            periodSuffix: ' q/q', monthOffset: -3 },

  // ── JPY ──────────────────────────────────────────────────────────────────
  { currency: 'JPY', field: 'inflation',
    titlePatterns: ['national cpi y/y', 'tokyo cpi y/y'],
    sourceLabel: 'MIC CPI',        periodSuffix: ' YoY', monthOffset: -1 },
  { currency: 'JPY', field: 'unemployment',
    titlePatterns: ['unemployment rate'],
    sourceLabel: 'MIC',            periodSuffix: '',     monthOffset: -1 },
  { currency: 'JPY', field: 'interestRate',
    titlePatterns: ['boj rate decision', 'boj policy rate', 'boj interest rate'],
    sourceLabel: 'Bank of Japan',  periodSuffix: '',     monthOffset:  0 },
  { currency: 'JPY', field: 'gdpGrowth',
    titlePatterns: ['prelim gdp q/q', 'gdp q/q'],
    sourceLabel: 'Cabinet Office', periodSuffix: ' q/q', monthOffset: -3 },

  // ── CAD ──────────────────────────────────────────────────────────────────
  { currency: 'CAD', field: 'inflation',
    titlePatterns: ['cpi y/y'], excludePatterns: ['core', 'median', 'trimmed'],
    sourceLabel: 'Statistics Canada CPI', periodSuffix: ' YoY', monthOffset: -1 },
  { currency: 'CAD', field: 'unemployment',
    titlePatterns: ['unemployment rate'],
    sourceLabel: 'Statistics Canada', periodSuffix: '',  monthOffset: -1 },
  { currency: 'CAD', field: 'interestRate',
    titlePatterns: ['overnight rate', 'boc rate decision', 'boc interest rate'],
    sourceLabel: 'Bank of Canada', periodSuffix: '',     monthOffset:  0 },
  // Canada reports GDP monthly; typical lag is ~2 months (April release = Feb data)
  { currency: 'CAD', field: 'gdpGrowth',
    titlePatterns: ['gdp m/m'],
    sourceLabel: 'Statistics Canada', periodSuffix: ' m/m', monthOffset: -2 },

  // ── AUD ──────────────────────────────────────────────────────────────────
  // AUS CPI is quarterly; prefer y/y headline, fall back to trimmed mean q/q
  { currency: 'AUD', field: 'inflation',
    titlePatterns: ['cpi y/y'], excludePatterns: ['trimmed', 'core'],
    sourceLabel: 'ABS CPI',        periodSuffix: ' YoY', monthOffset: -3 },
  { currency: 'AUD', field: 'inflation',
    titlePatterns: ['trimmed mean cpi q/q'],
    sourceLabel: 'ABS CPI',        periodSuffix: ' q/q', monthOffset: -3 },
  { currency: 'AUD', field: 'unemployment',
    titlePatterns: ['unemployment rate'],
    sourceLabel: 'ABS',            periodSuffix: '',     monthOffset: -1 },
  { currency: 'AUD', field: 'interestRate',
    titlePatterns: ['cash rate', 'rba rate decision'],
    sourceLabel: 'Reserve Bank of Australia', periodSuffix: '', monthOffset: 0 },
  { currency: 'AUD', field: 'gdpGrowth',
    titlePatterns: ['gdp q/q'],
    sourceLabel: 'ABS',            periodSuffix: ' q/q', monthOffset: -3 },
];

function parsePct(raw: string | null): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace('%', '').replace(',', '.').trim());
  return isNaN(n) ? null : n;
}

function deriveTrend(actual: string | null, previous: string | null): 'up' | 'down' | 'flat' {
  const a = parsePct(actual);
  const p = parsePct(previous);
  if (a === null || p === null) return 'flat';
  if (Math.abs(a - p) < 0.05) return 'flat';
  return a > p ? 'up' : 'down';
}

function derivePeriod(eventDate: string, monthOffset: number, suffix: string): string {
  const d = new Date(eventDate + 'T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + monthOffset);

  if (suffix.includes('q/q') || suffix.includes('q/')) {
    const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
    return `Q${quarter} ${d.getUTCFullYear()}${suffix}`;
  }

  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${month} ${d.getUTCFullYear()}${suffix}`;
}

function eventMatchesMapping(ev: CalendarEvent, mapping: EventMapping): boolean {
  if (ev.currency !== mapping.currency) return false;
  if (!ev.actual || !ev.isReleased) return false;
  const titleLc = ev.title.toLowerCase();
  if (!mapping.titlePatterns.some((p) => titleLc.includes(p))) return false;
  if (mapping.excludePatterns?.some((p) => titleLc.includes(p))) return false;
  return true;
}

export function enrichMetricsFromCalendar(
  metrics: MacroMetric[],
  events: CalendarEvent[],
): MacroMetric[] {
  // For each currency+field, iterate MAPPINGS in priority order.
  // First mapping that finds a released matching event wins; ties broken by most recent timestamp.
  const enrichments = new Map<string, { ev: CalendarEvent; mapping: EventMapping }>();

  for (const mapping of MAPPINGS) {
    const key = `${mapping.currency}:${mapping.field}`;
    if (enrichments.has(key)) continue; // higher-priority mapping already matched

    let bestEv: CalendarEvent | null = null;
    for (const ev of events) {
      if (!eventMatchesMapping(ev, mapping)) continue;
      if (!bestEv || ev.timestamp > bestEv.timestamp) bestEv = ev;
    }

    if (bestEv) enrichments.set(key, { ev: bestEv, mapping });
  }

  if (enrichments.size === 0) return metrics;

  return metrics.map((metric) => {
    const updated: MacroMetric = { ...metric };
    for (const field of ['inflation', 'unemployment', 'interestRate', 'gdpGrowth'] as MetricField[]) {
      const entry = enrichments.get(`${metric.id}:${field}`);
      if (!entry) continue;
      const { ev, mapping } = entry;
      let value = ev.actual!;
      if (field === 'gdpGrowth' && value && !value.startsWith('-') && !value.startsWith('+')) {
        value = `+${value}`;
      }
      updated[field] = {
        value,
        period: derivePeriod(ev.date, mapping.monthOffset, mapping.periodSuffix),
        trend: deriveTrend(ev.actual, ev.previous),
        source: mapping.sourceLabel,
        lastUpdated: ev.date.slice(0, 7),
      };
    }
    return updated;
  });
}
