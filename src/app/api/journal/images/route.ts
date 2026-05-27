import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const IMAGES_DIR = path.join(process.cwd(), 'data', 'journal', 'images');

export async function GET() {
  try {
    if (!fs.existsSync(IMAGES_DIR)) return NextResponse.json({ images: [] });
    const files = fs.readdirSync(IMAGES_DIR)
      .filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f))
      .sort((a, b) => b.localeCompare(a)); // newest first (timestamp filenames)
    return NextResponse.json({ images: files });
  } catch {
    return NextResponse.json({ images: [] });
  }
}
