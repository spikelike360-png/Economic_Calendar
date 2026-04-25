import { NextResponse } from 'next/server';
import { fetchFredMetrics } from '@/lib/scraper/fredApi';
import { macroMetrics as FALLBACK } from '@/lib/macroData';
import { memCache } from '@/lib/scraper/cache';
import type { MetricsResponse } from '@/lib/types';

const CACHE_KEY = 'metrics';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

export const revalidate = 21600; // Vercel CDN cache — revalidates every 6 hours

export async function GET() {
  const cached = memCache.get<MetricsResponse>(CACHE_KEY);
  if (cached && !cached.isStale) {
    return NextResponse.json(cached.data);
  }

  const apiKey = process.env.FRED_API_KEY;

  try {
    const metrics = apiKey ? await fetchFredMetrics(apiKey) : FALLBACK;

    const response: MetricsResponse = {
      metrics,
      fetchedAt: new Date().toISOString(),
      isStale: false,
      source: apiKey ? 'fred' : 'fallback',
      ...(!apiKey && { error: 'FRED_API_KEY not set — showing static data' }),
    };
    memCache.set(CACHE_KEY, response, CACHE_TTL);
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('[metrics] fetch error:', err);

    if (cached) {
      return NextResponse.json({
        ...cached.data,
        isStale: true,
        error: 'Data unavailable — showing cached data',
      } satisfies MetricsResponse);
    }

    return NextResponse.json({
      metrics: FALLBACK,
      fetchedAt: new Date().toISOString(),
      isStale: true,
      source: 'fallback' as const,
      error: 'Data unavailable — showing static fallback data',
    } satisfies MetricsResponse);
  }
}
