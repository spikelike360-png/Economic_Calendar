import fs from 'fs';
import path from 'path';
import type { COTResponse } from '@/lib/types';

// Writable on both local dev and Vercel (/tmp is always available)
const CACHE_PATH = path.join('/tmp', 'cot_cache.json');

// COT releases: every Friday ~3:30 PM ET (20:30 UTC)
// Returns ms until next expected release
function msUntilNextRelease(): number {
  const now = new Date();
  const etOffset = -5 * 60; // ET = UTC-5 (EST). DST off for simplicity; adds ~1h buffer at worst
  const etNow = new Date(now.getTime() + etOffset * 60_000);

  // Find next Friday 20:30 UTC
  const target = new Date(now);
  const dayOfWeek = target.getUTCDay(); // 0=Sun, 5=Fri
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7;
  target.setUTCDate(target.getUTCDate() + daysUntilFriday);
  target.setUTCHours(20, 30, 0, 0);

  // If we're past Friday's release, next release is next Friday
  if (target.getTime() <= now.getTime()) {
    target.setUTCDate(target.getUTCDate() + 7);
  }

  void etNow; // suppress unused warning
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
