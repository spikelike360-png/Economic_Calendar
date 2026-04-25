import { NextResponse } from 'next/server';
import { fetchAllNews } from '@/lib/scraper/newsFeeds';
import { memCache } from '@/lib/scraper/cache';

const CACHE_KEY = 'news';
const CACHE_TTL = 15 * 60 * 1000; // 15 min

export const revalidate = 900;

export async function GET() {
  const cached = memCache.get<{ items: Awaited<ReturnType<typeof fetchAllNews>>; fetchedAt: string }>(CACHE_KEY);
  if (cached && !cached.isStale) {
    return NextResponse.json(cached.data);
  }

  try {
    const items = await fetchAllNews();
    const data = { items, fetchedAt: new Date().toISOString() };
    memCache.set(CACHE_KEY, data, CACHE_TTL);
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=86400' },
    });
  } catch (err) {
    console.error('[news] fetch error:', err);
    if (cached) return NextResponse.json({ ...cached.data, isStale: true });
    return NextResponse.json({ items: [], fetchedAt: new Date().toISOString() }, { status: 503 });
  }
}
