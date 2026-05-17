# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server (localhost:3000)
npm run build    # production build + type check
npm run lint     # ESLint
npx tsc --noEmit # type check only (faster than build)
vercel --prod    # deploy to production
```

No test suite exists. Verify changes by running the dev server or deploying to Vercel.

## Architecture

**Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS. Deployed on Vercel hobby plan (10s function timeout).

**Page structure:** Single-page app — `src/app/page.tsx` renders one of 5 sections based on `active` state. Navigation is client-side only via `Sidebar`. No routing.

**Sections:** Calendar · Macro Metrics · News Feed · COT Report · Notes

---

### Data flow

All data is fetched server-side via Next.js route handlers in `src/app/api/`:

| Route | Source | Cache strategy |
|---|---|---|
| `/api/calendar` | Forex Factory (NFS JSON + FF HTML via curl) | memCache 14 min, CDN 5 min |
| `/api/metrics` | FRED API (24 parallel fetches) + World Bank fallback | memCache 6h, CDN 6h, `/tmp` disk cache |
| `/api/cot` | CFTC ZIP → XLS parse | memCache + `/tmp` disk cache until next Friday |
| `/api/news` | RSS feeds (Yahoo Finance, CNBC, MarketWatch) | memCache only |

Client components fetch from these routes on mount, then refresh on an interval.

**Three-layer cache for metrics and COT:**
1. `memCache` (module-level Map, process-scoped — dies on cold start)
2. `/tmp` disk cache (survives within the same Vercel instance region)
3. Live fetch from upstream API

**Calendar client cache:** Module-level variable `_calCache` in `CalendarSection.tsx` survives navigation between sections.

---

### Key scrapers

**`src/lib/scraper/forexFactory.ts`**
- NFS JSON (`nfs.faireconomy.media`) = authoritative event list, no actuals
- FF HTML via system `curl` subprocess (bypasses Cloudflare TLS fingerprint detection that blocks Node.js fetch). Falls back silently if curl unavailable.
- Fetches last week, this week, next week, +2 weeks ahead
- Merge strategy: NFS events first, HTML events deduped after (NFS wins on conflict); HTML provides actuals

**`src/lib/scraper/fredApi.ts`**
- 6 currencies × 4 metrics = 24 parallel FRED fetches
- Per-series: try FRED → try World Bank (some series) → return static fallback from `macroData.ts`
- Silent fallback: if FRED times out, `buildMetric` returns Dec 2024 static data without throwing. Route detects this via `isResultFresh()` (checks lastUpdated dates; < 25% of series within 9 months = treat as failed)
- **Always `.trim()` the `FRED_API_KEY` env var** — Vercel's editor adds silent whitespace, causing HTTP 400

**`src/lib/scraper/cotData.ts`**
- Downloads `dea_fut_xls_{year}.zip` from CFTC, parses binary XLS via JSZip + SheetJS
- Contract matching: `startsWith` (case-insensitive) on `Market_and_Exchange_Names` column — `includes` causes wrong contracts (micro-contracts match before main contracts)
- Fetches current year + previous year, keeps last 26 weeks of history per contract

---

### Types

All shared types in `src/lib/types.ts`. Key ones:
- `CalendarEvent` — has `isReleased: boolean`, `actual/forecast/previous: string | null`
- `MetricsResponse.source` — `'fred' | 'fallback' | 'error'` (not `'fred'` when FRED fails silently)
- `COTPosition` — includes `changeLong`, `changeShort`, `spread?`, `changeSpread?`

---

### Deployment notes

- `FRED_API_KEY` must be set in Vercel production env (not just dev). Add `.trim()` when reading it.
- COT route uses `export const revalidate = 86400` — Vercel CDN caches for 24h
- Metrics route uses `export const dynamic = 'force-dynamic'` — never pre-rendered at build
- Calendar route uses `export const revalidate = 300` — CDN 5 min revalidate
- Vercel hobby plan: 10s function timeout. FRED timeout is 7s per individual fetch to leave headroom.
- `/tmp` is writable on Vercel and is shared across warm instances in the same region
