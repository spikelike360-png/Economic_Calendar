import fs from 'fs';
import os from 'os';
import path from 'path';
import type { COTResponse } from '@/lib/types';

const CACHE_PATH = path.join(os.tmpdir(), 'cot_cache_v4.json');

// US Eastern DST: second Sunday in March → first Sunday in November
function isEDT(date: Date): boolean {
  const y = date.getUTCFullYear();
  const mar1Day = new Date(Date.UTC(y, 2, 1)).getUTCDay();
  const dstStart = new Date(Date.UTC(y, 2, (7 - mar1Day) % 7 + 8, 7, 0)); // 2 AM ET = 07:00 UTC
  const nov1Day  = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  const dstEnd   = new Date(Date.UTC(y, 10, (7 - nov1Day) % 7 + 1, 6, 0)); // 2 AM EDT = 06:00 UTC
  return date >= dstStart && date < dstEnd;
}

// COT releases: every Friday 3:30 PM ET (19:30 UTC during EDT, 20:30 UTC during EST)
function msUntilNextRelease(): number {
  const now = new Date();
  const daysUntilFriday = (5 - now.getUTCDay() + 7) % 7;
  const target = new Date(now);
  target.setUTCDate(target.getUTCDate() + daysUntilFriday);
  target.setUTCHours(isEDT(target) ? 19 : 20, 30, 0, 0);

  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 7);
    target.setUTCHours(isEDT(target) ? 19 : 20, 30, 0, 0);
  }

  return target.getTime() - now.getTime();
}

export function isCOTCacheFresh(data: COTResponse): boolean {
  if (!data.contracts.length) return false;

  // Find the latest reportDate across all contracts
  const latestReport = data.contracts.reduce((latest, c) =>
    c.reportDate > latest ? c.reportDate : latest, '');

  if (!latestReport) return false;

  // COT data is weekly. If the report date is < 8 days old, it's still current.
  // A new release won't have a newer Tuesday date until next week.
  const reportTs = new Date(latestReport + 'T00:00:00Z').getTime();
  const ageMs = Date.now() - reportTs;
  return ageMs < 8 * 24 * 60 * 60 * 1000; // 8 days
}

export function readDiskCache(): COTResponse | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
    const data: COTResponse = JSON.parse(raw);
    if (isCOTCacheFresh(data)) {
      console.log('[COT] Serving from disk cache — report date:', data.contracts[0]?.reportDate);
      return data;
    }
    console.log('[COT] Disk cache stale — re-fetching');
    return null;
  } catch {
    return null;
  }
}

export function writeDiskCache(data: COTResponse): void {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data), 'utf-8');
    console.log('[COT] Disk cache written — report date:', data.contracts[0]?.reportDate);
  } catch (err) {
    console.warn('[COT] Failed to write disk cache:', err);
  }
}

// TTL for memCache: time until next Friday release, capped at 7 days
export function cotCacheTtlMs(): number {
  const until = msUntilNextRelease();
  return Math.min(until, 7 * 24 * 60 * 60 * 1000);
}
