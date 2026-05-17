import fs from 'fs';
import os from 'os';
import path from 'path';
import type { MetricsResponse } from '@/lib/types';

const CACHE_PATH = path.join(os.tmpdir(), 'metrics_cache.json');
const MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

export function readMetricsDiskCache(): MetricsResponse | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const data: MetricsResponse = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    const age = Date.now() - new Date(data.fetchedAt).getTime();
    if (age < MAX_AGE_MS && data.source === 'fred') return data;
    console.log('[metrics] Disk cache stale or not fred — re-fetching');
    return null;
  } catch {
    return null;
  }
}

export function writeMetricsDiskCache(data: MetricsResponse): void {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data), 'utf-8');
    console.log('[metrics] Disk cache written — fetchedAt:', data.fetchedAt);
  } catch (err) {
    console.warn('[metrics] Failed to write disk cache:', err);
  }
}
