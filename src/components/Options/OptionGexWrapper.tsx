'use client';

import { useState } from 'react';
import OptionsSection from './OptionsSection';
import GEXBotSection from '@/components/GEXBot/GEXBotSection';

type Tab = 'options' | 'gex';

export default function OptionGexWrapper() {
  const [tab, setTab] = useState<Tab>('options');

  return (
    <div>
      {/* Toggle */}
      <div className="flex items-center justify-end mb-4">
        <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 gap-0.5">
          {(['options', 'gex'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-widest transition-colors ${
                tab === t
                  ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t === 'options' ? 'Option Flow' : 'GEX Intelligence'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'options' ? <OptionsSection /> : <GEXBotSection />}
    </div>
  );
}
