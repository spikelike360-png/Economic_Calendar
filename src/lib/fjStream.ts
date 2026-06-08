'use client';

// FinancialJuice Centrifugo v5 WebSocket client
// Token proxied through /api/fj-token to avoid CORS
// Channels: feed:all, feed:lite_feed
// Note: delayInterval=10 in their JS may be client-side only — direct WS may be real-time

const FJ_WS = 'wss://rt.financialjuice.com/connection/websocket';

export interface FJNewsItem {
  id:         string;
  headline:   string;
  categories: string[];
  timestamp:  string;
  breaking:   boolean;
  source:     'financialjuice';
}

type FJCallback = (item: FJNewsItem) => void;

class FinancialJuiceStream {
  private ws:        WebSocket | null = null;
  private token      = '';
  private cbs        = new Set<FJCallback>();
  private cmdId      = 1;
  private retryMs    = 2_000;
  private destroyed  = false;
  private connecting = false;
  private seenIds    = new Set<string>();

  onAuth?: () => void;

  addCallback(cb: FJCallback) {
    this.cbs.add(cb);
    if (!this.connecting && (!this.ws || this.ws.readyState > WebSocket.OPEN)) this.start();
  }
  removeCallback(cb: FJCallback) { this.cbs.delete(cb); }
  destroy() { this.destroyed = true; this.ws?.close(); }

  private async start() {
    if (this.destroyed || this.connecting) return;
    this.connecting = true;
    try {
      const r = await fetch('/api/fj-token');
      if (r.ok) {
        const j = await r.json();
        this.token = j.token ?? '';
      }
    } catch { /* ignore */ }
    this.connecting = false;
    if (!this.token) {
      setTimeout(() => this.start(), this.retryMs);
      return;
    }
    this.connect();
  }

  private connect() {
    if (this.destroyed) return;
    this.cmdId = 1;
    this.ws = new WebSocket(FJ_WS);

    this.ws.onopen = () => {
      this.send({ id: this.cmdId++, connect: { token: this.token } });
    };

    this.ws.onmessage = (e) => this.handle(e.data as string);

    this.ws.onclose = () => {
      if (!this.destroyed) {
        setTimeout(() => this.connect(), this.retryMs = Math.min(this.retryMs * 1.5, 30_000));
      }
    };

    this.ws.onerror = () => {};
  }

  private handle(raw: string) {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw); } catch { return; }

    // Auth success → subscribe to both channels
    if (msg.id === 1 && msg.connect) {
      this.retryMs = 2_000;
      this.send({ id: this.cmdId++, subscribe: { channel: 'feed:all' } });
      this.send({ id: this.cmdId++, subscribe: { channel: 'feed:lite_feed' } });
      // Request today's history
      this.send({ id: this.cmdId++, history: { channel: 'feed:all',      limit: 100, reverse: true } });
      this.send({ id: this.cmdId++, history: { channel: 'feed:lite_feed', limit: 100, reverse: true } });
      this.onAuth?.();
    }

    // Publication push (live)
    const push = msg.push as Record<string, unknown> | undefined;
    if (push) {
      const pub = push.pub as Record<string, unknown> | undefined;
      const data = pub?.data as Record<string, unknown> | undefined;
      if (data) this.emit(data);
    }

    // History reply — bulk load past items
    const hist = msg.history as Record<string, unknown> | undefined;
    if (hist?.publications) {
      const pubs = hist.publications as Array<{ data: Record<string, unknown> }>;
      // Publications are newest-first (reverse:true), emit oldest first so feed order is correct
      for (let i = pubs.length - 1; i >= 0; i--) {
        if (pubs[i]?.data) this.emit(pubs[i].data);
      }
    }
  }

  private emit(data: Record<string, unknown>) {
    const title = (data.title as string | undefined)?.trim();
    if (!title) return;

    const id = String(data.newsid ?? data.id ?? Date.now());
    if (this.seenIds.has(id)) return; // dedupe across feed:all + feed:lite_feed
    this.seenIds.add(id);
    if (this.seenIds.size > 2000) {
      // prune oldest
      const arr = Array.from(this.seenIds);
      arr.slice(0, 500).forEach((k) => this.seenIds.delete(k));
    }

    const rawCats = (data.categories as string | undefined) ?? '';
    const categories = rawCats.split(',').map((s) => s.trim()).filter(Boolean);

    const item: FJNewsItem = {
      id,
      headline:   title,
      categories,
      timestamp:  (data.timestamp as string | undefined) ?? new Date().toISOString(),
      breaking:   Boolean(data.breaking),
      source:     'financialjuice',
    };

    Array.from(this.cbs).forEach((cb) => cb(item));
  }

  private send(obj: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }
}

let _fj: FinancialJuiceStream | null = null;

export function getFJStream(): FinancialJuiceStream {
  if (!_fj) _fj = new FinancialJuiceStream();
  return _fj;
}
