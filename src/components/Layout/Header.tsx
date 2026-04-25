'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import type { Section } from './Sidebar';

const SECTION_TITLE: Record<Section, string> = {
  calendar: 'Economic Calendar',
  metrics:  'Macro Metrics',
  news:     'News Feed',
  cot:      'Commitment of Traders',
  notes:    'Notes',
};

const SECTION_SUB: Record<Section, string> = {
  calendar: 'Forex Factory · USD · EUR · GBP · JPY · CAD · AUD',
  metrics:  'Interest rates · Inflation · Unemployment · GDP',
  news:     'Yahoo Finance · CNBC · MarketWatch · Live RSS',
  cot:      'CFTC · Currencies & Commodities · Non-Commercial / Commercial / Non-Reportable',
  notes:    'Stored locally · never sent to a server',
};

interface Props {
  activeSection: Section;
}

export default function Header({ activeSection }: Props) {
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      const t = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(new Date());
      setClock(`${t} ET`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="h-14 shrink-0 border-b border-slate-800/60 bg-[#05080f]/95 backdrop-blur-sm flex items-center justify-between px-6">
      <div>
        <h1 className="text-sm font-semibold text-slate-100 leading-none">
          {SECTION_TITLE[activeSection]}
        </h1>
        <p className="text-xs text-slate-600 mt-0.5">{SECTION_SUB[activeSection]}</p>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-mono">
        <Clock className="w-3.5 h-3.5 shrink-0 text-slate-700" />
        <span className="hidden md:inline">{clock}</span>
      </div>
    </header>
  );
}
