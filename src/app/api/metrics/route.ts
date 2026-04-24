import { NextResponse } from 'next/server';
import { fetchFredMetrics } from '@/lib/scraper/fredApi';
import { fetchTEMetrics } from '@/lib/scraper/teScraper';
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
    // USD from FRED, EUR/GBP/JPY/CAD/AUD from Trading Economics (no key needed)
    const [usdMetrics, nonUsdMetrics] = await Promise.all([
      apiKey
        ? fetchFredMetrics(apiKey, ['USD'])
        : Promise.resolve([FALLBACK.find((m) => m.id === 'USD')!]),
      fetchTEMetrics(),
    ]);

    const metrics = [...usdMetrics, ...nonUsdMetrics];
    const response: MetricsResponse = {
      metrics,
      fetchedAt: new Date().toISOString(),
      isStale: false,
      source: apiKey ? 'fred' : 'fallback',
      ...(!apiKey && { error: 'FRED_API_KEY not set — USD using static data' }),
    };
    memCache.set(CACHE_KEY, response, CACHE_TTL);
    return NextResponse.json(response);
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
