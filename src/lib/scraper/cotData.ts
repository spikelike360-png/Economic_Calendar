import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import type { COTContract, COTPosition, COTResponse } from '@/lib/types';

const HISTORY_WEEKS = 26;
const CFTC_BASE = 'https://www.cftc.gov/files/dea/history';

// match strings use startsWith (case-insensitive) — keep specific enough to avoid micro/cross-rate contracts
export const CONTRACT_DEFS = [
  { key: 'eur', match: 'EURO FX -',              label: 'EUR/USD',   exchange: 'CME',   category: 'currency'  },
  { key: 'gbp', match: 'BRITISH POUND -',        label: 'GBP/USD',   exchange: 'CME',   category: 'currency'  },
  { key: 'jpy', match: 'JAPANESE YEN -',         label: 'JPY',       exchange: 'CME',   category: 'currency'  },
  { key: 'cad', match: 'CANADIAN DOLLAR',        label: 'CAD',       exchange: 'CME',   category: 'currency'  },
  { key: 'aud', match: 'AUSTRALIAN DOLLAR',      label: 'AUD/USD',   exchange: 'CME',   category: 'currency'  },
  { key: 'dxy', match: 'USD INDEX',              label: 'USD Index', exchange: 'ICE',   category: 'currency'  },
  { key: 'gold',match: 'GOLD - COMMODITY',       label: 'Gold',      exchange: 'COMEX', category: 'commodity' },
  { key: 'wti', match: 'CRUDE OIL, LIGHT SWEET', label: 'WTI Crude', exchange: 'ICE',   category: 'commodity' },
  { key: 'spx', match: 'E-MINI S&P 500 -',       label: 'S&P 500',   exchange: 'CME',   category: 'commodity' },
  { key: 'xag', match: 'SILVER - COMMODITY',     label: 'Silver',    exchange: 'COMEX', category: 'commodity' },
] as const;

interface RawRow {
  market: string;
  date: string; // YYYY-MM-DD
  openInterest: number;
  ncLong: number;
  ncShort: number;
  ncSpread: number;
  commLong: number;
  commShort: number;
  nrLong: number;
  nrShort: number;
  changeNcLong: number;
  changeNcShort: number;
  changeNcSpread: number;
  changeCommLong: number;
  changeCommShort: number;
  changeNrLong: number;
  changeNrShort: number;
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (typeof v === 'string') {
    const n = parseInt(v.replace(/,/g, '').trim(), 10);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// XLS date column is YYMMDD (e.g. 251230 = 2025-12-30)
function parseYYMMDD(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!/^\d{6}$/.test(s)) return null;
  const yy = s.slice(0, 2);
  const mm = s.slice(2, 4);
  const dd = s.slice(4, 6);
  const year = parseInt(yy) >= 80 ? `19${yy}` : `20${yy}`;
  return `${year}-${mm}-${dd}`;
}

async function fetchYearXls(year: number): Promise<RawRow[]> {
  const url = `${CFTC_BASE}/dea_fut_xls_${year}.zip`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(45_000),
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) {
      console.warn(`[COT] ${year} ZIP: HTTP ${res.status}`);
      return [];
    }

    const buf = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);

    // Find the XLS file inside the ZIP
    const xlsFile = zip.file(/\.xls$/i)[0];
    if (!xlsFile) {
      console.warn(`[COT] No .xls file in ${year} ZIP`);
      return [];
    }

    const xlsBuf = await xlsFile.async('arraybuffer');
    const workbook = XLSX.read(xlsBuf, { type: 'array', cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rows.length < 2) return [];

    // Map column names to indices from header row
    const header = (rows[0] as unknown[]).map((h) => String(h).trim());
    const col = (name: string) => header.indexOf(name);

    const marketCol     = col('Market_and_Exchange_Names');
    const dateCol       = col('As_of_Date_In_Form_YYMMDD');
    const oiCol         = col('Open_Interest_All');
    const ncLongCol     = col('NonComm_Positions_Long_All');
    const ncShortCol    = col('NonComm_Positions_Short_All');
    const ncSpreadCol   = col('NonComm_Positions_Spread_All');
    const cLongCol      = col('Comm_Positions_Long_All');
    const cShortCol     = col('Comm_Positions_Short_All');
    const nrLongCol     = col('NonRept_Positions_Long_All');
    const nrShortCol    = col('NonRept_Positions_Short_All');
    const chNcLCol      = col('Change_in_NonComm_Long_All');
    const chNcSCol      = col('Change_in_NonComm_Short_All');
    const chNcSpCol     = col('Change_in_NonComm_Spread_All');
    const chCLCol       = col('Change_in_Comm_Long_All');
    const chCSCol       = col('Change_in_Comm_Short_All');
    const chNrLCol      = col('Change_in_NonRept_Long_All');
    const chNrSCol      = col('Change_in_NonRept_Short_All');

    const result: RawRow[] = [];
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] as unknown[];
      const date = parseYYMMDD(r[dateCol]);
      if (!date) continue;
      result.push({
        market:           String(r[marketCol] ?? '').trim(),
        date,
        openInterest:     toNum(r[oiCol]),
        ncLong:           toNum(r[ncLongCol]),
        ncShort:          toNum(r[ncShortCol]),
        ncSpread:         toNum(r[ncSpreadCol]),
        commLong:         toNum(r[cLongCol]),
        commShort:        toNum(r[cShortCol]),
        nrLong:           toNum(r[nrLongCol]),
        nrShort:          toNum(r[nrShortCol]),
        changeNcLong:     toNum(r[chNcLCol]),
        changeNcShort:    toNum(r[chNcSCol]),
        changeNcSpread:   toNum(r[chNcSpCol]),
        changeCommLong:   toNum(r[chCLCol]),
        changeCommShort:  toNum(r[chCSCol]),
        changeNrLong:     toNum(r[chNrLCol]),
        changeNrShort:    toNum(r[chNrSCol]),
      });
    }
    console.log(`[COT] ${year}: parsed ${result.length} rows`);
    return result;
  } catch (err) {
    console.warn(`[COT] Failed to fetch/parse ${year}:`, err);
    return [];
  }
}

function makePosition(long: number, short: number, chLong: number, chShort: number): COTPosition {
  return { long, short, net: long - short, changeLong: chLong, changeShort: chShort, changeNet: chLong - chShort };
}

export async function fetchCOTData(): Promise<COTResponse> {
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1];

  const allRows = (await Promise.all(years.map(fetchYearXls))).flat();

  if (!allRows.length) {
    return {
      contracts: [],
      fetchedAt: new Date().toISOString(),
      isStale: true,
      source: 'error',
      error: 'Failed to fetch COT data from CFTC',
    };
  }

  // Group by market name
  const byMarket = new Map<string, RawRow[]>();
  for (const row of allRows) {
    if (!byMarket.has(row.market)) byMarket.set(row.market, []);
    byMarket.get(row.market)!.push(row);
  }

  const contracts: COTContract[] = [];

  for (const def of CONTRACT_DEFS) {
    const matchUpper = def.match.toUpperCase();
    let rows: RawRow[] | undefined;
    for (const market of Array.from(byMarket.keys())) {
      if (market.toUpperCase().startsWith(matchUpper)) {
        rows = byMarket.get(market);
        break;
      }
    }
    if (!rows?.length) {
      console.warn(`[COT] No data found for "${def.match}"`);
      continue;
    }

    rows.sort((a, b) => b.date.localeCompare(a.date));
    const latest = rows[0];
    const history = rows.slice(0, HISTORY_WEEKS).reverse();

    contracts.push({
      key: def.key,
      label: def.label,
      exchange: def.exchange,
      category: def.category,
      reportDate: latest.date,
      openInterest: latest.openInterest,
      nonCommercial: {
        ...makePosition(latest.ncLong, latest.ncShort, latest.changeNcLong, latest.changeNcShort),
        spread: latest.ncSpread,
        changeSpread: latest.changeNcSpread,
      },
      commercial:    makePosition(latest.commLong, latest.commShort, latest.changeCommLong, latest.changeCommShort),
      nonReportable: makePosition(latest.nrLong, latest.nrShort, latest.changeNrLong, latest.changeNrShort),
      history: history.map((r) => ({ date: r.date, net: r.ncLong - r.ncShort })),
    });
  }

  return {
    contracts,
    fetchedAt: new Date().toISOString(),
    isStale: false,
    source: 'cftc',
  };
}
