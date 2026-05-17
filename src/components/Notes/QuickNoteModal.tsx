'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Save, NotebookPen } from 'lucide-react';

const STORAGE_KEY = 'macro-dashboard-notes-v1';

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Note[];
  } catch { return []; }
}

function saveNotes(notes: Note[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export default function QuickNoteModal({ onNavigateNotes }: { onNavigateNotes: () => void }) {
  const [open, setOpen]       = useState(false);
  const [title, setTitle]     = useState('');
  const [content, setContent] = useState('');
  const [saved, setSaved]     = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => titleRef.current?.focus(), 50);
      setSaved(false);
    }
  }, [open]);

  function handleSave() {
    const trimmed = content.trim();
    if (!trimmed) return;
    const notes = loadNotes();
    const note: Note = {
      id: crypto.randomUUID(),
      title: title.trim() || trimmed.split('\n')[0].slice(0, 60) || 'Quick note',
      content: trimmed,
      updatedAt: new Date().toISOString(),
    };
    saveNotes([note, ...notes]);
    setTitle('');
    setContent('');
    setSaved(true);
    setTimeout(() => setOpen(false), 800);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') setOpen(false);
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSave();
  }

  return (
    <>
      {/* Floating trigger button — hidden when panel is open */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-colors flex items-center justify-center shadow-lg"
          title="Quick note"
        >
          <NotebookPen className="w-4 h-4" />
        </button>
      )}

      {/* Bottom-right panel — no backdrop, non-blocking */}
      {open && (
        <div className="fixed bottom-4 right-4 z-50 w-80 bg-[#0a0f1a] border border-slate-700/60 rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 cursor-default">
            <div className="flex items-center gap-2">
              <NotebookPen className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400 font-mono">Quick Note</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setOpen(false); onNavigateNotes(); }}
                className="text-[9px] text-slate-500 hover:text-amber-400 font-mono uppercase tracking-widest transition-colors"
              >
                Open Notes →
              </button>
              <button onClick={() => setOpen(false)} className="text-slate-600 hover:text-slate-300 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Title input */}
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
            placeholder="Note title (optional)"
            className="w-full bg-transparent px-4 pt-3 pb-1 text-[12px] text-slate-300 font-mono outline-none placeholder-slate-700 border-b border-slate-800/60"
          />

          {/* Textarea */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Write a note… (Ctrl+Enter to save)"
            className="w-full h-32 bg-transparent px-4 py-3 text-[13px] text-slate-200 font-mono resize-none outline-none placeholder-slate-700"
          />

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-slate-800">
            <span className="text-[9px] text-slate-700 font-mono">Ctrl+Enter to save · Esc to close</span>
            <button
              onClick={handleSave}
              disabled={!content.trim()}
              className="flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-mono font-semibold uppercase tracking-widest transition-colors disabled:opacity-30 bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30"
            >
              {saved ? '✓ Saved' : <><Save className="w-3 h-3" /> Save</>}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
