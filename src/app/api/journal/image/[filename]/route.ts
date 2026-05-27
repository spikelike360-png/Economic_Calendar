import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const IMG_DIR = path.join(process.cwd(), 'data', 'journal', 'images');

export async function GET(_req: NextRequest, { params }: { params: { filename: string } }) {
  const { filename } = params;
  if (!/^[\w.-]+$/.test(filename)) return new NextResponse('forbidden', { status: 403 });

  const filepath = path.join(IMG_DIR, filename);
  if (!fs.existsSync(filepath)) return new NextResponse('not found', { status: 404 });

  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === '.jpg' ? 'image/jpeg' : 'image/png';

  return new NextResponse(fs.readFileSync(filepath), {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000' },
  });
}
