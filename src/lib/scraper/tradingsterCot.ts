import * as cheerio from 'cheerio';
import type { COTContract, COTHistoryPoint, COTResponse } from '@/lib/types';

const BASE = 'https://www.tradingster.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const CONTRACT_DEFS = [
  // FX
  { key: 'eur',    code: '099741', label: 'EUR',        exchange: 'CME',   category: 'fx'     },
  { key: 'gbp',    code: '096742', label: 'GBP',        exchange: 'CME',   category: 'fx'     },
  { key: 'jpy',    code: '097741', label: 'JPY',        exchange: 'CME',   category: 'fx'     },
  { key: 'cad',    code: '090741', label: 'CAD',        exchange: 'CME',   category: 'fx'     },
  { key: 'aud',    code: '232741', label: 'AUD',        exchange: 'CME',   category: 'fx'     },
  { key: 'nzd',    code: '112741', label: 'NZD',        exchange: 'CME',   category: 'fx'     },
  { key: 'chf',    code: '092741', label: 'CHF',        exchange: 'CME',   category: 'fx'     },
  { key: 'dxy',    code: '098662', label: 'USD Index',  exchange: 'ICE',   category: 'fx'     },
  // Equity Indices
  { key: 'spx',    code: '13874%2B', label: 'S&P 500',   exchange: 'CME',   category: 'index'  },
  { key: 'ndx',    code: '20974%2B', label: 'NASDAQ',    exchange: 'CME',   category: 'index'  },
  { key: 'dji',    code: '12460%2B', label: 'Dow Jones',exchange: 'CME',   category: 'index'  },
  { key: 'rut',    code: '239742', label: 'Russell 2K', exchange: 'CME',   category: 'index'  },
  // Interest Rates
  { key: 'ust10',  code: '043602', label: '10Y Note',   exchange: 'CME',   category: 'rates'  },
  { key: 'ust2',   code: '042601', label: '2Y Note',    exchange: 'CME',   category: 'rates'  },
  { key: 'ust30',  code: '020601', label: '30Y Bond',   exchange: 'CME',   category: 'rates'  },
  { key: 'ff',     code: '045601', label: 'Fed Funds',  exchange: 'CME',   category: 'rates'  },
  // Energy
  { key: 'wti',    code: '067651', label: 'WTI Crude',  exchange: 'NYMEX', category: 'energy' },
  { key: 'ng',     code: '023651', label: 'Nat Gas',    exchange: 'CME',   category: 'energy' },
  // Metals
  { key: 'gold',   code: '088691', label: 'Gold',       exchange: 'COMEX', category: 'metals' },
  { key: 'xag',    code: '084691', label: 'Silver',     exchange: 'COMEX', category: 'metals' },
  { key: 'copper', code: '085692', label: 'Copper',     exchange: 'COMEX', category: 'metals' },
  { key: 'plat',   code: '076651', label: 'Platinum',   exchange: 'NYMEX', category: 'metals' },
  // Agricultural
  { key: 'corn',   code: '002602', label: 'Corn',       exchange: 'CBOT',  category: 'ag'     },
  { key: 'soy',    code: '005602', label: 'Soybeans',   exchange: 'CBOT',  category: 'ag'     },
  { key: 'wheat',  code: '001602', label: 'Wheat',      exchange: 'CBOT',  category: 'ag'     },
  { key: 'cattle', code: '057642', label: 'Live Cattle',exchange: 'CME',   category: 'ag'     },
  { key: 'coffee', code: '083731', label: 'Coffee',     exchange: 'ICE',   category: 'ag'     },
  // Crypto
  { key: 'btc',    code: '133741', label: 'Bitcoin',    exchange: 'CME',   category: 'crypto' },
] as const;

function parseNum(text: string): number {
  const n = parseFloat(text.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseChange(text: string): number {
  // handles "+6,305" / "-500" — strip commas then parse
  const n = parseFloat(text.replace(/,/g, '').replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : (text.trim().startsWith('-') ? -Math.abs(n) : n);
}

async function fetchPage(code: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE}/cot/legacy-futures/${code}`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractHistory(html: string): COTHistoryPoint[] {
  const block = html.match(/var dataNet\s*=\s*\[([\s\S]*?)\];/)?.[1];
  if (!block) return [];

  const re = /\{\s*date:\s*new Date\('([\d-]+)'\),\s*Commercial:\s*(-?\d+),\s*NonCommercial:\s*(-?\d+),\s*NonRept:\s*(-?\d+)(?:[^}]*?close:\s*([\d.-]+))?/g;
  const results: COTHistoryPoint[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    results.push({
      date:       m[1],
      net:        parseInt(m[3]),   // NonCommercial
      commercial: parseInt(m[2]),
      nonRept:    parseInt(m[4]),
      close:      m[5] ? parseFloat(m[5]) : undefined,
    });
  }
  return results;
}

function parsePage(html: string, def: (typeof CONTRACT_DEFS)[number]): COTContract | null {
  const $ = cheerio.load(html);
  const table = $('table.table-striped.table-bordered');
  if (!table.length) return null;

  const rows = table.find('tbody tr');
  if (rows.length < 8) return null;

  // Row 0: contract size label + open interest
  const contractSize = rows.eq(0).find('td').eq(0).text().trim();
  const oiText = rows.eq(0).find('td').last().text().replace(/[^0-9]/g, '');
  const openInterest = parseInt(oiText) || 0;

  // Row 1: 9 position numbers (ncL, ncS, ncSpread, commL, commS, totL, totS, nrL, nrS)
  const pos: number[] = [];
  rows.eq(1).find('td').each((_, td) => { pos.push(parseNum($(td).text())); });

  // Row 2: "Changes" header — change in OI is in the last td
  const changeOIRaw = rows.eq(2).find('td').last().text();
  const changeOI = parseChange(changeOIRaw);

  // Row 3: 9 change numbers (signed)
  const chg: number[] = [];
  rows.eq(3).find('td').each((_, td) => { chg.push(parseChange($(td).text())); });

  // Row 5: pct of OI (9 values)
  const pct: number[] = [];
  rows.eq(5).find('td').each((_, td) => { pct.push(parseNum($(td).text())); });

  // Row 6: total traders (in last td)
  const totalTradersRaw = rows.eq(6).find('td').last().text().replace(/[^0-9]/g, '');
  const totalTraders = parseInt(totalTradersRaw) || 0;

  // Row 7: 7 trader counts
  const traders: number[] = [];
  rows.eq(7).find('td').each((_, td) => {
    const t = $(td).text().trim();
    traders.push(t && t !== ' ' ? (parseInt(t.replace(/,/g, '')) || 0) : 0);
  });

  const history = extractHistory(html);
  const reportDate = history.length > 0 ? history[history.length - 1].date : new Date().toISOString().slice(0, 10);

  const g = (arr: number[], i: number) => arr[i] ?? 0;

  return {
    key:      def.key,
    label:    def.label,
    exchange: def.exchange,
    category: def.category,
    reportDate,
    openInterest,
    changeOI,
    contractSize,
    nonCommercial: {
      long: g(pos,0), short: g(pos,1), net: g(pos,0)-g(pos,1),
      changeLong: g(chg,0), changeShort: g(chg,1), changeNet: g(chg,0)-g(chg,1),
      spread: g(pos,2), changeSpread: g(chg,2),
    },
    commercial: {
      long: g(pos,3), short: g(pos,4), net: g(pos,3)-g(pos,4),
      changeLong: g(chg,3), changeShort: g(chg,4), changeNet: g(chg,3)-g(chg,4),
    },
    total: {
      long: g(pos,5), short: g(pos,6),
      changeLong: g(chg,5), changeShort: g(chg,6),
    },
    nonReportable: {
      long: g(pos,7), short: g(pos,8), net: g(pos,7)-g(pos,8),
      changeLong: g(chg,7), changeShort: g(chg,8), changeNet: g(chg,7)-g(chg,8),
    },
    pctOI:       [g(pct,0),g(pct,1),g(pct,2),g(pct,3),g(pct,4),g(pct,5),g(pct,6),g(pct,7),g(pct,8)],
    traderCount: [g(traders,0),g(traders,1),g(traders,2),g(traders,3),g(traders,4),g(traders,5),g(traders,6)],
    totalTraders,
    history,
  };
}

export async function fetchTradingsterCOT(): Promise<COTResponse> {
  // Fetch in batches of 7 to avoid hammering the server
  const BATCH = 7;
  const results: (COTContract | null)[] = new Array(CONTRACT_DEFS.length).fill(null);

  for (let i = 0; i < CONTRACT_DEFS.length; i += BATCH) {
    const batch = Array.from(CONTRACT_DEFS).slice(i, i + BATCH);
    const htmls = await Promise.all(batch.map((d) => fetchPage(d.code)));
    htmls.forEach((html, j) => {
      if (html) results[i + j] = parsePage(html, CONTRACT_DEFS[i + j]);
    });
  }

  const contracts = results.filter((c): c is COTContract => c !== null);

  if (!contracts.length) {
    return {
      contracts: [],
      fetchedAt: new Date().toISOString(),
      isStale: true,
      source: 'error',
      error: 'Failed to fetch COT data from Tradingster',
    };
  }

  return {
    contracts,
    fetchedAt: new Date().toISOString(),
    isStale: false,
    source: 'tradingster',
  };
}
