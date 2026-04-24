'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Save, Trash2, Plus, FileText, NotebookPen } from 'lucide-react';
import { clsx } from 'clsx';

const STORAGE_KEY = 'macro-dashboard-notes-v1';

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}

function makeNote(): Note {
  return { id: crypto.randomUUID(), title: 'Untitled', content: '', updatedAt: new Date().toISOString() };
}

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [makeNote()];
    const parsed = JSON.parse(raw) as Note[];
    return parsed.length > 0 ? parsed : [makeNote()];
  } catch {
    return [makeNote()];
  }
}

function saveNotes(notes: Note[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export default function NotesSection() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [savedAt, setSavedAt] = useState<string>('');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = loadNotes();
    setNotes(stored);
    setActiveId(stored[0].id);
    setMounted(true);
  }, []);

  const activeNote = notes.find((n) => n.id === activeId) ?? null;

  const persistNotes = useCallback((updated: Note[]) => {
    saveNotes(updated);
    setSavedAt(
      new Date().toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
      }),
    );
  }, []);

  const handleContentChange = (content: string) => {
    setNotes((prev) => {
      const next = prev.map((n) =>
        n.id === activeId ? { ...n, content, updatedAt: new Date().toISOString() } : n,
      );
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => persistNotes(next), 500);
      return next;
    });
  };

  const handleTitleChange = (title: string) => {
    setNotes((prev) => {
      const next = prev.map((n) =>
        n.id === activeId ? { ...n, title: title || 'Untitled', updatedAt: new Date().toISOString() } : n,
      );
      persistNotes(next);
      return next;
    });
  };

  const addNote = () => {
    const note = makeNote();
    setNotes((prev) => {
      const next = [note, ...prev];
      saveNotes(next);
      return next;
    });
    setActiveId(note.id);
  };

  const deleteNote = (id: string) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      const fallback = next.length > 0 ? next : [makeNote()];
      saveNotes(fallback);
      if (activeId === id) setActiveId(fallback[0].id);
      return fallback;
    });
  };

  if (!mounted) {
    return (
      <div id="notes" className="rounded-2xl border border-slate-800/60 bg-[#0a0d16] p-6 animate-pulse">
        <div className="h-4 w-32 rounded bg-slate-800/60 mb-4" />
        <div className="h-48 rounded bg-slate-800/40" />
      </div>
    );
  }

  return (
    <div id="notes" className="rounded-2xl border border-slate-800/60 bg-[#0a0d16] overflow-hidden shadow-xl shadow-black/20">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/60 bg-[#080b14]">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
            <NotebookPen className="w-4 h-4 text-violet-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100 tracking-wide">Notes</h2>
            <p className="text-xs text-slate-600 mt-0.5">Stored locally · never sent to a server</p>
          </div>
        </div>
        <button
          onClick={addNote}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/25 text-xs text-violet-300 hover:bg-violet-500/20 hover:border-violet-500/40 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Note
        </button>
      </div>

      <div className="flex min-h-[380px]">
        {/* Sidebar */}
        <div className="w-48 shrink-0 border-r border-slate-800/60 bg-[#080b14] flex flex-col">
          <div className="flex-1 overflow-y-auto py-2">
            {notes.map((note) => (
              <button
                key={note.id}
                onClick={() => setActiveId(note.id)}
                className={clsx(
                  'w-full text-left px-3 py-2.5 flex items-start gap-2 group transition-colors',
                  activeId === note.id
                    ? 'bg-violet-500/10 border-r-2 border-violet-500'
                    : 'hover:bg-slate-800/40 border-r-2 border-transparent',
                )}
              >
                <FileText
                  className={clsx(
                    'w-3.5 h-3.5 mt-0.5 shrink-0',
                    activeId === note.id ? 'text-violet-400' : 'text-slate-700',
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={clsx(
                      'text-xs font-medium truncate',
                      activeId === note.id ? 'text-violet-300' : 'text-slate-500',
                    )}
                  >
                    {note.title}
                  </p>
                  <p className="text-xs text-slate-700 mt-0.5 truncate">
                    {new Date(note.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Editor */}
        {activeNote ? (
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800/60 bg-[#0a0d16]">
              <input
                type="text"
                value={activeNote.title}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="flex-1 bg-transparent text-sm font-medium text-slate-100 placeholder:text-slate-700 outline-none border-none"
                placeholder="Note title…"
              />
              <div className="flex items-center gap-2">
                {savedAt && (
                  <span className="flex items-center gap-1 text-xs text-emerald-500/70 font-mono">
                    <Save className="w-3 h-3" />
                    {savedAt}
                  </span>
                )}
                <button
                  onClick={() => deleteNote(activeNote.id)}
                  className="p-1 rounded text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Delete note"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <textarea
              value={activeNote.content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder={`Write your trade notes, macro thesis, key levels…\n\nFormatting:\n  • Bullet points\n  # Headers\n  Key: Value pairs`}
              className="flex-1 w-full resize-none bg-transparent px-5 py-4 text-sm text-slate-300 placeholder:text-slate-800 outline-none font-mono leading-relaxed"
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-700 text-sm">
            Select a note or create one
          </div>
        )}
      </div>
    </div>
  );
}
