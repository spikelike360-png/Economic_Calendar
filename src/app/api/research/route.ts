import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as cheerio from 'cheerio';
import { memCache } from '@/lib/scraper/cache';
import { readResearchDiskCache, writeResearchDiskCache } from '@/lib/scraper/researchDiskCache';

export const dynamic = 'force-dynamic';

const CACHE_KEY = 'research_v8';
const CACHE_TTL = 3 * 60 * 60 * 1000;

export interface ResearchPaper {
  id: string;
  title: string;
  authors: string;
  abstract: string;
  url: string;
  publishedAt: string;
  source: 'arXiv' | 'NBER';
  category: string;
  arxivCat?: string;
}

export interface ResearchResponse {
  papers: ResearchPaper[];
  fetchedAt: string;
  error?: string;
}

const execAsync = promisify(exec);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── curl fetch (bypasses TLS fingerprint + rate limits) ───────────────────────

async function curlFetch(url: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `curl -s -L --max-time 20 -A "${UA}" "${url}"`,
      { maxBuffer: 4 * 1024 * 1024 },
    );
    return stdout || null;
  } catch (err) {
    console.warn(`[research] curl failed for ${url}:`, err);
    return null;
  }
}

// ── arXiv list page scraper ───────────────────────────────────────────────────

const ARXIV_CATS = [
  { slug: 'q-fin.TR', label: 'Trading & Microstructure' },
  { slug: 'q-fin.PM', label: 'Portfolio Management'     },
  { slug: 'q-fin.ST', label: 'Statistical Finance'      },
  { slug: 'q-fin.RM', label: 'Risk Management'          },
  { slug: 'q-fin.MF', label: 'Mathematical Finance'     },
];

async function fetchArxivCat(slug: string, label: string): Promise<ResearchPaper[]> {
  const html = await curlFetch(`https://arxiv.org/list/${slug}/recent`);
  if (!html) return [];

  const $ = cheerio.load(html);
  const papers: ResearchPaper[] = [];

  // arXiv list pages: <dl> with alternating <dt> (id) and <dd> (metadata)
  $('dl').each((_, dl) => {
    const dts = $(dl).find('dt').toArray();
    const dds = $(dl).find('dd').toArray();

    dts.forEach((dt, i) => {
      const dd = dds[i];
      if (!dd) return;

      // arXiv list page: <a href="/abs/ID" title="Abstract"> inside <dt>
      const idHref = $(dt).find('a[href^="/abs/"]').first().attr('href') ?? '';
      const arxivId = idHref.replace('/abs/', '').trim();
      if (!arxivId) return;

      const url = `https://arxiv.org/abs/${arxivId}`;
      const title = $(dd).find('.list-title').text().replace(/^Title:\s*/i, '').replace(/\s+/g, ' ').trim();
      const authors = $(dd).find('.list-authors').text().replace(/^Authors?:\s*/i, '').replace(/\s+/g, ' ').trim();
      // List pages don't expose abstracts — use subjects as context instead
      const subjects = $(dd).find('.list-subjects').text().replace(/^Subjects?:\s*/i, '').replace(/\s+/g, ' ').trim();
      const abstract = subjects;

      if (!title) return;

      // Find date from preceding h3
      let publishedAt = new Date().toISOString();
      $(dt).prevAll('h3').first().each((_, h3) => {
        const txt = $(h3).text().replace(/\(.*?\)/g, '').trim();
        const d = new Date(txt);
        if (!isNaN(d.getTime())) publishedAt = d.toISOString();
      });

      papers.push({
        id: url,
        title,
        authors: authors.slice(0, 200),
        abstract: abstract.slice(0, 500) + (abstract.length > 500 ? '…' : ''),
        url,
        publishedAt,
        source: 'arXiv',
        category: label,
        arxivCat: slug,
      });
    });
  });

  console.log(`[research] arXiv ${slug}: ${papers.length} papers`);
  return papers;
}

// ── NBER RSS ──────────────────────────────────────────────────────────────────

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchNBER(): Promise<ResearchPaper[]> {
  const xml = await curlFetch('https://www.nber.org/rss/new.xml');
  if (!xml) return [];

  return xml.split(/<item[\s>]/i).slice(1).slice(0, 30).map((block): ResearchPaper | null => {
    const title   = stripHtml(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');
    const rawLink = stripHtml(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '');
    const link    = rawLink || (block.match(/https?:\/\/www\.nber\.org\/papers\/[^\s<"]+/)?.[0] ?? '');
    const desc    = stripHtml(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '');
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? '';
    const creator = stripHtml(block.match(/<dc:creator>([\s\S]*?)<\/dc:creator>/)?.[1] ?? '');
    if (!title || !link) return null;
    return {
      id: link,
      title,
      authors: creator,
      abstract: desc.slice(0, 500) + (desc.length > 500 ? '…' : ''),
      url: link.startsWith('http') ? link : `https://www.nber.org${link}`,
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      source: 'NBER',
      category: 'Economics / Finance',
    };
  }).filter((p): p is ResearchPaper => p !== null);
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const cached = memCache.get<ResearchResponse>(CACHE_KEY);
  if (cached && !cached.isStale) return NextResponse.json(cached.data);

  const disk = readResearchDiskCache();
  if (disk) {
    memCache.set(CACHE_KEY, disk, CACHE_TTL);
    return NextResponse.json(disk);
  }

  // Sequential fetches to avoid hammering — curl is fast enough
  const nberPapers = await fetchNBER();
  const arxivResults = await Promise.all(
    ARXIV_CATS.map(({ slug, label }) => fetchArxivCat(slug, label)),
  );
  const arxivPapers = arxivResults.flat();

  const seen = new Set<string>();
  const papers = [...arxivPapers, ...nberPapers]
    .filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  console.log(`[research] arXiv=${arxivPapers.length} NBER=${nberPapers.length} total=${papers.length}`);

  const response: ResearchResponse = { papers, fetchedAt: new Date().toISOString() };
  // Only cache when arXiv succeeded — NBER-only results shouldn't poison the cache
  if (arxivPapers.length > 0 && papers.length > 0) {
    memCache.set(CACHE_KEY, response, CACHE_TTL);
    writeResearchDiskCache(response);
  }
  return NextResponse.json(response);
}
