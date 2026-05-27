'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ExternalLink, TrendingUp, Globe, DollarSign, BarChart2, BookOpen, Search, X, Star } from 'lucide-react';
import { clsx } from 'clsx';
import type { NewsItem, NewsCategory } from '@/lib/scraper/newsFeeds';
import type { ResearchPaper, ResearchResponse } from '@/app/api/research/route';

const CATEGORY_TABS: { value: NewsCategory | 'all'; label: string; icon: React.ElementType }[] = [
  { value: 'all',      label: 'All',     icon: Globe      },
  { value: 'macro',    label: 'Macro',   icon: TrendingUp },
  { value: 'markets',  label: 'Markets', icon: BarChart2  },
  { value: 'earnings', label: 'Earnings',icon: DollarSign },
];

const CATEGORY_COLOR: Record<NewsCategory, string> = {
  macro:    'bg-amber-500/20 text-amber-300 border-amber-500/30',
  markets:  'bg-sky-500/20 text-sky-300 border-sky-500/30',
  earnings: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  general:  'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const SOURCE_BADGE: Record<string, string> = {
  'Yahoo Finance':  'text-amber-400',
  'CNBC':           'text-amber-400',
  'MarketWatch':    'text-sky-400',
  'MarketWatch RT': 'text-sky-300',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const SOURCE_CAT_COLOR: Record<string, string> = {
  'Trading & Microstructure': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'Portfolio Management':     'bg-sky-500/20 text-sky-300 border-sky-500/30',
  'Statistical Finance':      'bg-violet-500/20 text-violet-300 border-violet-500/30',
  'Risk Management':          'bg-red-500/20 text-red-300 border-red-500/30',
  'Economics / Finance':      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

let _researchCache: ResearchResponse | null = null;
let _researchCachedAt = 0;
const RESEARCH_STALE_MS = 6 * 60 * 60 * 1000;

const SAVED_LS_KEY = 'saved_papers_v2';

function loadSaved(): Map<string, ResearchPaper> {
  try {
    const raw = localStorage.getItem(SAVED_LS_KEY);
    if (!raw) return new Map();
    const obj: Record<string, ResearchPaper> = JSON.parse(raw);
    return new Map(Object.entries(obj));
  } catch { return new Map(); }
}

function persistSaved(map: Map<string, ResearchPaper>): void {
  try {
    const obj: Record<string, ResearchPaper> = {};
    map.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(SAVED_LS_KEY, JSON.stringify(obj));
  } catch {}
}

const RESEARCH_CATS = ['All', 'Trading & Microstructure', 'Portfolio Management', 'Statistical Finance', 'Risk Management', 'Mathematical Finance', 'Computational Finance', 'Economics / Finance'] as const;
type ResearchCat = typeof RESEARCH_CATS[number];

function ResearchPanel() {
  const [papers, setPapers]         = useState<ResearchPaper[]>(_researchCache?.papers ?? []);
  const [fetchedAt, setFetchedAt]   = useState<string | null>(_researchCache?.fetchedAt ?? null);
  const [loading, setLoading]       = useState(_researchCache === null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [sourceFil, setSourceFil]   = useState<'all' | 'arXiv' | 'NBER' | 'saved'>('all');
  const [catFil, setCatFil]         = useState<ResearchCat>('All');
  const [query, setQuery]           = useState('');
  const [savedPapers, setSavedPapers] = useState<Map<string, ResearchPaper>>(new Map());

  useEffect(() => { setSavedPapers(loadSaved()); }, []);

  const toggleSave = useCallback((paper: ResearchPaper, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSavedPapers((prev) => {
      const next = new Map(prev);
      if (next.has(paper.id)) next.delete(paper.id); else next.set(paper.id, paper);
      persistSaved(next);
      return next;
    });
  }, []);

  const load = useCallback(async (force = false) => {
    if (!force && _researchCache && Date.now() - _researchCachedAt < RESEARCH_STALE_MS) {
      setPapers(_researchCache.papers);
      setFetchedAt(_researchCache.fetchedAt);
      setLoading(false);
      return;
    }
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/research', { cache: 'no-store' });
      const json: ResearchResponse = await res.json();
      _researchCache = json;
      _researchCachedAt = Date.now();
      setPapers(json.papers);
      setFetchedAt(json.fetchedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const q = query.toLowerCase().trim();
  const visible: ResearchPaper[] = sourceFil === 'saved'
    ? Array.from(savedPapers.values())
    : papers.filter((p) => {
        if (sourceFil !== 'all' && p.source !== sourceFil) return false;
        if (catFil !== 'All' && p.category !== catFil) return false;
        if (q && !p.title.toLowerCase().includes(q) && !p.authors.toLowerCase().includes(q) && !p.abstract.toLowerCase().includes(q)) return false;
        return true;
      });

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Search bar */}
      <div className="relative">
        <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search title, authors, abstract…"
          className="w-full bg-[#0a0f1a] border border-slate-800 rounded-lg pl-8 pr-8 py-2 text-[12px] text-slate-300 font-mono placeholder-slate-700 outline-none focus:border-amber-500/40 transition-colors"
        />
        {query && (
          <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300">
            <X size={12} />
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Source filter */}
        <div className="flex gap-1 flex-wrap">
          {(['all', 'arXiv', 'NBER'] as const).map((s) => (
            <button key={s} onClick={() => setSourceFil(s)}
              className={clsx(
                'px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-widest border transition-colors',
                sourceFil === s
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                  : 'text-slate-600 border-slate-800 hover:text-slate-400',
              )}>
              {s === 'all' ? `All (${papers.length})` : `${s} (${papers.filter(p => p.source === s).length})`}
            </button>
          ))}
          <button onClick={() => setSourceFil('saved')}
            className={clsx(
              'flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-widest border transition-colors',
              sourceFil === 'saved'
                ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40'
                : 'text-slate-600 border-slate-800 hover:text-yellow-500',
            )}>
            <Star size={9} className={sourceFil === 'saved' ? 'fill-yellow-400' : ''} />
            Saved ({savedPapers.size})
          </button>
        </div>
        <div className="flex items-center gap-2">
          {fetchedAt && <span className="text-[10px] text-slate-600 font-mono">{timeAgo(fetchedAt)}</span>}
          <button onClick={() => { _researchCache = null; load(true); }} disabled={refreshing}
            className="text-slate-600 hover:text-amber-400 transition-colors disabled:opacity-40">
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Category filter pills */}
      <div className="flex gap-1.5 flex-wrap">
        {RESEARCH_CATS.map((cat) => {
          const count = cat === 'All' ? papers.length : papers.filter(p => p.category === cat).length;
          if (cat !== 'All' && count === 0) return null;
          return (
            <button key={cat} onClick={() => setCatFil(cat)}
              className={clsx(
                'px-2 py-0.5 rounded text-[10px] border transition-colors',
                catFil === cat
                  ? (SOURCE_CAT_COLOR[cat] ?? 'bg-slate-500/20 text-slate-300 border-slate-500/40')
                  : 'text-slate-600 border-slate-800/60 hover:text-slate-400',
              )}>
              {cat === 'All' ? 'All' : cat.split(' ')[0]} {count > 0 && <span className="opacity-60">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Paper list */}
      <div className="flex-1 overflow-y-auto rounded-lg bg-[#111113] border border-slate-800/60">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw size={20} className="animate-spin text-amber-400" />
              <span className="text-sm text-slate-500">Fetching research papers…</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64 text-sm text-red-400">{error}</div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-2">
            <p className="text-sm text-slate-500">
              {sourceFil === 'arXiv'
                ? 'No arXiv papers — RSS empty on weekends (Mon–Fri only)'
                : 'No papers match filters.'}
            </p>
            {sourceFil === 'arXiv' && papers.length > 0 && (
              <button onClick={() => setSourceFil('all')}
                className="text-[11px] text-amber-500 hover:text-amber-400 font-mono underline">
                Show all {papers.length} papers →
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {visible.map((paper) => {
              const isSaved = savedPapers.has(paper.id);
              return (
              <a key={paper.id} href={paper.url} target="_blank" rel="noopener noreferrer"
                className="flex flex-col gap-1.5 px-5 py-4 hover:bg-slate-800/30 transition-colors group relative">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={clsx(
                    'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border',
                    SOURCE_CAT_COLOR[paper.category] ?? 'bg-slate-500/20 text-slate-400 border-slate-500/30',
                  )}>{paper.category}</span>
                  <span className={clsx('text-[10px] font-mono font-medium',
                    paper.source === 'arXiv' ? 'text-amber-500' : 'text-emerald-500')}>
                    {paper.source}
                  </span>
                  <span className="text-[10px] text-slate-600 ml-auto font-mono">{timeAgo(paper.publishedAt)}</span>
                  <button
                    onClick={(e) => toggleSave(paper, e)}
                    className={clsx(
                      'p-1 rounded transition-colors',
                      isSaved
                        ? 'text-yellow-400 hover:text-yellow-300'
                        : 'text-slate-700 hover:text-yellow-500 opacity-0 group-hover:opacity-100',
                    )}
                    title={isSaved ? 'Remove from saved' : 'Save paper'}
                  >
                    <Star size={13} className={isSaved ? 'fill-yellow-400' : ''} />
                  </button>
                </div>
                <div className="flex items-start gap-2">
                  <p className="text-sm font-medium text-slate-200 leading-snug group-hover:text-white transition-colors flex-1">
                    {paper.title}
                  </p>
                  <ExternalLink size={13} className="text-slate-600 group-hover:text-slate-400 mt-0.5 shrink-0" />
                </div>
                {paper.authors && <p className="text-[11px] text-slate-500 font-mono">{paper.authors}</p>}
                {paper.abstract && <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">{paper.abstract}</p>}
              </a>
              );
            })}
          </div>
        )}
      </div>
      <p className="text-[10px] text-slate-700 font-mono text-right">
        {visible.length} of {papers.length} papers · arXiv q-fin + NBER
      </p>
    </div>
  );
}

// Module-level cache — survives navigation within the tab
let _newsCache: { items: NewsItem[]; fetchedAt: string } | null = null;
let _newsCachedAt = 0;
const NEWS_STALE_MS = 15 * 60 * 1000;

export default function NewsSection() {
  const [mainTab, setMainTab]       = useState<'news' | 'research'>('news');
  const [items, setItems]           = useState<NewsItem[]>(_newsCache?.items ?? []);
  const [fetchedAt, setFetchedAt]   = useState<string | null>(_newsCache?.fetchedAt ?? null);
  const [loading, setLoading]       = useState(_newsCache === null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [activeTab, setActiveTab]   = useState<NewsCategory | 'all'>('all');

  const load = useCallback(async (force = false) => {
    // Use module cache if fresh
    if (!force && _newsCache && Date.now() - _newsCachedAt < NEWS_STALE_MS) {
      setItems(_newsCache.items);
      setFetchedAt(_newsCache.fetchedAt);
      setLoading(false);
      return;
    }

    if (force) setRefreshing(true);
    else if (!_newsCache) setLoading(true);

    setError(null);
    try {
      const res = await fetch('/api/news');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      _newsCache = { items: json.items ?? [], fetchedAt: json.fetchedAt ?? new Date().toISOString() };
      _newsCachedAt = Date.now();
      setItems(_newsCache.items);
      setFetchedAt(_newsCache.fetchedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load news');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = activeTab === 'all' ? items : items.filter(i => i.category === activeTab);

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Main tab switcher: News / Research */}
      <div className="flex items-center gap-1 border-b border-slate-800/60 pb-3">
        <button onClick={() => setMainTab('news')}
          className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
            mainTab === 'news'
              ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
              : 'border-slate-700/60 text-slate-500 hover:text-slate-300 hover:border-slate-600')}>
          <Globe size={11} /> News
        </button>
        <button onClick={() => setMainTab('research')}
          className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
            mainTab === 'research'
              ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
              : 'border-slate-700/60 text-slate-500 hover:text-slate-300 hover:border-slate-600')}>
          <BookOpen size={11} /> Research Papers
        </button>
      </div>

      {/* Research panel */}
      {mainTab === 'research' && <ResearchPanel />}

      {/* News panel */}
      {mainTab === 'news' && (<>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Live News Feed</h2>
          {fetchedAt && (
            <p className="text-xs text-slate-600 mt-0.5">Updated {timeAgo(fetchedAt)}</p>
          )}
        </div>
        <button
          onClick={() => { _newsCache = null; load(true); }}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-2">
        {CATEGORY_TABS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setActiveTab(value)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors',
              activeTab === value
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                : 'border-slate-700/60 text-slate-500 hover:text-slate-300 hover:border-slate-600',
            )}
          >
            <Icon size={11} />
            {label}
            {value !== 'all' && (
              <span className="font-mono text-slate-600">
                {items.filter(i => i.category === value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto rounded-lg bg-[#111113] border border-slate-800/60">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw size={20} className="animate-spin text-amber-400" />
              <span className="text-sm text-slate-500">Loading news...</span>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-slate-500">No articles in this category.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {filtered.map((item) => (
              <a
                key={item.id}
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col gap-1.5 px-5 py-4 hover:bg-slate-800/30 transition-colors group"
              >
                {/* Top row: category badge + source + time */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={clsx(
                    'text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border',
                    CATEGORY_COLOR[item.category],
                  )}>
                    {item.category}
                  </span>
                  <span className={clsx('text-xs font-medium', SOURCE_BADGE[item.source] ?? 'text-slate-500')}>
                    {item.source}
                  </span>
                  <span className="text-xs text-slate-600 ml-auto font-mono">{timeAgo(item.publishedAt)}</span>
                </div>

                {/* Title */}
                <div className="flex items-start gap-2">
                  <p className="text-sm font-medium text-slate-200 leading-snug group-hover:text-white transition-colors flex-1">
                    {item.title}
                  </p>
                  <ExternalLink size={13} className="text-slate-600 group-hover:text-slate-400 mt-0.5 shrink-0 transition-colors" />
                </div>

                {/* Summary */}
                {item.summary && (
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{item.summary}</p>
                )}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Footer count */}
      {!loading && !error && (
        <p className="text-xs text-slate-600 font-mono text-right">
          {filtered.length} articles {activeTab !== 'all' ? `(${activeTab})` : ''}· {items.length} total
        </p>
      )}
      </>)}
    </div>
  );
}
