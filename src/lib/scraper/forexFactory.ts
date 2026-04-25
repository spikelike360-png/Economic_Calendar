// Forex Factory calendar scraper.
//
// Data sources:
//   1. nfs.faireconomy.media JSON  — FF's own CDN, no bot protection.
//      Provides this-week + next-week event lists with forecast/previous.
//      Does NOT include actual values (forward-looking only).
//   2. forexfactory.com HTML       — via system `curl` subprocess.
//      curl's TLS fingerprint bypasses Cloudflare's bot detection that blocks
//      Node.js fetch / axios. Provides actual values for released events.
//      Falls back silently if curl is not available.
//
// Merge strategy:
//   NFS JSON is the authoritative event list (dates, times, impact, forecast, previous).
//   FF HTML provides actual values that get merged in by event key.
//
// FF HTML table structure (stable 2024-2026):
//   table.calendar__table > tr.calendar__row
//     td.calendar__date > time[datetime]    — ISO datetime (ET)
//     td.calendar__time > span.time         — "8:30am"; blank = carry from prev row
//     td.calendar__currency
//     td.calendar__impact > span[class*="icon--ff-impact-{red|ora|yel|gry}"]
//     td.calendar__event > .calendar__event-title
//     td.calendar__actual | td.calendar__forecast | td.calendar__previous

import * as cheerio from 'cheerio';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { addWeeks, startOfWeek, format } from 'date-fns';
import type { CalendarEvent, Currency, Impact } from '../types';

const execFileAsync = promisify(execFile);

const FF_BASE = 'https://www.forexfactory.com';
const NFS_BASE = 'https://nfs.faireconomy.media';

const TARGET_CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD'];

const CURL_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ---------- helpers ----------

function normalizeCurrency(raw: string): Currency | null {
  const u = raw.trim().toUpperCase() as Currency;
  return TARGET_CURRENCIES.includes(u) ? u : null;
}

function parseImpact(s: string): Impact {
  const l = s.toLowerCase();
  if (l.includes('red') || l.includes('high')) return 'high';
  if (l.includes('ora') || l.includes('medium') || l.includes('moderate')) return 'medium';
  if (l.includes('yel') || l.includes('low')) return 'low';
  if (l.includes('gry') || l.includes('gray') || l.includes('grey') || l.includes('holiday')) return 'holiday';
  return 'none';
}

function makeId(date: string, time: string, currency: string, title: string): string {
  return `${date}|${time}|${currency}|${title}`.replace(/\s+/g, '-').toLowerCase();
}

// Looser key for merging HTML actuals into NFS events (title may differ slightly)
function mergeKey(date: string, currency: string, title: string): string {
  return `${date}|${currency}|${title.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
}

function nullIfEmpty(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim().replace(/ /g, '').replace(/&nbsp;/g, '');
  return t.length > 0 ? t : null;
}

function toETDateStr(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
}

function toETTimeStr(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(d);
  const hour = parts.find((p) => p.type === 'hour')!.value;
  const minute = parts.find((p) => p.type === 'minute')!.value;
  const period = (parts.find((p) => p.type === 'dayPeriod')?.value ?? 'AM').toLowerCase();
  return `${hour}:${minute}${period}`;
}

// ---------- NFS JSON ----------

interface NfsEvent {
  title: string;
  country: string;
  date: string; // "Apr 22 2026 12:30:00 GMT+0000"
  impact: string;
  forecast: string;
  previous: string;
}

async function fetchNfs(week: 'thisweek' | 'nextweek'): Promise<CalendarEvent[]> {
  const url = `${NFS_BASE}/ff_calendar_${week}.json?version=${Date.now()}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': CURL_UA,
      Accept: 'application/json, */*',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`NFS ${week}: HTTP ${res.status}`);
  const raw: NfsEvent[] = await res.json();
  return raw.flatMap((e) => {
    const currency = normalizeCurrency(e.country);
    if (!currency) return [];
    let d: Date;
    try {
      d = new Date(e.date);
      if (isNaN(d.getTime())) return [];
    } catch {
      return [];
    }
    const dateStr = toETDateStr(d);
    const timeStr = toETTimeStr(d);
    return [
      {
        id: makeId(dateStr, timeStr, currency, e.title),
        date: dateStr,
        time: timeStr,
        timestamp: d.getTime(),
        currency,
        impact: parseImpact(e.impact),
        title: e.title,
        actual: null, // NFS JSON has no actuals — populated later from HTML
        forecast: nullIfEmpty(e.forecast),
        previous: nullIfEmpty(e.previous),
        isReleased: false,
      } satisfies CalendarEvent,
    ];
  });
}

// ---------- FF HTML via curl ----------

function ffWeekParam(weeksFromNow: number): string {
  // FF uses Monday as the start of each calendar week.
  // Using Sunday (weekStartsOn:0) produced invalid week params that FF redirected to current week.
  const monday = startOfWeek(addWeeks(new Date(), weeksFromNow), { weekStartsOn: 1 });
  return format(monday, 'MMMd.yyyy').toLowerCase();
}

// Fetch FF HTML using system curl (bypasses Cloudflare TLS fingerprint detection).
// Returns null if curl is not installed or the request fails.
async function fetchFFHtmlViaCurl(weekParam: string): Promise<string | null> {
  const url = `${FF_BASE}/calendar?week=${weekParam}`;
  try {
    const { stdout } = await execFileAsync(
      'curl',
      [
        '-s', '-L',
        '-m', '15',
        '--max-filesize', '5242880', // 5 MB cap
        '-A', CURL_UA,
        '-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        '-H', 'Accept-Language: en-US,en;q=0.9',
        '-H', `Referer: ${FF_BASE}/`,
        '-H', 'Cache-Control: no-cache',
        url,
      ],
      { maxBuffer: 6 * 1024 * 1024, timeout: 18_000 },
    );
    if (!stdout || stdout.length < 1000) return null;
    return stdout;
  } catch {
    return null; // curl not available or request failed
  }
}

// Parsed result from FF HTML — includes actuals
interface HTMLActual {
  date: string;
  time: string;
  currency: Currency;
  title: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  impact: Impact;
  timestamp: number;
}

// Parse the FF date text "Mon Apr 20" into a YYYY-MM-DD string.
// Year is inferred: if the month is much earlier than current month, assume next year.
// FF dates are already expressed in ET — return the string directly to avoid
// timezone offset bugs when the server runs ahead of ET (e.g. UTC+2/+3).
function parseFFDateText(text: string): string | null {
  // text: "Mon Apr 20" or "Tue May 3"
  const m = text.match(/([A-Z][a-z]{2})\s+(\d{1,2})$/);
  if (!m) return null;
  const [, mon, dayStr] = m;
  const day = parseInt(dayStr);
  const monthIdx = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(mon);
  if (monthIdx < 0) return null;
  // Choose year: if the month is >5 months behind the current ET month, it's next year
  const etDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const [etYearStr, etMonStr] = etDateStr.split('-');
  const curMonth = parseInt(etMonStr) - 1;
  const year = (monthIdx < curMonth - 5) ? parseInt(etYearStr) + 1 : parseInt(etYearStr);
  const mm = String(monthIdx + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function parseFFHtml(html: string): HTMLActual[] {
  const $ = cheerio.load(html);
  const results: HTMLActual[] = [];

  let currentDate = '';
  let currentTimestamp = 0;
  let currentTimeStr = '';
  let currentCurrency = '';

  // Use .filter() (more reliable than .not() with attribute selectors in some cheerio builds)
  $('tr.calendar__row')
    .filter((_, el) => {
      const cls = $(el).attr('class') ?? '';
      return !cls.includes('day-breaker') && !cls.includes('no-event') && !cls.includes('--head');
    })
    .each((_, row) => {
      const $row = $(row);

      // Date — "Mon Apr 20" in span.date (only in first row of the day)
      const dateText = nullIfEmpty($row.find('td.calendar__date span.date').text());
      if (dateText) {
        const parsed = parseFFDateText(dateText);
        if (parsed) {
          currentDate = parsed;
          // Noon UTC — timezone-safe sort key (avoids off-by-one on UTC+ servers)
          const [y, mo, d] = parsed.split('-').map(Number);
          currentTimestamp = Date.UTC(y, mo - 1, d, 12, 0, 0);
        }
      }

      // Time — direct text in td.calendar__time
      const timeText = nullIfEmpty($row.find('td.calendar__time').text());
      if (timeText) currentTimeStr = timeText.toLowerCase().replace(/\s/g, '');

      const currText = nullIfEmpty($row.find('td.calendar__currency').text());
      if (currText) currentCurrency = currText;

      const currency = normalizeCurrency(currentCurrency);
      if (!currency || !currentDate) return;

      const impactClass = $row.find('td.calendar__impact span[class*="icon--ff-impact"]').attr('class') ?? '';
      const impact = parseImpact(impactClass);

      const title = nullIfEmpty(
        $row.find('td.calendar__event .calendar__event-title').text() ||
          $row.find('td.calendar__event a').first().text() ||
          $row.find('td.calendar__event span').first().text(),
      );
      if (!title) return;

      const actual = nullIfEmpty($row.find('td.calendar__actual').text());
      const forecast = nullIfEmpty($row.find('td.calendar__forecast').text());
      const previous = nullIfEmpty($row.find('td.calendar__previous').text());

      results.push({
        date: currentDate,
        time: currentTimeStr || 'All Day',
        timestamp: currentTimestamp,
        currency,
        impact,
        title,
        actual,
        forecast,
        previous,
      });
    });

  return results;
}

// Build a merge-key map: { mergeKey → actual } from HTML data
function buildActualsMap(htmlActuals: HTMLActual[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of htmlActuals) {
    if (item.actual) {
      map.set(mergeKey(item.date, item.currency, item.title), item.actual);
    }
  }
  return map;
}

// Merge actuals from HTML into NFS events
function mergeActuals(events: CalendarEvent[], actualsMap: Map<string, string>): CalendarEvent[] {
  return events.map((ev) => {
    const key = mergeKey(ev.date, ev.currency, ev.title);
    const actual = actualsMap.get(key) ?? null;
    if (actual) {
      return { ...ev, actual, isReleased: true };
    }
    return ev;
  });
}

// ---------- public ----------

function dedup(events: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  return events.filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}

export interface FetchResult {
  events: CalendarEvent[];
  source: 'json' | 'html' | 'mixed' | 'error';
  warnings: string[];
}

export async function fetchCalendarData(): Promise<FetchResult> {
  const warnings: string[] = [];
  let jsonOk = false;
  let htmlOk = false;

  // Step 1: NFS JSON — base event list (no actuals)
  const [thisWeekResult, nextWeekResult] = await Promise.allSettled([
    fetchNfs('thisweek'),
    fetchNfs('nextweek'),
  ]);

  let baseEvents: CalendarEvent[] = [];
  if (thisWeekResult.status === 'fulfilled') {
    baseEvents.push(...thisWeekResult.value);
    jsonOk = true;
  } else {
    warnings.push(`NFS thisweek: ${(thisWeekResult.reason as Error).message}`);
  }
  if (nextWeekResult.status === 'fulfilled') {
    baseEvents.push(...nextWeekResult.value);
    jsonOk = true;
  } else {
    warnings.push(`NFS nextweek: ${(nextWeekResult.reason as Error).message}`);
  }

  // Step 2: FF HTML via curl — for actuals + additional weeks
  // Fetch last week, this week, next week, and 2 weeks ahead
  const htmlWeeks = [ffWeekParam(-1), 'this', ffWeekParam(1), ffWeekParam(2)];
  const htmlResults = await Promise.allSettled(
    htmlWeeks.map((w) => fetchFFHtmlViaCurl(w)),
  );

  const allHtmlActuals: HTMLActual[] = [];
  const extraHtmlEvents: CalendarEvent[] = [];

  for (let i = 0; i < htmlResults.length; i++) {
    const r = htmlResults[i];
    if (r.status === 'rejected' || !r.value) {
      warnings.push(`HTML ${htmlWeeks[i]}: unavailable`);
      continue;
    }
    const parsed = parseFFHtml(r.value);
    allHtmlActuals.push(...parsed);
    htmlOk = true;

    // Collect ALL HTML events as base events.
    // When NFS is available, dedup() keeps the NFS version (inserted first).
    // When NFS is unavailable, HTML events become the full base.
    for (const item of parsed) {
      extraHtmlEvents.push({
        id: makeId(item.date, item.time, item.currency, item.title),
        date: item.date,
        time: item.time,
        timestamp: item.timestamp,
        currency: item.currency,
        impact: item.impact,
        title: item.title,
        actual: item.actual,
        forecast: item.forecast,
        previous: item.previous,
        isReleased: !!item.actual,
      });
    }
  }

  // Step 3: Merge actuals into NFS base events
  const actualsMap = buildActualsMap(allHtmlActuals);
  const mergedBase = mergeActuals(baseEvents, actualsMap);

  // Step 4: Combine and deduplicate
  const all = dedup([...mergedBase, ...extraHtmlEvents]).sort(
    (a, b) => a.timestamp - b.timestamp || a.title.localeCompare(b.title),
  );

  const source: FetchResult['source'] =
    jsonOk && htmlOk ? 'mixed' : jsonOk ? 'json' : htmlOk ? 'html' : 'error';

  if (warnings.length) {
    console.warn('[ForexFactory] Partial failures:', warnings);
  }

  return { events: all, source, warnings };
}
