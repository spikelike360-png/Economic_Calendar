import { NextResponse } from 'next/server';
import { fetchCalendarData } from '@/lib/scraper/forexFactory';
import { memCache } from '@/lib/scraper/cache';
import type { CalendarResponse } from '@/lib/types';

const CACHE_KEY = 'calendar';
const CACHE_TTL = 14 * 60 * 1000; // 14 min — slightly under Next.js 15-min revalidate

export const revalidate = 300; // Vercel CDN cache — revalidates every 5 min

export async function GET() {
  const cached = memCache.get<CalendarResponse>(CACHE_KEY);

  if (cached && !cached.isStale) {
    return NextResponse.json(cached.data);
  }

  try {
    const { events, source, warnings } = await fetchCalendarData();

    if (warnings.length) {
      console.warn('[calendar] Partial failures:', warnings);
    }

    const response: CalendarResponse = {
      events,
      fetchedAt: new Date().toISOString(),
      isStale: false,
      source,
    };

    memCache.set(CACHE_KEY, response, CACHE_TTL);
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('[calendar] Fatal fetch error:', err);

    // Serve stale cache on error — better than nothing
    if (cached) {
      return NextResponse.json({
        ...cached.data,
        isStale: true,
        source: 'cache' as const,
        error: 'Live fetch failed — showing cached data',
      } satisfies CalendarResponse);
    }

    return NextResponse.json(
      {
        events: [],
        fetchedAt: new Date().toISOString(),
        isStale: true,
        source: 'error' as const,
        error: 'Failed to fetch calendar data. Forex Factory may be unavailable.',
      } satisfies CalendarResponse,
      { status: 503 },
    );
  }
}
