// RSS news aggregator — no API key required.
// Sources: Yahoo Finance, CNBC Economy, MarketWatch

export type NewsCategory = 'macro' | 'markets' | 'earnings' | 'general';

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;   // ISO string
  summary: string;
  category: NewsCategory;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const FEEDS: { url: string; source: string; defaultCategory: NewsCategory }[] = [
  { url: 'https://finance.yahoo.com/news/rssindex',                         source: 'Yahoo Finance',  defaultCategory: 'markets'  },
  { url: 'https://www.cnbc.com/id/20910258/device/rss/rss.html',            source: 'CNBC',           defaultCategory: 'macro'    },
  { url: 'https://feeds.marketwatch.com/marketwatch/topstories',            source: 'MarketWatch',    defaultCategory: 'markets'  },
  { url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines', source: 'MarketWatch RT', defaultCategory: 'markets' },
];

// ---------- XML helpers ----------

function extractTag(xml: string, tag: string): string {
  // Handles CDATA and plain text
  const re = new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))<\/${tag}>`, 'i');
  const m = xml.match(re);
  return ((m?.[1] ?? m?.[2]) || '').trim();
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').trim();
}

// ---------- category detection ----------

const MACRO_KW   = /\b(GDP|inflation|CPI|PPI|fed|federal reserve|ecb|boe|boj|interest rate|unemployment|jobs report|nonfarm|payroll|treasury|yield|monetary|fiscal|recession|central bank|tariff|trade war|sanctions|imf|world bank)\b/i;
const EARN_KW    = /\b(earnings|EPS|revenue|profit|loss|quarterly results|Q[1-4] \d{4}|beats|misses|guidance|outlook|dividend|buyback|ipo|acquisition|merger|deal)\b/i;
const MARKETS_KW = /\b(S&P|nasdaq|dow jones|nasdaq|stocks?|shares?|equities|rally|selloff|bull|bear|futures|options|hedge fund|wall street|NYSE|index|indices|crude oil|gold|commodities)\b/i;

function classify(title: string, desc: string, def: NewsCategory): NewsCategory {
  const text = `${title} ${desc}`;
  if (EARN_KW.test(text)) return 'earnings';
  if (MACRO_KW.test(text)) return 'macro';
  if (MARKETS_KW.test(text)) return 'markets';
  return def;
}

// ---------- RSS parser ----------

async function fetchFeed(feed: typeof FEEDS[0]): Promise<NewsItem[]> {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [];
    const xml = await res.text();

    const rawItems = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    return rawItems.slice(0, 20).map((item): NewsItem | null => {
      const title = stripHtml(extractTag(item, 'title'));
      if (!title) return null;

      const url = extractTag(item, 'link') || extractTag(item, 'guid');
      const pubDateStr = extractTag(item, 'pubDate');
      const summary = stripHtml(extractTag(item, 'description')).slice(0, 200);

      let publishedAt: string;
      try {
        publishedAt = pubDateStr ? new Date(pubDateStr).toISOString() : new Date().toISOString();
      } catch {
        publishedAt = new Date().toISOString();
      }

      return {
        id: `${feed.source}::${title.slice(0, 60)}`,
        title,
        url,
        source: feed.source,
        publishedAt,
        summary,
        category: classify(title, summary, feed.defaultCategory),
      };
    }).filter((x): x is NewsItem => x !== null);
  } catch {
    return [];
  }
}

// ---------- public ----------

export async function fetchAllNews(): Promise<NewsItem[]> {
  const results = await Promise.all(FEEDS.map(fetchFeed));
  const all = results.flat();

  // Deduplicate by title prefix (same story from multiple sources)
  const seen = new Set<string>();
  const deduped = all.filter(item => {
    const key = item.title.slice(0, 50).toLowerCase().replace(/\W+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort newest first
  return deduped.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}
