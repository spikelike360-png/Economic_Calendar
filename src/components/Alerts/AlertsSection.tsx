'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellOff, Plus, X, Clock, ExternalLink, Wifi, WifiOff } from 'lucide-react';
import { clsx } from 'clsx';
import { getTradeStream } from '@/lib/alpacaStream';
import type { TradeUpdate, NewsItem } from '@/lib/alpacaStream';
import { getFJStream } from '@/lib/fjStream';
import type { FJNewsItem } from '@/lib/fjStream';
import type { FJItem } from '@/app/api/fj-news/route';

// ── Types ────────────────────────────────────────────────────────────────────

type Direction = 'above' | 'below';

interface PriceAlert {
  id:        string;
  symbol:    string;
  price:     number;
  direction: Direction;
  createdAt: string;
}

interface TimeWindow {
  enabled: boolean;
  start:   string; // "HH:MM" ET
  end:     string; // "HH:MM" ET
}

// ── Constants ────────────────────────────────────────────────────────────────

const ALERT_KEY    = 'price_alerts_v1';
const WINDOW_KEY   = 'alert_time_window_v1';
const MUTE_KEY     = 'alert_mute_v1';
const GEX_WALL_KEY = 'gex_wall_triggered_v1';
const MAX_NEWS     = 80;

const QUICK_SYMBOLS  = ['SPY', 'QQQ', 'SPX', 'IWM', 'NVDA', 'TSLA', 'AAPL', 'MSFT', 'META', 'GLD', 'TLT', 'VIX'];
// Indices not on Alpaca IEX — polled via Yahoo Finance proxy
const INDEX_SYMBOLS  = new Set(['SPX', 'VIX', 'NDX', 'DJI', 'RUT']);
const DEFAULT_WINDOW: TimeWindow = { enabled: false, start: '09:30', end: '16:00' };

// ── Helpers ──────────────────────────────────────────────────────────────────

function uuid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function loadAlerts(): PriceAlert[] {
  try { return JSON.parse(localStorage.getItem(ALERT_KEY) ?? '[]'); } catch { return []; }
}
function saveAlerts(a: PriceAlert[]) { localStorage.setItem(ALERT_KEY, JSON.stringify(a)); }

function loadWindow(): TimeWindow {
  try { return { ...DEFAULT_WINDOW, ...JSON.parse(localStorage.getItem(WINDOW_KEY) ?? '{}') }; } catch { return DEFAULT_WINDOW; }
}
function saveWindow(w: TimeWindow) { localStorage.setItem(WINDOW_KEY, JSON.stringify(w)); }

function nowET(): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
}

function inWindow(w: TimeWindow): boolean {
  if (!w.enabled) return true;
  const t = nowET();
  return t >= w.start && t <= w.end;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  } catch { return ''; }
}

function showToast(title: string, body: string) {
  if (typeof window === 'undefined') return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico', silent: false });
  }
}

async function sendPhoneAlert(title: string, body: string, priority = 4, icon?: string, tags?: string[]) {
  try {
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, priority, icon, tags }),
    });
  } catch { /* silent — don't break UI if ntfy unreachable */ }
}

// Public icon URLs for phone notifications (twemoji via jsdelivr CDN)
const ICON_CALL_WALL = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f6a7.png';   // 🚧
const ICON_PUT_WALL  = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f6e1.png';    // 🛡️
const ICON_PRICE     = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f514.png';    // 🔔

async function requestNotifPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LivePricePill({ symbol, price, prev }: { symbol: string; price: number | null; prev: number | null }) {
  const up   = price !== null && prev !== null && price > prev;
  const down = price !== null && prev !== null && price < prev;
  return (
    <div className="flex items-center justify-between px-3 py-1.5 rounded bg-[#0a0e14] border border-[#1e2d3d]">
      <span className="text-[11px] font-bold font-mono text-slate-300 tracking-wider">{symbol}</span>
      <span className={clsx(
        'text-[12px] font-bold font-mono tabular-nums',
        up ? 'text-emerald-400' : down ? 'text-red-400' : 'text-slate-200',
      )}>
        {price !== null ? price.toFixed(2) : '—'}
      </span>
    </div>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const isFJ      = item.source === 'FinancialJuice';
  const isBreaking = item.breaking;
  const tags      = isFJ ? (item.categories ?? []) : item.symbols;
  return (
    <div className={clsx(
      'px-4 py-3 border-b border-[#111827] hover:bg-[#0a0e14] transition-colors group',
      isBreaking && 'bg-red-500/5 border-l-2 border-l-red-500/60',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="text-[9px] text-[#4a5568] font-mono">{fmtTime(item.createdAt)} ET</span>
            {isFJ && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-orange-500/15 border border-orange-500/25 text-orange-400">FJ</span>
            )}
            {isBreaking && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-red-500/20 border border-red-500/40 text-red-400 animate-pulse">BREAKING</span>
            )}
            {tags.slice(0, 5).map((s) => (
              <span key={s} className={clsx(
                'px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border',
                isFJ
                  ? 'bg-slate-800/60 border-slate-700/40 text-slate-400'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-400',
              )}>{s}</span>
            ))}
            {tags.length > 5 && <span className="text-[9px] text-slate-600 font-mono">+{tags.length - 5}</span>}
          </div>
          <p className={clsx('text-[12px] leading-snug', isBreaking ? 'text-white font-semibold' : 'text-slate-200')}>
            {item.headline}
          </p>
          <p className="text-[9px] text-[#2d3748] font-mono mt-0.5">{item.source}</p>
        </div>
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
            <ExternalLink className="w-3 h-3 text-slate-600 hover:text-slate-400" />
          </a>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AlertsSection() {
  // Alerts state
  const [alerts,     setAlerts]    = useState<PriceAlert[]>(() => (typeof window !== 'undefined' ? loadAlerts() : []));
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(() => (typeof window !== 'undefined' ? loadWindow() : DEFAULT_WINDOW));

  // Prices state
  const [prices,      setPrices]      = useState<Record<string, number>>({});
  const [indexUpdated, setIndexUpdated] = useState<string>('');
  const prevPrices = useRef<Record<string, number>>({});

  // News state
  const [news, setNews] = useState<NewsItem[]>([]);

  // Connection status
  const [tradeConn, setTradeConn] = useState<'connecting' | 'live' | 'error'>('connecting');
  const [fjConn,    setFjConn]    = useState<'connecting' | 'live' | 'error'>('connecting');
  const [newsConn,  setNewsConn]  = useState<'connecting' | 'live' | 'error'>('connecting');

  // Notification permission
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default');

  // Mute toggles
  const [mutePrice, setMutePrice] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem(MUTE_KEY) ?? '{}').price ?? false; } catch { return false; }
  });
  const [muteNews, setMuteNews] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem(MUTE_KEY) ?? '{}').news ?? false; } catch { return false; }
  });

  const mutePriceRef = useRef(mutePrice);
  const muteNewsRef  = useRef(muteNews);
  useEffect(() => { mutePriceRef.current = mutePrice; }, [mutePrice]);
  useEffect(() => { muteNewsRef.current  = muteNews;  }, [muteNews]);

  // GEX wall auto-alerts
  interface GexWalls { callWall: number; putWall: number; spot: number; fetchedAt: number }
  const [gexWalls,    setGexWalls]    = useState<GexWalls | null>(null);
  const gexWallsRef = useRef<GexWalls | null>(null);

  // Add alert form
  const [formSymbol, setFormSymbol] = useState('SPY');
  const [formDir,    setFormDir]    = useState<Direction>('above');
  const [formPrice,  setFormPrice]  = useState('');
  const [customSym,  setCustomSym]  = useState('');
  const [useCustom,  setUseCustom]  = useState(false);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotifPerm(Notification.permission);
    }
  }, []);

  // ── Symbols to watch (alerts + always SPY, QQQ) ──────────────────────────

  const watchedSymbols = useMemo(() => {
    const s = new Set(['SPY', 'QQQ', ...alerts.map((a) => a.symbol)]);
    // Remove indices — they use Yahoo Finance polling, not Alpaca WebSocket
    return Array.from(s).filter((sym) => !INDEX_SYMBOLS.has(sym));
  }, [alerts]);

  // ── Trade WebSocket ───────────────────────────────────────────────────────

  const handleTrade = useCallback((u: TradeUpdate) => {
    setTradeConn('live');
    setPrices((prev) => {
      prevPrices.current = { ...prev };
      return { ...prev, [u.symbol]: u.price };
    });

    // Check price alerts
    if (!inWindow(timeWindow)) return;
    setAlerts((prev) => {
      const triggered: PriceAlert[] = [];
      const remaining = prev.filter((a) => {
        if (a.symbol !== u.symbol) return true;
        const hit = a.direction === 'above' ? u.price >= a.price : u.price <= a.price;
        if (hit) { triggered.push(a); return false; }
        return true;
      });
      if (triggered.length > 0) {
        triggered.forEach((a) => {
          const alertTitle = `🔔 ${a.symbol} Alert`;
          const alertBody  = `${a.symbol} ${a.direction === 'above' ? '▲ crossed above' : '▼ dropped below'} $${a.price.toFixed(2)} → current: $${u.price.toFixed(2)}`;
          if (!mutePriceRef.current) showToast(alertTitle, alertBody);
          sendPhoneAlert(alertTitle, alertBody, 5, ICON_PRICE, ['bell']);
        });
        saveAlerts(remaining);
        return remaining;
      }
      return prev;
    });
  }, [timeWindow]);

  useEffect(() => {
    const stream = getTradeStream();
    stream.addCallback(handleTrade);
    watchedSymbols.forEach((s) => stream.watch(s));
    const timeout = setTimeout(() => setTradeConn((c) => c === 'connecting' ? 'error' : c), 10_000);
    return () => {
      stream.removeCallback(handleTrade);
      clearTimeout(timeout);
    };
  }, [watchedSymbols, handleTrade]);

  // Watch new symbols when alerts added
  useEffect(() => {
    const stream = getTradeStream();
    watchedSymbols.forEach((s) => stream.watch(s));
  }, [watchedSymbols]);

  // ── Server-side FJ news poll (history + ongoing) ─────────────────────────

  const seenPollIds = useRef(new Set<string>());

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await fetch('/api/fj-news', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json() as { items: FJItem[] };
        if (cancelled || !j.items?.length) return;
        setNewsConn('live');
        setNews((prev) => {
          const incoming: NewsItem[] = j.items
            .filter((i) => !seenPollIds.current.has(i.id))
            .map((i) => {
              seenPollIds.current.add(i.id);
              return {
                id:         `fj-${i.id}`,
                headline:   i.headline,
                symbols:    [],
                url:        '',
                createdAt:  i.timestamp,
                source:     'FinancialJuice',
                categories: i.categories,
                breaking:   i.breaking,
              } as NewsItem;
            });
          if (!incoming.length) return prev;
          const merged = [...incoming, ...prev]
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, MAX_NEWS);
          return merged;
        });
      } catch { /* ignore */ }
    };
    poll();
    const id = setInterval(poll, 15_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // ── FinancialJuice Centrifugo stream ──────────────────────────────────────

  const handleFJNews = useCallback((item: FJNewsItem) => {
    setFjConn('live');
    const newsItem: NewsItem = {
      id:         `fj-${item.id}`,
      headline:   item.headline,
      symbols:    [],
      url:        '',
      createdAt:  item.timestamp,
      source:     'FinancialJuice',
      categories: item.categories,
      breaking:   item.breaking,
    };
    setNews((prev) => {
      if (prev.some((n) => n.id === newsItem.id)) return prev;
      return [newsItem, ...prev].slice(0, MAX_NEWS);
    });
    if (inWindow(timeWindow) && !muteNewsRef.current && item.breaking) {
      showToast(`🚨 BREAKING — FinancialJuice`, item.headline);
    }
  }, [timeWindow]);

  useEffect(() => {
    const stream = getFJStream();
    stream.onAuth = () => setFjConn('live');
    stream.addCallback(handleFJNews);
    return () => { stream.removeCallback(handleFJNews); };
  }, [handleFJNews]);

  // ── Index polling (SPX, VIX etc — not on Alpaca IEX) ────────────────────

  const indexSymbols = useMemo(() => {
    const needed = new Set<string>(['SPX', 'VIX']); // always live
    alerts.filter((a) => INDEX_SYMBOLS.has(a.symbol)).forEach((a) => needed.add(a.symbol));
    if (useCustom && INDEX_SYMBOLS.has(customSym)) needed.add(customSym);
    return Array.from(needed);
  }, [alerts, useCustom, customSym]);

  useEffect(() => {
    if (!indexSymbols.length) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/quote?symbols=${indexSymbols.join(',')}`, { cache: 'no-store' });
        if (!r.ok) return;
        const data: Record<string, number> = await r.json();
        if (cancelled || !Object.keys(data).length) return;

        setPrices((prev) => {
          prevPrices.current = { ...prev };
          return { ...prev, ...data };
        });
        setIndexUpdated(new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'America/New_York' }));

        // Check price alerts for index symbols
        if (!inWindow(timeWindow)) return;
        setAlerts((prev) => {
          const triggered: PriceAlert[] = [];
          const remaining = prev.filter((a) => {
            if (!INDEX_SYMBOLS.has(a.symbol) || !(a.symbol in data)) return true;
            const cur = data[a.symbol];
            const hit = a.direction === 'above' ? cur >= a.price : cur <= a.price;
            if (hit) { triggered.push(a); return false; }
            return true;
          });
          if (triggered.length > 0) {
            triggered.forEach((a) => {
              const cur = data[a.symbol];
              const alertTitle = `🔔 ${a.symbol} Alert`;
              const alertBody  = `${a.symbol} ${a.direction === 'above' ? '▲ crossed above' : '▼ dropped below'} $${a.price.toFixed(2)} → current: ${cur.toFixed(2)}`;
              if (!mutePriceRef.current) showToast(alertTitle, alertBody);
              sendPhoneAlert(alertTitle, alertBody, 5, ICON_PRICE, ['bell']);
            });
            saveAlerts(remaining);
            return remaining;
          }
          return prev;
        });
      } catch { /* ignore */ }
    };

    poll();
    const id = setInterval(poll, 2_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [indexSymbols, timeWindow]);

  // ── GEX wall auto-alerts ─────────────────────────────────────────────────

  // Load/check per-day trigger state from localStorage
  function getTodayET() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  }
  function loadWallTriggered() {
    try {
      const s = JSON.parse(localStorage.getItem(GEX_WALL_KEY) ?? '{}');
      if (s.date !== getTodayET()) return { date: getTodayET(), call: false, put: false };
      return s as { date: string; call: boolean; put: boolean };
    } catch { return { date: getTodayET(), call: false, put: false }; }
  }
  function saveWallTriggered(v: { date: string; call: boolean; put: boolean }) {
    localStorage.setItem(GEX_WALL_KEY, JSON.stringify(v));
  }

  // Fetch GEX walls every 5 min
  useEffect(() => {
    let cancelled = false;
    const fetchWalls = async () => {
      if (cancelled) return;
      try {
        const r = await fetch('/api/gexbot', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        const spx = d?.instruments?.find((i: { ticker: string }) => i.ticker === 'SPX');
        if (!spx) return;
        const walls: GexWalls = {
          callWall:  spx.majors.mpos_vol,
          putWall:   spx.majors.mneg_vol,
          spot:      spx.majors.spot,
          fetchedAt: Date.now(),
        };
        if (!cancelled) { setGexWalls(walls); gexWallsRef.current = walls; }
      } catch { /* ignore */ }
    };
    fetchWalls();
    const id = setInterval(fetchWalls, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Check SPX price against walls (runs whenever SPX price updates)
  const spxPrice = prices['SPX'];
  useEffect(() => {
    if (!spxPrice || !gexWallsRef.current) return;
    if (!inWindow(timeWindow)) return;
    const walls = gexWallsRef.current;
    const triggered = loadWallTriggered();

    if (!triggered.call && spxPrice >= walls.callWall) {
      triggered.call = true;
      saveWallTriggered(triggered);
      const title = 'SPX CALL WALL 🚧';
      const body  = `SPX at ${spxPrice.toFixed(0)} — touching CALL WALL ${walls.callWall}\nDealers selling here 🔴 Expect resistance & potential reversal. Watch closely!`;
      showToast(title, body);
      sendPhoneAlert(title, body, 5, ICON_CALL_WALL, ['construction']);
    }
    if (!triggered.put && spxPrice <= walls.putWall) {
      triggered.put = true;
      saveWallTriggered(triggered);
      const title = 'SPX PUT WALL 🛡️';
      const body  = `SPX at ${spxPrice.toFixed(0)} — touching PUT WALL ${walls.putWall}\nDealers buying here 🟢 Potential support & bounce zone. Stay alert!`;
      showToast(title, body);
      sendPhoneAlert(title, body, 5, ICON_PUT_WALL, ['shield']);
    }
  }, [spxPrice, timeWindow]);

  // ── Persist ───────────────────────────────────────────────────────────────

  useEffect(() => { saveAlerts(alerts); },    [alerts]);
  useEffect(() => { saveWindow(timeWindow); }, [timeWindow]);
  useEffect(() => { localStorage.setItem(MUTE_KEY, JSON.stringify({ price: mutePrice, news: muteNews })); }, [mutePrice, muteNews]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const addAlert = () => {
    const sym = (useCustom ? customSym : formSymbol).toUpperCase().trim();
    const p   = parseFloat(formPrice);
    if (!sym || isNaN(p) || p <= 0) return;
    const a: PriceAlert = { id: uuid(), symbol: sym, price: p, direction: formDir, createdAt: new Date().toISOString() };
    setAlerts((prev) => [...prev, a]);
    setFormPrice('');
    getTradeStream().watch(sym);
  };

  const removeAlert = (id: string) => setAlerts((prev) => prev.filter((a) => a.id !== id));

  const grantNotif = async () => {
    const perm = await requestNotifPermission();
    setNotifPerm(perm);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const ConnDot = ({ state }: { state: 'connecting' | 'live' | 'error' }) => (
    <span className={clsx(
      'inline-block w-1.5 h-1.5 rounded-full',
      state === 'live'       ? 'bg-emerald-400 animate-pulse' :
      state === 'connecting' ? 'bg-amber-400 animate-pulse'   : 'bg-red-500',
    )} />
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-lg border border-slate-800/60 bg-[#0d0d0f] px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            Alerts
          </h2>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[10px] text-slate-600 font-mono flex items-center gap-1.5">
              <ConnDot state={tradeConn} /> Prices
            </span>
            <span className="text-[10px] text-slate-600 font-mono flex items-center gap-1.5">
              <ConnDot state={fjConn === 'live' || newsConn === 'live' ? 'live' : 'connecting'} /> FinancialJuice
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mute price alerts */}
          <button
            onClick={() => setMutePrice((v) => !v)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded border text-[10px] font-mono font-bold uppercase tracking-wider transition-colors',
              mutePrice
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-slate-800/60 border-slate-700/40 text-slate-400 hover:bg-slate-700/60',
            )}
          >
            {mutePrice ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
            {mutePrice ? 'Alerts Muted' : 'Mute Alerts'}
          </button>

          {/* Mute news */}
          <button
            onClick={() => setMuteNews((v) => !v)}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded border text-[10px] font-mono font-bold uppercase tracking-wider transition-colors',
              muteNews
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-slate-800/60 border-slate-700/40 text-slate-400 hover:bg-slate-700/60',
            )}
          >
            {muteNews ? <BellOff className="w-3 h-3" /> : <Bell className="w-3 h-3" />}
            {muteNews ? 'News Muted' : 'Mute News'}
          </button>

          {/* Test toast */}
          <button
            onClick={async () => {
              let perm = Notification.permission;
              if (perm === 'default') perm = await Notification.requestPermission();
              setNotifPerm(perm);
              if (perm === 'granted') {
                try {
                  const n = new Notification('🔔 Test Alert', {
                    body: 'SPY ▲ crossed above $500.00 → current: $500.47',
                    icon: '/favicon.ico',
                  });
                  n.onerror = (e) => alert(`Notification error: ${JSON.stringify(e)}`);
                  console.log('Notification fired:', n);
                } catch (e) {
                  alert(`Notification threw: ${e}`);
                }
              } else {
                alert(`Permission: ${perm}. Click the lock icon in the address bar → allow notifications.`);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border text-[10px] font-mono font-bold uppercase tracking-wider bg-slate-800/60 border-slate-700/40 text-slate-400 hover:bg-slate-700/60 transition-colors"
          >
            Test Toast
          </button>

          {/* Notification permission */}
          <button
            onClick={grantNotif}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded border text-[10px] font-mono font-bold uppercase tracking-wider transition-colors',
              notifPerm === 'granted'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : notifPerm === 'denied'
                  ? 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/15',
            )}
          >
            {notifPerm === 'granted' ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
            {notifPerm === 'granted' ? 'Toasts On' : notifPerm === 'denied' ? 'Blocked' : 'Enable Toasts'}
          </button>
        </div>
      </div>

      {/* Time window */}
      <div className="rounded-lg border border-slate-800/60 bg-[#0d0d0f] px-4 py-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Active Hours (ET)</span>
          </div>
          <button
            onClick={() => setTimeWindow((w) => ({ ...w, enabled: !w.enabled }))}
            className={clsx(
              'px-2.5 py-1 rounded border text-[10px] font-mono font-bold uppercase tracking-wider transition-colors',
              timeWindow.enabled
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-slate-800/60 border-slate-700/40 text-slate-600 hover:text-slate-400',
            )}
          >
            {timeWindow.enabled ? 'Window On' : 'Always On'}
          </button>
          {timeWindow.enabled && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-600 font-mono">From</span>
                <input
                  type="time"
                  value={timeWindow.start}
                  onChange={(e) => setTimeWindow((w) => ({ ...w, start: e.target.value }))}
                  className="bg-[#0a0e14] border border-[#1e2d3d] rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-600 font-mono">To</span>
                <input
                  type="time"
                  value={timeWindow.end}
                  onChange={(e) => setTimeWindow((w) => ({ ...w, end: e.target.value }))}
                  className="bg-[#0a0e14] border border-[#1e2d3d] rounded px-2 py-1 text-[11px] font-mono text-slate-200 focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <span className="text-[9px] text-[#1e2d3d] font-mono">Current ET: {nowET()}</span>
            </>
          )}
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* LEFT: Price alerts panel (2 cols) */}
        <div className="lg:col-span-2 space-y-4">

          {/* Live prices */}
          <div className="rounded-lg border border-slate-800/60 bg-[#111113] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-800/60 bg-[#0d0d0f] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {tradeConn === 'live' || !!indexUpdated
                  ? <Wifi className="w-3 h-3 text-emerald-500" />
                  : <WifiOff className="w-3 h-3 text-amber-500" />}
                <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Live Prices</span>
              </div>
              {indexUpdated && (
                <span className="text-[9px] font-mono text-slate-700">SPX/VIX {indexUpdated} ET</span>
              )}
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {['SPX', 'VIX', 'SPY', 'QQQ', ...alerts.map((a) => a.symbol).filter((s) => !['SPX','VIX','SPY','QQQ'].includes(s))]
                .filter((s, i, arr) => arr.indexOf(s) === i)
                .slice(0, 10)
                .map((sym) => (
                  <LivePricePill
                    key={sym}
                    symbol={sym}
                    price={prices[sym] ?? null}
                    prev={prevPrices.current[sym] ?? null}
                  />
                ))}
            </div>
          </div>

          {/* GEX Wall auto-alerts */}
          <div className="rounded-lg border border-amber-500/20 bg-[#111113] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-amber-500/15 bg-[#0d0d0f] flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-amber-400 uppercase tracking-wider">SPX GEX Walls — Auto Alert</span>
              <span className="text-[9px] font-mono text-slate-600">
                {gexWalls ? `updated ${new Date(gexWalls.fetchedAt).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false})}` : 'loading…'}
              </span>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {/* Call wall */}
              <div className={clsx(
                'rounded border px-3 py-2',
                gexWalls && spxPrice && spxPrice >= gexWalls.callWall
                  ? 'bg-emerald-500/10 border-emerald-500/40'
                  : 'bg-[#0a0e14] border-[#1e2d3d]',
              )}>
                <p className="text-[9px] font-mono text-emerald-500 uppercase tracking-wider mb-0.5">Call Wall</p>
                <p className="text-[15px] font-bold font-mono tabular-nums text-emerald-300">
                  {gexWalls ? gexWalls.callWall.toLocaleString() : '—'}
                </p>
                {gexWalls && spxPrice && (
                  <p className="text-[9px] font-mono text-slate-600 mt-0.5">
                    {(gexWalls.callWall - spxPrice).toFixed(0)} pts away
                  </p>
                )}
              </div>
              {/* Put wall */}
              <div className={clsx(
                'rounded border px-3 py-2',
                gexWalls && spxPrice && spxPrice <= gexWalls.putWall
                  ? 'bg-red-500/10 border-red-500/40'
                  : 'bg-[#0a0e14] border-[#1e2d3d]',
              )}>
                <p className="text-[9px] font-mono text-red-400 uppercase tracking-wider mb-0.5">Put Wall</p>
                <p className="text-[15px] font-bold font-mono tabular-nums text-red-300">
                  {gexWalls ? gexWalls.putWall.toLocaleString() : '—'}
                </p>
                {gexWalls && spxPrice && (
                  <p className="text-[9px] font-mono text-slate-600 mt-0.5">
                    {(spxPrice - gexWalls.putWall).toFixed(0)} pts away
                  </p>
                )}
              </div>
            </div>
            <div className="px-3 pb-2 text-[9px] font-mono text-slate-700">
              Auto-fires once per wall per day · resets at midnight ET · walls refresh every 5 min
            </div>
          </div>

          {/* Add alert form */}
          <div className="rounded-lg border border-slate-800/60 bg-[#111113] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-800/60 bg-[#0d0d0f]">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Add Price Alert</span>
            </div>
            <div className="p-4 space-y-3">
              {/* Symbol */}
              <div>
                <label className="text-[9px] text-slate-600 font-mono uppercase tracking-wider block mb-1.5">Symbol</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {QUICK_SYMBOLS.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setFormSymbol(s); setUseCustom(false); }}
                      className={clsx(
                        'px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase transition-colors',
                        !useCustom && formSymbol === s
                          ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                          : 'bg-[#0a0e14] border border-[#1e2d3d] text-slate-500 hover:text-slate-300',
                      )}
                    >{s}</button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="Custom symbol…"
                  value={customSym}
                  onFocus={() => setUseCustom(true)}
                  onChange={(e) => { setCustomSym(e.target.value.toUpperCase()); setUseCustom(true); }}
                  className="w-full bg-[#0a0e14] border border-[#1e2d3d] focus:border-amber-500/50 rounded px-3 py-1.5 text-[11px] font-mono text-slate-200 placeholder-slate-700 outline-none"
                />
              </div>

              {/* Direction */}
              <div>
                <label className="text-[9px] text-slate-600 font-mono uppercase tracking-wider block mb-1.5">Trigger</label>
                <div className="flex gap-2">
                  {(['above', 'below'] as Direction[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => setFormDir(d)}
                      className={clsx(
                        'flex-1 py-1.5 rounded border text-[10px] font-mono font-bold uppercase tracking-wider transition-colors',
                        formDir === d
                          ? d === 'above'
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                            : 'bg-red-500/15 border-red-500/40 text-red-300'
                          : 'bg-[#0a0e14] border-[#1e2d3d] text-slate-600 hover:text-slate-400',
                      )}
                    >
                      {d === 'above' ? '▲ Above' : '▼ Below'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price */}
              <div>
                <label className="text-[9px] text-slate-600 font-mono uppercase tracking-wider block mb-1.5">Price Level</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder={prices[useCustom ? customSym : formSymbol] ? prices[useCustom ? customSym : formSymbol].toFixed(2) : '0.00'}
                    value={formPrice}
                    onChange={(e) => setFormPrice(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addAlert()}
                    className="flex-1 bg-[#0a0e14] border border-[#1e2d3d] focus:border-amber-500/50 rounded px-3 py-1.5 text-[12px] font-mono text-slate-200 placeholder-slate-700 outline-none tabular-nums"
                  />
                  <button
                    onClick={addAlert}
                    className="flex items-center gap-1 px-3 py-1.5 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[10px] font-mono font-bold uppercase hover:bg-amber-500/25 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Active alerts */}
          <div className="rounded-lg border border-slate-800/60 bg-[#111113] overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-800/60 bg-[#0d0d0f] flex items-center justify-between">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Active Alerts</span>
              <span className="text-[9px] font-mono text-slate-600">{alerts.length}</span>
            </div>
            {alerts.length === 0 ? (
              <div className="px-4 py-6 text-center text-[11px] text-slate-700 font-mono">No active alerts</div>
            ) : (
              <div className="divide-y divide-slate-800/30">
                {alerts.map((a) => {
                  const cur     = prices[a.symbol];
                  const pct     = cur ? ((cur - a.price) / a.price) * 100 : null;
                  const near    = pct !== null && Math.abs(pct) < 1;
                  return (
                    <div key={a.id} className={clsx(
                      'flex items-center gap-3 px-4 py-2.5 transition-colors',
                      near && 'bg-amber-500/5',
                    )}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-bold font-mono text-slate-100">{a.symbol}</span>
                          <span className={clsx(
                            'text-[10px] font-mono font-bold',
                            a.direction === 'above' ? 'text-emerald-400' : 'text-red-400',
                          )}>
                            {a.direction === 'above' ? '▲' : '▼'} ${a.price.toFixed(2)}
                          </span>
                          {near && <span className="text-[9px] font-mono text-amber-400 animate-pulse">NEAR</span>}
                        </div>
                        {cur !== undefined && (
                          <p className="text-[10px] text-slate-600 font-mono">
                            now ${cur.toFixed(2)}
                            {pct !== null && (
                              <span className={clsx('ml-1', pct >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                                ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeAlert(a.id)}
                        className="p-1 rounded hover:bg-red-500/15 text-slate-700 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: News feed (3 cols) */}
        <div className="lg:col-span-3 rounded-lg border border-slate-800/60 bg-[#111113] overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 200px)', minHeight: 500 }}>
          <div className="px-4 py-2.5 border-b border-slate-800/60 bg-[#0d0d0f] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              {newsConn === 'live'
                ? <Wifi className="w-3 h-3 text-emerald-500" />
                : <WifiOff className="w-3 h-3 text-amber-500" />}
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">Live News</span>
            </div>
            <div className="flex items-center gap-2 text-[9px] font-mono text-slate-600">
              <span className="flex items-center gap-1">
                <ConnDot state={fjConn === 'live' || newsConn === 'live' ? 'live' : 'connecting'} /> FinancialJuice
              </span>
              <span>· {news.length} items</span>
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {news.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2">
                <div className="text-[11px] text-slate-700 font-mono animate-pulse">
                  {newsConn === 'live' || fjConn === 'live' ? 'Waiting for first headline…' : 'Connecting to news streams…'}
                </div>
              </div>
            ) : (
              news.map((item) => <NewsCard key={item.id} item={item} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
