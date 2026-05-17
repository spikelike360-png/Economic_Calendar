import { NextResponse } from 'next/server';
import { fetchTradingsterCOT } from '@/lib/scraper/tradingsterCot';
import { memCache } from '@/lib/scraper/cache';
import { readDiskCache, writeDiskCache, cotCacheTtlMs } from '@/lib/scraper/cotDiskCache';
import type { COTResponse } from '@/lib/types';

const CACHE_KEY = 'cot_v4';

export const revalidate = 3600; // Vercel CDN: 1h — disk cache handles real staleness check

export async function GET() {
  // 1. Hot in-memory cache
  const mem = memCache.get<COTResponse>(CACHE_KEY);
  if (mem && !mem.isStale) {
    return NextResponse.json(mem.data);
  }

  // 2. Disk cache (survives server restarts, valid until next CFTC Friday release)
  const disk = readDiskCache();
  if (disk) {
    const ttl = cotCacheTtlMs();
    memCache.set(CACHE_KEY, disk, ttl);
    return NextResponse.json(disk);
  }

  // 3. Fetch from Tradingster
  try {
    const data = await fetchTradingsterCOT();
    if (data.contracts.length) {
      writeDiskCache(data);
      memCache.set(CACHE_KEY, data, cotCacheTtlMs());
    }
    return NextResponse.json(data);
  } catch (err) {
    console.error('[cot] Fatal fetch error:', err);

    if (mem) {
      return NextResponse.json({ ...mem.data, isStale: true, source: 'cache' } satisfies COTResponse);
    }

    return NextResponse.json(
      {
        contracts: [],
        fetchedAt: new Date().toISOString(),
        isStale: true,
        source: 'error',
        error: 'Failed to fetch COT data.',
      } satisfies COTResponse,
      { status: 503 },
    );
  }
}
