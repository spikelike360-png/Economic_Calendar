'use client';

import { useEffect, useRef, useState } from 'react';
import { sbLoad, sbSave } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Task {
  id:        string;
  text:      string;
  done:      boolean;
  priority:  'high' | 'medium' | 'low';
  createdAt: number;
}

type TasksByDate = Record<string, Task[]>; // key: YYYY-MM-DD

const STORAGE_KEY = 'macro_tasks_v1';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toKey(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function formatDay(d: Date): string {
  const today = toKey(new Date());
  const key   = toKey(d);
  if (key === today)                           return 'Today';
  if (key === toKey(addDays(new Date(), -1)))  return 'Yesterday';
  if (key === toKey(addDays(new Date(),  1)))  return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

const PRIORITY_STYLES = {
  high:   { dot: 'bg-red-400',    text: 'text-red-400',    label: 'High'   },
  medium: { dot: 'bg-amber-400',  text: 'text-amber-400',  label: 'Med'    },
  low:    { dot: 'bg-zinc-500',   text: 'text-zinc-500',   label: 'Low'    },
};

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TaskManagerSection() {
  const [allTasks,  setAllTasks]  = useState<TasksByDate>({});
  const [day,       setDay]       = useState<Date>(new Date());
  const [input,     setInput]     = useState('');
  const [priority,  setPriority]  = useState<Task['priority']>('medium');
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editText,  setEditText]  = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Load — Supabase first, localStorage fallback
  useEffect(() => {
    async function load() {
      try {
        const remote = await sbLoad<TasksByDate>('tasks', 'all');
        if (remote) { setAllTasks(remote); localStorage.setItem(STORAGE_KEY, JSON.stringify(remote)); return; }
      } catch { /* ignore */ }
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) setAllTasks(JSON.parse(raw));
      } catch { /* ignore */ }
    }
    load();
  }, []);

  const persist = (updated: TasksByDate) => {
    setAllTasks(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    sbSave('tasks', 'all', updated).catch(() => {});
  };

  const key      = toKey(day);
  const tasks    = allTasks[key] ?? [];
  const done     = tasks.filter((t) => t.done).length;
  const total    = tasks.length;
  const isToday  = key === toKey(new Date());

  // ── Actions ────────────────────────────────────────────────────────────────

  const addTask = () => {
    const text = input.trim();
    if (!text) return;
    const next = { ...allTasks, [key]: [...tasks, { id: uid(), text, done: false, priority, createdAt: Date.now() }] };
    persist(next);
    setInput('');
    inputRef.current?.focus();
  };

  const toggleDone = (id: string) => {
    const next = { ...allTasks, [key]: tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t) };
    persist(next);
  };

  const deleteTask = (id: string) => {
    const next = { ...allTasks, [key]: tasks.filter((t) => t.id !== id) };
    persist(next);
  };

  const saveEdit = (id: string) => {
    const text = editText.trim();
    if (!text) return;
    const next = { ...allTasks, [key]: tasks.map((t) => t.id === id ? { ...t, text } : t) };
    persist(next);
    setEditId(null);
  };

  const clearDone = () => {
    const next = { ...allTasks, [key]: tasks.filter((t) => !t.done) };
    persist(next);
  };

  const copyToday = () => {
    const todayKey = toKey(new Date());
    const todayTasks = (allTasks[todayKey] ?? []).map((t) => ({ ...t, done: false }));
    const combined = [...todayTasks, ...tasks.filter((t) => !todayTasks.find((x) => x.text === t.text))];
    const next = { ...allTasks, [todayKey]: combined };
    persist(next);
    setDay(new Date());
  };

  // Sorted: undone first (by priority high→med→low), then done
  const sorted = [...tasks].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.priority] - order[b.priority];
  });

  // Days with tasks (for dot indicator)
  const hasTasks = (d: Date) => (allTasks[toKey(d)] ?? []).length > 0;

  return (
    <div className="space-y-4 max-w-2xl mx-auto">

      {/* ── DAY NAVIGATOR ──────────────────────────────────────────────────── */}
      <div className="bg-[#0a0a10] border border-zinc-800/60 rounded-lg p-4">
        <div className="flex items-center justify-between gap-3">

          {/* Prev */}
          <button onClick={() => setDay((d) => addDays(d, -1))}
            className="w-9 h-9 flex items-center justify-center rounded border border-zinc-800 text-zinc-500 hover:text-amber-400 hover:border-amber-800 transition-colors text-lg">
            ‹
          </button>

          {/* Day display */}
          <div className="flex-1 text-center">
            <p className="text-xl font-bold text-white">{formatDay(day)}</p>
            <p className="text-xs text-zinc-600 font-mono mt-0.5">{key}</p>
            {total > 0 && (
              <div className="flex items-center justify-center gap-2 mt-1">
                <div className="h-1.5 w-24 bg-zinc-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full transition-all"
                    style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }} />
                </div>
                <span className="text-xs text-zinc-500 font-mono">{done}/{total}</span>
              </div>
            )}
          </div>

          {/* Next */}
          <button onClick={() => setDay((d) => addDays(d, 1))}
            className="w-9 h-9 flex items-center justify-center rounded border border-zinc-800 text-zinc-500 hover:text-amber-400 hover:border-amber-800 transition-colors text-lg">
            ›
          </button>
        </div>

        {/* Jump to today */}
        {!isToday && (
          <div className="flex justify-center mt-2 gap-2">
            <button onClick={() => setDay(new Date())}
              className="text-xs text-amber-600 hover:text-amber-400 transition-colors font-mono">
              → Jump to today
            </button>
            {key < toKey(new Date()) && tasks.length > 0 && (
              <button onClick={copyToday}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors font-mono">
                · Copy unfinished to today
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── ADD TASK ───────────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        {/* Priority selector */}
        <div className="flex border border-zinc-800 rounded overflow-hidden shrink-0">
          {(['high', 'medium', 'low'] as Task['priority'][]).map((p) => (
            <button key={p} onClick={() => setPriority(p)}
              className={`px-2 py-2 text-xs font-bold uppercase transition-colors ${
                priority === p
                  ? `${PRIORITY_STYLES[p].text} bg-zinc-800`
                  : 'text-zinc-600 hover:text-zinc-400'
              }`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${PRIORITY_STYLES[p].dot}`} />
            </button>
          ))}
        </div>

        <input
          ref={inputRef}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
          placeholder="Add a task…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTask(); }}
        />

        <button onClick={addTask}
          className="px-4 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-sm font-bold rounded hover:bg-amber-500/30 transition-colors">
          Add
        </button>
      </div>

      {/* ── TASK LIST ──────────────────────────────────────────────────────── */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-zinc-700">
          <p className="text-2xl mb-2">✓</p>
          <p className="text-sm">No tasks for {formatDay(day).toLowerCase()}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {sorted.map((t) => {
            const ps = PRIORITY_STYLES[t.priority];
            return (
              <div key={t.id}
                className={`flex items-start gap-3 bg-[#0a0a10] border rounded-lg px-4 py-3 group transition-all ${
                  t.done ? 'border-zinc-800/30 opacity-50' : 'border-zinc-800/60'
                }`}>

                {/* Checkbox */}
                <button onClick={() => toggleDone(t.id)}
                  className={`mt-0.5 w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-all ${
                    t.done
                      ? 'bg-amber-500 border-amber-500 text-black'
                      : 'border-zinc-600 hover:border-amber-500'
                  }`}>
                  {t.done && <span className="text-[10px] font-bold">✓</span>}
                </button>

                {/* Priority dot */}
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${ps.dot}`} />

                {/* Text */}
                <div className="flex-1 min-w-0">
                  {editId === t.id ? (
                    <input
                      autoFocus
                      className="w-full bg-zinc-800 border border-amber-500/50 rounded px-2 py-0.5 text-sm text-white focus:outline-none"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter')  saveEdit(t.id);
                        if (e.key === 'Escape') setEditId(null);
                      }}
                      onBlur={() => saveEdit(t.id)}
                    />
                  ) : (
                    <p className={`text-sm leading-snug ${t.done ? 'line-through text-zinc-600' : 'text-white'}`}>
                      {t.text}
                    </p>
                  )}
                </div>

                {/* Actions — show on hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => { setEditId(t.id); setEditText(t.text); }}
                    className="text-zinc-600 hover:text-amber-400 text-xs px-1 transition-colors">✎</button>
                  <button onClick={() => deleteTask(t.id)}
                    className="text-zinc-700 hover:text-red-500 text-xs px-1 transition-colors">✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── FOOTER ACTIONS ─────────────────────────────────────────────────── */}
      {done > 0 && (
        <div className="flex justify-end">
          <button onClick={clearDone}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors font-mono">
            Clear {done} completed task{done > 1 ? 's' : ''}
          </button>
        </div>
      )}

      <p className="text-center text-xs text-zinc-700 font-mono uppercase tracking-widest pb-2">
        Stored locally · private
      </p>
    </div>
  );
}
