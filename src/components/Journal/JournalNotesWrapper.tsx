'use client';

import { useState } from 'react';
import JournalSection from './JournalSection';
import NotesSection from '@/components/Notes/NotesSection';
import TaskManagerSection from './TaskManagerSection';

type Tab = 'journal' | 'tasks' | 'notes';

const TABS: { id: Tab; label: string }[] = [
  { id: 'journal', label: 'Trade Journal' },
  { id: 'tasks',   label: 'Task Manager'  },
  { id: 'notes',   label: 'Notes'         },
];

export default function JournalNotesWrapper() {
  const [tab, setTab] = useState<Tab>('journal');

  return (
    <div>
      {/* Toggle */}
      <div className="flex items-center justify-end mb-4">
        <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-widest transition-colors ${
                tab === t.id
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'journal' && <JournalSection />}
      {tab === 'tasks'   && <TaskManagerSection />}
      {tab === 'notes'   && <NotesSection />}
    </div>
  );
}
