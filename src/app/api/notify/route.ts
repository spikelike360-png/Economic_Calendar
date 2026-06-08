import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
export const runtime  = 'edge';

const TOPIC = process.env.NTFY_TOPIC ?? '';

export async function POST(req: NextRequest) {
  if (!TOPIC) return NextResponse.json({ error: 'NTFY_TOPIC not set' }, { status: 500 });

  const { title, body, priority, icon, tags } = await req.json() as {
    title:     string;
    body:      string;
    priority?: number;   // 1=min 2=low 3=default 4=high 5=urgent
    icon?:     string;   // public image URL shown in the notification
    tags?:     string[]; // emoji shortcodes (e.g. ["chart_with_upwards_trend"])
  };

  try {
    // JSON publishing → proper UTF-8 (emojis render correctly, unlike HTTP headers)
    const payload: Record<string, unknown> = {
      topic:    TOPIC,
      title,
      message:  body,
      priority: priority ?? 4,
    };
    if (icon) payload.icon = icon;
    if (tags?.length) payload.tags = tags;

    const r = await fetch('https://ntfy.sh', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(6000),
    });
    if (!r.ok) throw new Error(`ntfy HTTP ${r.status}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
