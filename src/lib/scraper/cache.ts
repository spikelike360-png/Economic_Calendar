// Module-level in-memory cache — persists within a single Node.js process.
// On Vercel's serverless each invocation may be a new process, so this is
// best-effort (great for dev, helps warm lambdas in prod).

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  ttlMs: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, { data, cachedAt: Date.now(), ttlMs });
  }

  get<T>(key: string): { data: T; isStale: boolean; age: number } | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    const age = Date.now() - entry.cachedAt;
    return { data: entry.data, isStale: age > entry.ttlMs, age };
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

export const memCache = new MemoryCache();
