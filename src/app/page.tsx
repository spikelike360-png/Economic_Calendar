'use client';

import { useState, useRef, useCallback } from 'react';
import Sidebar, { type Section } from '@/components/Layout/Sidebar';
import MobileNav from '@/components/Layout/MobileNav';
import Header from '@/components/Layout/Header';
import CalendarSection from '@/components/Calendar/CalendarSection';
import MetricsSection from '@/components/Metrics/MetricsSection';
import NewsSection from '@/components/News/NewsSection';
import CotSeasonalityWrapper from '@/components/COT/CotSeasonalityWrapper';
import EarningsSection from '@/components/Earnings/EarningsSection';
import ESISection from '@/components/ESI/ESISection';
import AlertsSection from '@/components/Alerts/AlertsSection';
import CryptoSection from '@/components/Crypto/CryptoSection';
import SubscriptionsSection from '@/components/Subscriptions/SubscriptionsSection';
import OptionGexWrapper from '@/components/Options/OptionGexWrapper';
import JournalNotesWrapper from '@/components/Journal/JournalNotesWrapper';
import QuickNoteModal from '@/components/Notes/QuickNoteModal';

const SECTIONS: Section[] = ['calendar', 'cot', 'metrics', 'options', 'crypto', 'news', 'earnings', 'journal', 'subscriptions', 'alerts'];
const SWIPE_THRESHOLD = 50; // px

export default function Home() {
  const [active, setActive] = useState<Section>('calendar');
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;

    // Ignore if primarily a vertical scroll
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;

    const idx = SECTIONS.indexOf(active);
    if (dx < 0 && idx < SECTIONS.length - 1) setActive(SECTIONS[idx + 1]); // swipe left → next
    if (dx > 0 && idx > 0) setActive(SECTIONS[idx - 1]);                    // swipe right → prev
  }, [active]);

  return (
    <div className="flex h-screen overflow-hidden bg-[#09090b]">
      {/* Sidebar — desktop only */}
      <Sidebar active={active} onNavigate={setActive} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Header activeSection={active} />
        <main
          className="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-6 pb-20 md:pb-6"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {active === 'calendar' && <CalendarSection />}
          {active === 'metrics'  && <MetricsSection />}
          {active === 'esi'      && <ESISection />}
          {active === 'news'     && <NewsSection />}
          {active === 'cot'          && <CotSeasonalityWrapper />}
          {active === 'earnings'     && <EarningsSection />}
          {active === 'options'       && <OptionGexWrapper />}
          {active === 'alerts'        && <AlertsSection />}
          {active === 'journal'       && <JournalNotesWrapper />}
          {active === 'crypto'        && <CryptoSection />}
          {active === 'subscriptions' && <SubscriptionsSection />}
        </main>
      </div>

      {/* Bottom nav — mobile only */}
      <MobileNav active={active} onNavigate={setActive} />

      {/* Quick note popup — navigates to journal (which contains notes tab) */}
      {active !== 'journal' && <QuickNoteModal onNavigateNotes={() => setActive('journal')} />}
    </div>
  );
}
