import { NextResponse } from 'next/server';
import { fetchFredMetrics } from '@/lib/scraper/fredApi';
import { macroMetrics as FALLBACK } from '@/lib/macroData';
import { memCache } from '@/lib/scraper/cache';
import type { MetricsResponse } from '@/lib/types';

export const dynamic = 'force-dynamic'; // never pre-render at build time

const CACHE_KEY = 'metrics';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// No module-level revalidate — Cache-Control is set per-response
// so error/fallback responses are never long-cached by Vercel CDN

export async function GET() {
  const cached = memCache.get<MetricsResponse>(CACHE_KEY);
  if (cached && !cached.isStale) {
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' },
    });
  }

  const apiKey = process.env.FRED_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      metrics: FALLBACK,
      fetchedAt: new Date().toISOString(),
      isStale: true,
      source: 'fallback' as const,
      error: 'FRED_API_KEY not set — showing static data',
    } satisfies MetricsResponse, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  }

  try {
    const metrics = await fetchFredMetrics(apiKey);
    const response: MetricsResponse = {
      metrics,
      fetchedAt: new Date().toISOString(),
      isStale: false,
      source: 'fred',
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
      } satisfies MetricsResponse, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    return NextResponse.json({
      metrics: FALLBACK,
      fetchedAt: new Date().toISOString(),
      isStale: true,
      source: 'fallback' as const,
      error: 'FRED fetch failed — showing static fallback data',
    } satisfies MetricsResponse, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
