'use client';

// Alpaca WebSocket stream clients — browser-side, singleton per stream type

const KEY    = () => process.env.NEXT_PUBLIC_ALPACA_KEY    ?? '';
const SECRET = () => process.env.NEXT_PUBLIC_ALPACA_SECRET ?? '';

const TRADES_WS = 'wss://stream.data.alpaca.markets/v2/iex';
const NEWS_WS   = 'wss://stream.data.alpaca.markets/v1beta1/news';

export interface TradeUpdate { symbol: string; price: number; ts: string }
export interface NewsItem    { id: string; headline: string; symbols: string[]; url: string; createdAt: string; source: string; categories?: string[]; breaking?: boolean }

type TradeCb = (u: TradeUpdate) => void;
type NewsCb  = (n: NewsItem)   => void;

// ── Trade stream ─────────────────────────────────────────────────────────────

class AlpacaTradeStream {
  private ws: WebSocket | null = null;
  private symbols  = new Set<string>();
  private cbs      = new Set<TradeCb>();
  private authed   = false;
  private retryMs  = 1_000;
  private destroyed = false;

  addCallback(cb: TradeCb)    { this.cbs.add(cb); }
  removeCallback(cb: TradeCb) { this.cbs.delete(cb); }

  watch(symbol: string) {
    const sym = symbol.toUpperCase();
    if (this.symbols.has(sym)) return;
    this.symbols.add(sym);
    if (this.authed) this.send({ action: 'subscribe', trades: [sym] });
    if (!this.ws || this.ws.readyState > WebSocket.OPEN) this.connect();
  }

  unwatch(symbol: string) {
    const sym = symbol.toUpperCase();
    this.symbols.delete(sym);
    if (this.authed) this.send({ action: 'unsubscribe', trades: [sym] });
  }

  destroy() {
    this.destroyed = true;
    this.ws?.close();
  }

  private connect() {
    if (this.destroyed) return;
    this.ws = new WebSocket(TRADES_WS);
    this.ws.onopen    = () => {};
    this.ws.onmessage = (e) => this.handle(e.data as string);
    this.ws.onclose   = () => {
      this.authed = false;
      if (!this.destroyed) setTimeout(() => this.connect(), this.retryMs = Math.min(this.retryMs * 1.5, 30_000));
    };
    this.ws.onerror = () => {};
  }

  private handle(raw: string) {
    let msgs: unknown[];
    try { msgs = JSON.parse(raw); } catch { return; }
    for (const m of msgs as Array<Record<string, unknown>>) {
      if (m.T === 'success' && m.msg === 'connected') {
        this.send({ action: 'auth', key: KEY(), secret: SECRET() });
      } else if (m.T === 'success' && m.msg === 'authenticated') {
        this.authed  = true;
        this.retryMs = 1_000;
        if (this.symbols.size > 0) this.send({ action: 'subscribe', trades: Array.from(this.symbols) });
      } else if (m.T === 't') {
        const u: TradeUpdate = { symbol: m.S as string, price: m.p as number, ts: m.t as string };
        Array.from(this.cbs).forEach((cb) => cb(u));
      }
    }
  }

  private send(obj: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }
}

// ── News stream ──────────────────────────────────────────────────────────────

class AlpacaNewsStream {
  private ws: WebSocket | null = null;
  private cbs       = new Set<NewsCb>();
  private authed    = false;
  onAuth?: () => void;
  private subbed    = false;
  private retryMs   = 1_000;
  private destroyed = false;

  addCallback(cb: NewsCb)    { this.cbs.add(cb); if (!this.ws || this.ws.readyState > WebSocket.OPEN) this.connect(); }
  removeCallback(cb: NewsCb) { this.cbs.delete(cb); }

  destroy() {
    this.destroyed = true;
    this.ws?.close();
  }

  private connect() {
    if (this.destroyed) return;
    this.ws = new WebSocket(NEWS_WS);
    this.ws.onopen    = () => {};
    this.ws.onmessage = (e) => this.handle(e.data as string);
    this.ws.onclose   = () => {
      this.authed = false;
      this.subbed = false;
      if (!this.destroyed) setTimeout(() => this.connect(), this.retryMs = Math.min(this.retryMs * 1.5, 30_000));
    };
    this.ws.onerror = () => {};
  }

  private handle(raw: string) {
    let msgs: unknown[];
    try { msgs = JSON.parse(raw); } catch { return; }
    for (const m of msgs as Array<Record<string, unknown>>) {
      if (m.T === 'success' && m.msg === 'connected') {
        this.send({ action: 'auth', key: KEY(), secret: SECRET() });
      } else if (m.T === 'success' && m.msg === 'authenticated') {
        this.authed  = true;
        this.retryMs = 1_000;
        if (!this.subbed) { this.send({ action: 'subscribe', news: ['*'] }); this.subbed = true; }
        this.onAuth?.();
      } else if (m.T === 'n') {
        const item: NewsItem = {
          id:        String(m.id),
          headline:  m.headline as string,
          symbols:   (m.symbols as string[]) ?? [],
          url:       (m.url as string) ?? '',
          createdAt: m.created_at as string,
          source:    (m.source as string) ?? 'Alpaca',
        };
        Array.from(this.cbs).forEach((cb) => cb(item));
      }
    }
  }

  private send(obj: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }
}

// Singletons — created once, survive React re-renders/unmounts
let _trades: AlpacaTradeStream | null = null;
let _news:   AlpacaNewsStream  | null = null;

export function getTradeStream(): AlpacaTradeStream {
  if (!_trades) _trades = new AlpacaTradeStream();
  return _trades;
}
export function getNewsStream(): AlpacaNewsStream {
  if (!_news) _news = new AlpacaNewsStream();
  return _news;
}
