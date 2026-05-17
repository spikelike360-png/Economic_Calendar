import fs from 'fs';
import os from 'os';
import path from 'path';
import type { CalendarEvent } from '@/lib/types';

const CACHE_PATH = path.join(os.tmpdir(), 'calendar_events.json');
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CalendarDiskCache {
  events: CalendarEvent[];
  writtenAt: string;
}

export function readCalendarDiskCache(): CalendarEvent[] {
  try {
    if (!fs.existsSync(CACHE_PATH)) return [];
    const raw: CalendarDiskCache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    const age = Date.now() - new Date(raw.writtenAt).getTime();
    if (age > MAX_AGE_MS) return [];
    return raw.events ?? [];
  } catch {
    return [];
  }
}

export function writeCalendarDiskCache(events: CalendarEvent[]): void {
  try {
    const payload: CalendarDiskCache = { events, writtenAt: new Date().toISOString() };
    fs.writeFileSync(CACHE_PATH, JSON.stringify(payload), 'utf-8');
  } catch (err) {
    console.warn('[calendar] Failed to write disk cache:', err);
  }
}
