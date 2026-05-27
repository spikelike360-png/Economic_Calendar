import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const IMG_DIR = path.join(process.cwd(), 'data', 'journal', 'images');

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('image') as File | null;
  if (!file) return NextResponse.json({ error: 'no image' }, { status: 400 });

  if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

  const ext = file.type === 'image/jpeg' ? 'jpg' : 'png';
  const filename = `${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(IMG_DIR, filename), Buffer.from(await file.arrayBuffer()));

  return NextResponse.json({ filename });
}
