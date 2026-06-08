import { NextResponse } from 'next/server';
import { get as nodeGet } from 'https';

export const dynamic = 'force-dynamic';

export interface WhaleCohort {
  range:    string;   // e.g. "100 – 1K"
  addresses: number;
  btc:      number;
  pctSupply: number;
}

export interface WhaleData {
  cohorts:      WhaleCohort[];
  totalWhaleAddresses: number;   // 100+ BTC
  totalWhaleBtc:       number;
  pctSupplyByWhales:   number;
  fetchedAt:    string;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const CACHE_TTL = 60 * 60 * 1000; // 1 hour — data updates slowly
let memCache: { data: WhaleData; ts: number } | null = null;

// ── HTTP ──────────────────────────────────────────────────────────────────────

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = nodeGet(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept':     'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
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

// ── Parser ────────────────────────────────────────────────────────────────────

function parseDistribution(html: string): WhaleCohort[] {
  const tableStart = html.indexOf('<table class="table table-condensed bb"');
  if (tableStart === -1) throw new Error('Distribution table not found');
  const tableEnd = html.indexOf('</table>', tableStart) + 8;
  const table = html.slice(tableStart, tableEnd);

  // Each <tr> row — strip tags to get cell text
  const rowMatches = table.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
  const cohorts: WhaleCohort[] = [];

  for (const row of rowMatches) {
    const tds = row.match(/<td[^>]*>([\s\S]*?)<\/td>/g) ?? [];
    const cells = tds.map((td) => td.replace(/<[^>]+>/g, '').replace(/,/g, '').trim());
    if (cells.length < 4) continue;

    const rangeRaw = cells[0];   // e.g. "[100 - 1,000)"
    const addrStr  = cells[1];   // address count
    const btcStr   = cells[3];   // BTC held

    const addrCount = parseInt(addrStr.replace(/\D/g, ''), 10);
    const btcHeld   = parseFloat(btcStr.replace(/[^0-9.]/g, ''));
    if (isNaN(addrCount) || isNaN(btcHeld)) continue;

    // Only whale cohorts: 100+ BTC
    // Range labels start with "[100 " or "[1,000 " etc.
    const lower = parseFloat(rangeRaw.replace(/[^0-9.]/g, '').split('')[0] ?? '0');
    // Parse lower bound from range string
    const lowerMatch = rangeRaw.match(/[\[(]([\d,]+)/);
    if (!lowerMatch) continue;
    const lowerBound = parseInt(lowerMatch[1].replace(/,/g, ''), 10);
    if (lowerBound < 100) continue;

    // pctSupply from cells[5] e.g. "25.89% (61.65%)"
    const pctMatch = cells[5]?.match(/([\d.]+)%/);
    const pctSupply = pctMatch ? parseFloat(pctMatch[1]) : 0;

    // Friendly label
    const label = lowerBound >= 100_000 ? '100K – 1M'
                : lowerBound >= 10_000  ? '10K – 100K'
                : lowerBound >= 1_000   ? '1K – 10K'
                :                         '100 – 1K';

    cohorts.push({ range: label, addresses: addrCount, btc: btcHeld, pctSupply });
  }

  return cohorts;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  if (memCache && Date.now() - memCache.ts < CACHE_TTL) {
    return NextResponse.json(memCache.data);
  }

  const html = await fetchHtml(
    'https://bitinfocharts.com/top-100-richest-bitcoin-addresses.html',
  );

  const cohorts = parseDistribution(html);
  if (cohorts.length === 0) {
    return NextResponse.json({ error: 'No whale cohorts parsed' }, { status: 502 });
  }

  const totalWhaleAddresses = cohorts.reduce((s, c) => s + c.addresses, 0);
  const totalWhaleBtc       = cohorts.reduce((s, c) => s + c.btc, 0);
  const pctSupplyByWhales   = cohorts.reduce((s, c) => s + c.pctSupply, 0);

  const data: WhaleData = {
    cohorts,
    totalWhaleAddresses,
    totalWhaleBtc,
    pctSupplyByWhales,
    fetchedAt: new Date().toISOString(),
  };

  memCache = { data, ts: Date.now() };
  return NextResponse.json(data);
}
