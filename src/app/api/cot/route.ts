import { NextResponse } from 'next/server';
import { fetchCOTData } from '@/lib/scraper/cotData';
import { memCache } from '@/lib/scraper/cache';
import { readDiskCache, writeDiskCache, cotCacheTtlMs } from '@/lib/scraper/cotDiskCache';
import type { COTResponse } from '@/lib/types';

const CACHE_KEY = 'cot';

export const revalidate = 86400; // Vercel CDN: 24h

export async function GET() {
  // 1. Hot in-memory cache (process-level, survives rapid requests)
  const mem = memCache.get<COTResponse>(CACHE_KEY);
  if (mem && !mem.isStale) {
    return NextResponse.json(mem.data);
  }

  // 2. Disk cache (survives server restarts, invalidated by new CFTC report)
  const disk = readDiskCache();
  if (disk) {
    const ttl = cotCacheTtlMs();
    memCache.set(CACHE_KEY, disk, ttl);
    return NextResponse.json(disk);
  }

  // 3. Fetch from CFTC
  try {
    const data = await fetchCOTData();
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
