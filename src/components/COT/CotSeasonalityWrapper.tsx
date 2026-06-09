'use client';

import { useState } from 'react';
import COTSection from './COTSection';
import SeasonalitySection from '@/components/Seasonality/SeasonalitySection';

type Tab = 'cot' | 'seasonality';

const TABS: { id: Tab; label: string }[] = [
  { id: 'cot',         label: 'COT Report'  },
  { id: 'seasonality', label: 'Seasonality' },
];

export default function CotSeasonalityWrapper() {
  const [tab, setTab] = useState<Tab>('cot');

  return (
    <div>
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

      {tab === 'cot'         && <COTSection />}
      {tab === 'seasonality' && <SeasonalitySection />}
    </div>
  );
}
