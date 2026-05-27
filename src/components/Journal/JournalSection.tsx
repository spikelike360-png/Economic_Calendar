'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X, ZoomIn, TrendingUp, TrendingDown, Minus, Trophy, XCircle, Tag, Plus, Image as ImageIcon, Film } from 'lucide-react';
import { clsx } from 'clsx';

type Bias    = 'bull' | 'bear' | 'neutral' | null;
type Outcome = 'win' | 'loss' | 'scratch' | 'mixed' | null;

interface DayData {
  bias:        Bias;
  outcome:     Outcome;
  tools:       string[];
  tags:        string[];
  keyLevels:   string;
  recap:       string;
  screenshots: string[];
}

interface WeekData {
  week: string;
  days: Record<string, DayData>;
}

const EMPTY_DAY: DayData = { bias: null, outcome: null, tools: [], tags: [], keyLevels: '', recap: '', screenshots: [] };

const TOOLS = ['Classic', 'State', 'Order Flow'] as const;

const PRESET_TAGS = [
  'VWAP Reclaim', 'Gap Fill', 'Open Drive', 'HOD/LOD Fade',
  'Failed Breakout', 'News Spike', 'S/R Level', 'Trend Continuation',
  'Double Top/Bot', 'Bear/Bull Flag',
];

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

// ── Week helpers ────────────────────────────────────────────────────────────

function getMondayOf(d: Date): Date {
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDisplay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getWeekDays(monday: Date): Date[] {
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

// ── Lightbox ────────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center" onClick={onClose}>
      <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white">
        <X size={24} />
      </button>
      <img
        src={src}
        alt="Screenshot"
        className="max-w-[90vw] max-h-[90vh] object-contain rounded"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── Reel (image gallery) ────────────────────────────────────────────────────

function ReelModal({ onClose }: { onClose: () => void }) {
  const [images, setImages]     = useState<string[]>([]);
  const [loading, setLoading]   = useState(true);
  const [lightIdx, setLightIdx] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/journal/images')
      .then((r) => r.json())
      .then(({ images: imgs }: { images: string[] }) => setImages(imgs ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightIdx !== null) setLightIdx(null);
        else onClose();
      }
      if (lightIdx !== null) {
        if (e.key === 'ArrowLeft')  setLightIdx((i) => Math.max(0, (i ?? 0) - 1));
        if (e.key === 'ArrowRight') setLightIdx((i) => Math.min(images.length - 1, (i ?? 0) + 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightIdx, images.length, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/96 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 shrink-0">
        <div className="flex items-center gap-2">
          <Film size={15} className="text-amber-400" />
          <span className="text-sm font-bold text-amber-400 uppercase tracking-widest font-mono">REEL</span>
          {!loading && (
            <span className="text-xs text-slate-600 font-mono">
              {images.length} screenshot{images.length !== 1 ? 's' : ''}
            </span>
          )}
          {lightIdx !== null && (
            <span className="text-xs text-slate-500 font-mono ml-2">
              {lightIdx + 1} / {images.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lightIdx !== null && (
            <button
              onClick={() => setLightIdx(null)}
              className="px-2.5 py-1 text-[11px] font-mono text-slate-500 border border-slate-800 rounded hover:text-slate-300 hover:border-slate-600 transition-colors"
            >
              ← Grid
            </button>
          )}
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Content */}
      {lightIdx === null ? (
        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex items-center justify-center h-40 text-slate-600 font-mono text-sm animate-pulse">
              Loading…
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-600">
              <Film size={28} />
              <p className="text-sm font-mono">No screenshots yet — paste with Ctrl+V in the Journal</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2">
              {images.map((filename, i) => (
                <button
                  key={filename}
                  onClick={() => setLightIdx(i)}
                  className="aspect-video rounded-lg overflow-hidden border border-slate-800 hover:border-amber-500/50 transition-all group relative"
                >
                  <img
                    src={`/api/journal/image/${filename}`}
                    alt=""
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ZoomIn size={16} className="text-white" />
                  </div>
                  <div className="absolute bottom-1 right-1 bg-black/70 rounded px-1 text-[8px] font-mono text-slate-400">
                    {i + 1}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center relative px-16 py-4">
          <img
            src={`/api/journal/image/${images[lightIdx]}`}
            alt=""
            className="max-w-full max-h-full object-contain rounded shadow-2xl"
          />
          {/* Prev */}
          <button
            onClick={() => setLightIdx((i) => Math.max(0, (i ?? 0) - 1))}
            disabled={lightIdx === 0}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 border border-slate-700/40 text-white disabled:opacity-20 hover:bg-white/10 transition-colors"
          >
            <ChevronLeft size={22} />
          </button>
          {/* Next */}
          <button
            onClick={() => setLightIdx((i) => Math.min(images.length - 1, (i ?? 0) + 1))}
            disabled={lightIdx === images.length - 1}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 border border-slate-700/40 text-white disabled:opacity-20 hover:bg-white/10 transition-colors"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export default function JournalSection() {
  const [monday, setMonday]       = useState<Date>(() => getMondayOf(new Date()));
  const [weekData, setWeekData]   = useState<WeekData>({ week: '', days: {} });
  const [activeDay, setActiveDay] = useState<string>(() => {
    const t = todayStr();
    const days = getWeekDays(getMondayOf(new Date())).map(fmt);
    return days.includes(t) ? t : days[0];
  });
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [lightbox, setLightbox]   = useState<string | null>(null);
  const [showReel, setShowReel]   = useState(false);
  const [tagInput, setTagInput]   = useState('');
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const weekKey = fmt(monday);
  const days = getWeekDays(monday);

  // Load week data
  useEffect(() => {
    setLoading(true);
    fetch(`/api/journal?week=${weekKey}`)
      .then((r) => r.json())
      .then((data: WeekData) => setWeekData(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [weekKey]);

  // Auto-save
  const scheduleSave = useCallback((data: WeekData) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch('/api/journal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
      } finally {
        setSaving(false);
      }
    }, 800);
  }, []);

  const updateDay = useCallback((dayKey: string, patch: Partial<DayData>) => {
    setWeekData((prev) => {
      const updated: WeekData = {
        ...prev,
        week: weekKey,
        days: {
          ...prev.days,
          [dayKey]: { ...EMPTY_DAY, ...prev.days[dayKey], ...patch },
        },
      };
      scheduleSave(updated);
      return updated;
    });
  }, [weekKey, scheduleSave]);

  // Screenshot upload
  const uploadBlob = useCallback(async (blob: Blob) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', blob, 'screenshot.png');
      const res = await fetch('/api/journal/upload', { method: 'POST', body: fd });
      const { filename } = await res.json();
      if (filename) {
        updateDay(activeDay, { screenshots: [...(weekData.days[activeDay]?.screenshots ?? []), filename] });
      }
    } finally {
      setUploading(false);
    }
  }, [activeDay, weekData, updateDay]);

  // Ctrl+V paste anywhere on page
  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) { e.preventDefault(); uploadBlob(blob); }
          break;
        }
      }
    };
    document.addEventListener('paste', handler);
    return () => document.removeEventListener('paste', handler);
  }, [uploadBlob]);

  // Drag-drop onto screenshot zone
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) uploadBlob(file);
  }, [uploadBlob]);

  const day = weekData.days[activeDay] ?? EMPTY_DAY;

  const removeScreenshot = (filename: string) => {
    updateDay(activeDay, { screenshots: day.screenshots.filter((f) => f !== filename) });
  };

  const addTag = (tag: string) => {
    const t = tag.trim();
    if (!t || day.tags.includes(t)) return;
    updateDay(activeDay, { tags: [...day.tags, t] });
    setTagInput('');
    setShowTagMenu(false);
  };

  const removeTag = (tag: string) => {
    updateDay(activeDay, { tags: day.tags.filter((t) => t !== tag) });
  };

  // Week summary
  const summary = days.map((d) => {
    const dd = weekData.days[fmt(d)] ?? EMPTY_DAY;
    return { date: fmt(d), label: DAY_NAMES[days.indexOf(d)], ...dd };
  });
  const wins    = summary.filter((d) => d.outcome === 'win').length;
  const losses  = summary.filter((d) => d.outcome === 'loss').length;
  const scratch = summary.filter((d) => d.outcome === 'scratch').length;

  return (
    <div className="flex flex-col gap-4 h-full">
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      {showReel && <ReelModal onClose={() => setShowReel(false)} />}

      {/* Week nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => { setMonday(addDays(monday, -7)); }}
          className="p-1.5 text-slate-500 hover:text-amber-400 transition-colors">
          <ChevronLeft size={16} />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-amber-300 font-mono uppercase tracking-widest">
            {fmtDisplay(monday)} – {fmtDisplay(addDays(monday, 4))}
          </p>
          <p className="text-[10px] text-slate-600 font-mono">{monday.getFullYear()}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowReel(true)}
            title="Open Reel — all screenshots"
            className="p-1.5 text-slate-600 hover:text-amber-400 transition-colors"
          >
            <Film size={15} />
          </button>
          <button onClick={() => { setMonday(addDays(monday, 7)); }}
            className="p-1.5 text-slate-500 hover:text-amber-400 transition-colors">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Day tabs */}
      <div className="flex gap-1">
        {days.map((d, i) => {
          const key  = fmt(d);
          const dd   = weekData.days[key];
          const isToday = key === todayStr();
          const hasData = dd && (dd.recap || dd.bias || dd.screenshots.length > 0);
          return (
            <button key={key} onClick={() => setActiveDay(key)}
              className={clsx(
                'flex-1 py-2 rounded-lg text-xs font-mono font-bold uppercase tracking-wider border transition-colors',
                activeDay === key
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700',
              )}>
              <span className="block">{DAY_NAMES[i]}</span>
              <span className={clsx('block text-[9px]', isToday ? 'text-amber-500' : 'text-slate-700')}>
                {fmtDisplay(d)}
              </span>
              {hasData && <span className="block w-1 h-1 rounded-full bg-amber-500 mx-auto mt-0.5" />}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-600 text-sm font-mono">Loading…</div>
      ) : (
        <div className="flex flex-col gap-4 flex-1">
          {/* Bias + Outcome row */}
          <div className="flex gap-4 flex-wrap">
            {/* Bias */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Bias</p>
              <div className="flex gap-1">
                {([['bull','Bull', TrendingUp,'text-emerald-400','bg-emerald-500/15 border-emerald-500/40'],
                   ['bear','Bear', TrendingDown,'text-red-400','bg-red-500/15 border-red-500/40'],
                   ['neutral','Neutral', Minus,'text-slate-400','bg-slate-500/15 border-slate-500/40']] as const).map(
                  ([val, label, Icon, textCls, activeCls]) => (
                    <button key={val}
                      onClick={() => updateDay(activeDay, { bias: day.bias === val ? null : val })}
                      className={clsx(
                        'flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono font-bold transition-colors',
                        day.bias === val ? `${activeCls} ${textCls}` : 'border-slate-800 text-slate-600 hover:border-slate-600',
                      )}>
                      <Icon size={11} /> {label}
                    </button>
                  ))}
              </div>
            </div>

            {/* Outcome */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Outcome</p>
              <div className="flex gap-1">
                {([['win','Win','bg-emerald-500/15 border-emerald-500/40 text-emerald-400'],
                   ['loss','Loss','bg-red-500/15 border-red-500/40 text-red-400'],
                   ['scratch','Scratch','bg-slate-500/15 border-slate-500/40 text-slate-400'],
                   ['mixed','Mixed','bg-amber-500/15 border-amber-500/40 text-amber-400']] as const).map(
                  ([val, label, activeCls]) => (
                    <button key={val}
                      onClick={() => updateDay(activeDay, { outcome: day.outcome === val ? null : val })}
                      className={clsx(
                        'px-2.5 py-1.5 rounded-lg border text-[11px] font-mono font-bold transition-colors',
                        day.outcome === val ? activeCls : 'border-slate-800 text-slate-600 hover:border-slate-600',
                      )}>
                      {label}
                    </button>
                  ))}
              </div>
            </div>

            {/* Tools */}
            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Tools Used</p>
              <div className="flex gap-1">
                {TOOLS.map((tool) => {
                  const active = (day.tools ?? []).includes(tool);
                  return (
                    <button key={tool}
                      onClick={() => {
                        const curr = day.tools ?? [];
                        updateDay(activeDay, {
                          tools: active ? curr.filter((t) => t !== tool) : [...curr, tool],
                        });
                      }}
                      className={clsx(
                        'px-2.5 py-1.5 rounded-lg border text-[11px] font-mono font-bold transition-colors',
                        active
                          ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                          : 'border-slate-800 text-slate-600 hover:border-slate-600',
                      )}>
                      {tool}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tags */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Reversal Tags</p>
            <div className="flex flex-wrap gap-1.5 items-center">
              {day.tags.map((tag) => (
                <span key={tag}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-[11px] text-amber-300 font-mono">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="text-amber-600 hover:text-amber-300">
                    <X size={10} />
                  </button>
                </span>
              ))}

              {/* Tag input + preset dropdown */}
              <div className="relative">
                <div className="flex items-center gap-1">
                  <input value={tagInput} onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addTag(tagInput); }}
                    placeholder="Add tag…"
                    className="w-24 bg-transparent border border-slate-800 rounded px-2 py-0.5 text-[11px] text-slate-300 font-mono placeholder-slate-700 outline-none focus:border-amber-500/40"
                  />
                  <button onClick={() => setShowTagMenu((v) => !v)}
                    className="p-0.5 text-slate-600 hover:text-amber-400">
                    <Tag size={12} />
                  </button>
                </div>
                {showTagMenu && (
                  <div className="absolute top-full left-0 mt-1 z-20 bg-[#0d0d0f] border border-slate-700 rounded-lg p-1 w-44 shadow-xl">
                    {PRESET_TAGS.filter((t) => !day.tags.includes(t)).map((t) => (
                      <button key={t} onClick={() => addTag(t)}
                        className="w-full text-left px-2 py-1 text-[11px] text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 rounded font-mono">
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Key Levels */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Key Levels</p>
            <input value={day.keyLevels}
              onChange={(e) => updateDay(activeDay, { keyLevels: e.target.value })}
              placeholder="e.g. 5280 VWAP, 5310 HOD, 5250 support…"
              className="bg-[#0a0f1a] border border-slate-800 rounded-lg px-3 py-2 text-[12px] text-slate-300 font-mono placeholder-slate-700 outline-none focus:border-amber-500/40 transition-colors"
            />
          </div>

          {/* Recap */}
          <div className="flex flex-col gap-1.5 flex-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Daily Recap</p>
            <textarea value={day.recap}
              onChange={(e) => updateDay(activeDay, { recap: e.target.value })}
              placeholder="What happened today? Where were the reversals? What worked, what didn't…"
              className="flex-1 min-h-[120px] bg-[#0a0f1a] border border-slate-800 rounded-lg px-3 py-2 text-[12px] text-slate-300 font-mono placeholder-slate-700 outline-none focus:border-amber-500/40 transition-colors resize-none"
            />
          </div>

          {/* Screenshots */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Screenshots</p>
              <span className="text-[10px] text-slate-700 font-mono">
                {uploading ? 'Uploading…' : 'Ctrl+V · drag & drop'}
              </span>
            </div>

            {/* Drop zone */}
            <div
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              className={clsx(
                'rounded-lg border-2 border-dashed transition-colors',
                day.screenshots.length === 0 ? 'border-slate-800 p-6' : 'border-slate-800/40 p-2',
              )}>
              {day.screenshots.length === 0 ? (
                <div className="flex flex-col items-center gap-2 text-slate-700">
                  <ImageIcon size={24} />
                  <p className="text-[11px] font-mono">Paste screenshot (Ctrl+V) or drag here</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {day.screenshots.map((filename) => (
                    <div key={filename} className="relative group rounded-lg overflow-hidden border border-slate-800 aspect-video bg-[#0a0f1a]">
                      <img src={`/api/journal/image/${filename}`} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button onClick={() => setLightbox(`/api/journal/image/${filename}`)}
                          className="p-1 rounded bg-white/10 hover:bg-white/20 text-white">
                          <ZoomIn size={14} />
                        </button>
                        <button onClick={() => removeScreenshot(filename)}
                          className="p-1 rounded bg-red-500/30 hover:bg-red-500/50 text-red-300">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {/* Inline paste hint */}
                  <div
                    onDrop={onDrop}
                    onDragOver={(e) => e.preventDefault()}
                    className="flex items-center justify-center aspect-video rounded-lg border-2 border-dashed border-slate-800 text-slate-700 cursor-pointer hover:border-amber-700 hover:text-amber-700 transition-colors"
                    onClick={() => {}}
                    title="Ctrl+V or drag to add">
                    <Plus size={16} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Week summary */}
      <div className="border-t border-slate-800/60 pt-3 mt-1">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Week Summary</p>
          <div className="flex gap-3 text-[10px] font-mono">
            <span className="text-emerald-400">{wins}W</span>
            <span className="text-red-400">{losses}L</span>
            <span className="text-slate-500">{scratch}S</span>
            {saving && <span className="text-slate-600 italic">saving…</span>}
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1">
          {summary.map((d) => (
            <button key={d.date} onClick={() => setActiveDay(d.date)}
              className={clsx(
                'rounded p-1.5 text-center border transition-colors',
                activeDay === d.date ? 'border-amber-500/30 bg-amber-500/10' : 'border-slate-800/60 hover:border-slate-700',
              )}>
              <p className="text-[9px] text-slate-600 font-mono">{d.label}</p>
              <p className={clsx('text-[10px] font-mono font-bold mt-0.5',
                d.bias === 'bull' ? 'text-emerald-500' :
                d.bias === 'bear' ? 'text-red-500' : 'text-slate-600')}>
                {d.bias ? d.bias.slice(0, 1).toUpperCase() : '—'}
              </p>
              <p className={clsx('text-[9px] font-mono',
                d.outcome === 'win' ? 'text-emerald-400' :
                d.outcome === 'loss' ? 'text-red-400' :
                d.outcome === 'scratch' ? 'text-slate-500' :
                d.outcome === 'mixed' ? 'text-amber-400' : 'text-slate-700')}>
                {d.outcome ? d.outcome.slice(0, 1).toUpperCase() : '·'}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
