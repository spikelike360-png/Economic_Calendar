import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ResearchResponse } from '@/app/api/research/route';

const CACHE_PATH = path.join(os.tmpdir(), 'research_papers_v1.json');
const MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12h

export function readResearchDiskCache(): ResearchResponse | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const data: ResearchResponse = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    const age = Date.now() - new Date(data.fetchedAt).getTime();
    const hasArxiv = data.papers.some(p => p.source === 'arXiv');
    if (age < MAX_AGE_MS && data.papers.length > 0 && hasArxiv) {
      console.log(`[research] Disk cache hit — ${data.papers.length} papers, age ${Math.round(age / 60000)}m`);
      return data;
    }
    return null;
  } catch { return null; }
}

export function writeResearchDiskCache(data: ResearchResponse): void {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data), 'utf-8');
    console.log(`[research] Disk cache written — ${data.papers.length} papers`);
  } catch (err) {
    console.warn('[research] Disk cache write failed:', err);
  }
}
