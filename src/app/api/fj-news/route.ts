import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const runtime  = 'nodejs';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FJItem {
  id:         string;
  headline:   string;
  categories: string[];
  timestamp:  string;
  breaking:   boolean;
}

// ── Module-level accumulator ──────────────────────────────────────────────────
// Survives between requests on local dev server

const MAX_BUFFER = 300;
const buffer: FJItem[] = [];
const seen   = new Set<string>();
let   started = false;

function addItem(raw: Record<string, unknown>) {
  const title = (raw.Title ?? raw.title) as string | undefined;
  if (!title?.trim()) return;

  const id = String(raw.NewsID ?? raw.newsid ?? raw.id ?? Date.now());
  if (seen.has(id)) return;
  seen.add(id);

  const rawTags = (raw.Tags ?? raw.tags ?? raw.categories) as Array<{ Name?: string; name?: string } | string> | string | undefined;
  let categories: string[] = [];
  if (Array.isArray(rawTags)) {
    categories = rawTags.map((t) => (typeof t === 'string' ? t : (t.Name ?? t.name ?? ''))).filter(Boolean);
  } else if (typeof rawTags === 'string') {
    categories = rawTags.split(',').map((s) => s.trim()).filter(Boolean);
  }

  const ts = (raw.D ?? raw.DateTime ?? raw.timestamp ?? new Date().toISOString()) as string;

  buffer.unshift({
    id,
    headline:   title.trim(),
    categories,
    timestamp:  ts,
    breaking:   Boolean(raw.IsBreaking ?? raw.breaking ?? raw.STID === 1),
  });

  if (buffer.length > MAX_BUFFER) buffer.splice(MAX_BUFFER);
}

function parseMessage(raw: string) {
  const lines = raw.split('\n').filter((l) => l.trim() && l !== '{}');
  for (const line of lines) {
    try {
      const msg = JSON.parse(line) as Record<string, unknown>;
      const push = msg.push as Record<string, unknown> | undefined;
      if (!push) continue;
      const pub  = push.pub  as Record<string, unknown> | undefined;
      const data = pub?.data as Record<string, unknown> | undefined;
      if (!data) continue;

      // Format A: data.msg is stringified JSON array  [{ NewsID, Title, Tags, ... }]
      if (typeof data.msg === 'string') {
        try {
          const items = JSON.parse(data.msg);
          if (Array.isArray(items)) items.forEach(addItem);
        } catch { /* ignore */ }
      }
      // Format B: data.title or data.Title directly
      else if (data.title || data.Title) {
        addItem(data);
      }
      // Format C: data has nested news array
      else if (Array.isArray(data.news)) {
        (data.news as Record<string, unknown>[]).forEach(addItem);
      }
    } catch { /* ignore */ }
  }
}

async function startAccumulator() {
  if (started) return;
  started = true;

  const connect = async () => {
    // Fetch fresh token
    let token = '';
    try {
      const r = await fetch('https://www.financialjuice.com/widgets/centrifugo-token.ashx', {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.financialjuice.com/home' },
        signal: AbortSignal.timeout(8000),
      });
      const j = await r.json() as { token?: string };
      token = j.token ?? '';
    } catch { /* ignore */ }

    if (!token) { setTimeout(connect, 10_000); return; }

    const ws = new (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket(
      'wss://rt.financialjuice.com/connection/websocket',
    );

    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, connect: { token } }));
    };

    ws.onmessage = (e: MessageEvent) => {
      parseMessage(String(e.data));
    };

    ws.onclose = () => {
      started = false;
      setTimeout(connect, 5_000);
    };

    ws.onerror = () => {};
  };

  connect();
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  startAccumulator(); // idempotent — only starts once
  return NextResponse.json({ items: buffer, count: buffer.length });
}
