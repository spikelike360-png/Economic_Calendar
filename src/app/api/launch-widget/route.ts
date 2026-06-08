import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Local only' }, { status: 403 });
  }

  const widgetDir = path.join(process.cwd(), 'widget');

  if (!fs.existsSync(widgetDir)) {
    return NextResponse.json({ error: 'Widget folder not found' }, { status: 404 });
  }

  // Spawn electron.exe directly — no npm/cmd chain = no visible console window
  const electronExe = path.join(widgetDir, 'node_modules', 'electron', 'dist', 'electron.exe');

  if (!fs.existsSync(electronExe)) {
    return NextResponse.json({ error: 'Run npm install in widget/ first' }, { status: 400 });
  }

  const child = spawn(electronExe, ['.'], {
    cwd:          widgetDir,
    detached:     true,
    stdio:        'ignore',
    windowsHide:  true,   // suppresses any residual console window
  });
  child.unref();

  return NextResponse.json({ ok: true });
}
