'use client';

import { useState } from 'react';
import Sidebar, { type Section } from '@/components/Layout/Sidebar';
import Header from '@/components/Layout/Header';
import CalendarSection from '@/components/Calendar/CalendarSection';
import MetricsSection from '@/components/Metrics/MetricsSection';
import NotesSection from '@/components/Notes/NotesSection';
import NewsSection from '@/components/News/NewsSection';
import COTSection from '@/components/COT/COTSection';

export default function Home() {
  const [active, setActive] = useState<Section>('calendar');

  return (
    <div className="flex h-screen overflow-hidden bg-[#05080f]">
      <Sidebar active={active} onNavigate={setActive} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header activeSection={active} />
        <main className="flex-1 overflow-y-auto px-6 py-6">
          {active === 'calendar' && <CalendarSection />}
          {active === 'metrics'  && <MetricsSection />}
          {active === 'news'     && <NewsSection />}
          {active === 'cot'      && <COTSection />}
          {active === 'notes'    && <NotesSection />}
        </main>
      </div>
    </div>
  );
}
