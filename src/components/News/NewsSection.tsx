'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, ExternalLink, TrendingUp, Globe, DollarSign, BarChart2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { NewsItem, NewsCategory } from '@/lib/scraper/newsFeeds';

const CATEGORY_TABS: { value: NewsCategory | 'all'; label: string; icon: React.ElementType }[] = [
  { value: 'all',      label: 'All',     icon: Globe      },
  { value: 'macro',    label: 'Macro',   icon: TrendingUp },
  { value: 'markets',  label: 'Markets', icon: BarChart2  },
  { value: 'earnings', label: 'Earnings',icon: DollarSign },
];

const CATEGORY_COLOR: Record<NewsCategory, string> = {
  macro:    'bg-violet-500/20 text-violet-300 border-violet-500/30',
  markets:  'bg-sky-500/20 text-sky-300 border-sky-500/30',
  earnings: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  general:  'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const SOURCE_BADGE: Record<string, string> = {
  'Yahoo Finance':  'text-violet-400',
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

// Module-level cache — survives navigation within the tab
let _newsCache: { items: NewsItem[]; fetchedAt: string } | null = null;
let _newsCachedAt = 0;
const NEWS_STALE_MS = 15 * 60 * 1000;

export default function NewsSection() {
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
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-300 text-xs font-medium hover:bg-violet-500/20 transition-colors disabled:opacity-50"
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
                ? 'border-violet-500/40 bg-violet-500/15 text-violet-300'
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
      <div className="flex-1 overflow-y-auto rounded-2xl bg-[#0a0d16] border border-slate-800/60">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw size={20} className="animate-spin text-violet-400" />
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
    </div>
  );
}
