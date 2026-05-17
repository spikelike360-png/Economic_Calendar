import { NextResponse } from 'next/server';
import { fetchTEMetrics } from '@/lib/scraper/tradingEconomicsApi';
import { macroMetrics as FALLBACK } from '@/lib/macroData';
import { memCache } from '@/lib/scraper/cache';
import type { MacroMetric, MetricsResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'metrics_te';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function isResultFresh(metrics: MacroMetric[]): boolean {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 3);
  const cutoffStr = cutoff.toISOString().slice(0, 7);
  const dates = metrics.flatMap((m) => [
    m.interestRate.lastUpdated,
    m.inflation.lastUpdated,
    m.unemployment.lastUpdated,
    m.gdpGrowth.lastUpdated,
  ]);
  const freshCount = dates.filter((d) => d >= cutoffStr).length;
  return freshCount >= dates.length * 0.25;
}

export async function GET() {
  // Hot in-memory cache
  const cached = memCache.get<MetricsResponse>(CACHE_KEY);
  if (cached && !cached.isStale) {
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' },
    });
  }

  try {
    const metrics = await fetchTEMetrics();

    if (!isResultFresh(metrics)) {
      console.warn('[metrics] TE returned stale data — serving fallback');
      return NextResponse.json({
        metrics: FALLBACK,
        fetchedAt: new Date().toISOString(),
        isStale: true,
        source: 'fallback' as const,
        error: 'Trading Economics data appears stale',
      } satisfies MetricsResponse, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const response: MetricsResponse = {
      metrics,
      fetchedAt: new Date().toISOString(),
      isStale: false,
      source: 'fred' as const, // keeping same field value for UI compatibility
    };
    memCache.set(CACHE_KEY, response, CACHE_TTL);
    return NextResponse.json(response, {
      headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('[metrics] TE fetch error:', err);

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
      error: 'Fetch failed — showing static fallback',
    } satisfies MetricsResponse, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
