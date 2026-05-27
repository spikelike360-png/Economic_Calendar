import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), 'data', 'journal');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export async function GET(req: NextRequest) {
  const week = req.nextUrl.searchParams.get('week');
  if (!week) return NextResponse.json({ error: 'missing week' }, { status: 400 });
  ensureDir();
  const file = path.join(DATA_DIR, `${week}.json`);
  if (!fs.existsSync(file)) return NextResponse.json({ week, days: {} });
  try {
    return NextResponse.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch {
    return NextResponse.json({ week, days: {} });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { week, days } = body;
  if (!week) return NextResponse.json({ error: 'missing week' }, { status: 400 });
  ensureDir();
  fs.writeFileSync(path.join(DATA_DIR, `${week}.json`), JSON.stringify({ week, days }, null, 2), 'utf-8');
  return NextResponse.json({ ok: true });
}
