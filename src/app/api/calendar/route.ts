import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarData, fetchHistoricalWeek } from '@/lib/scraper/forexFactory';
import { memCache } from '@/lib/scraper/cache';
import { writeCalendarDiskCache } from '@/lib/scraper/calendarDiskCache';
import type { CalendarResponse } from '@/lib/types';

const CACHE_KEY = 'calendar_v2';
const CACHE_TTL = 14 * 60 * 1000; // 14 min — slightly under Next.js 15-min revalidate

export const revalidate = 300; // Vercel CDN cache — revalidates every 5 min

export async function GET(req: NextRequest) {
  const week = req.nextUrl.searchParams.get('week'); // YYYY-MM-DD in the target week

  if (week) {
    try {
      const result = await fetchHistoricalWeek(week);
      return NextResponse.json(
        {
          events: result.events,
          fetchedAt: new Date().toISOString(),
          isStale: false,
          source: result.source,
        } satisfies CalendarResponse,
        { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } },
      );
    } catch {
      return NextResponse.json(
        { events: [], fetchedAt: new Date().toISOString(), isStale: true, source: 'error' as const, error: 'Failed to fetch historical week.' } satisfies CalendarResponse,
        { status: 503 },
      );
    }
  }

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
    writeCalendarDiskCache(events);
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
