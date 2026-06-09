'use client';

import { CalendarDays, Activity, Newspaper, TrendingUp, LineChart, ClipboardList, Bitcoin, Bell } from 'lucide-react';
import { clsx } from 'clsx';
import type { Section } from './Sidebar';

const NAV_ITEMS: { id: Section; icon: React.ElementType; label: string }[] = [
  { id: 'calendar', icon: CalendarDays,  label: 'Calendar' },
  { id: 'cot',      icon: TrendingUp,    label: 'COT'      },
  { id: 'metrics',  icon: Activity,      label: 'Macro'    },
  { id: 'options',  icon: LineChart,     label: 'Options'  },
  { id: 'crypto',   icon: Bitcoin,       label: 'Crypto'   },
  { id: 'news',     icon: Newspaper,     label: 'News'     },
  { id: 'journal',  icon: ClipboardList, label: 'Journal'  },
  { id: 'alerts',   icon: Bell,          label: 'Alerts'   },
];

interface Props {
  active: Section;
  onNavigate: (s: Section) => void;
}

export default function MobileNav({ active, onNavigate }: Props) {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#09090b]/95 backdrop-blur-sm border-t border-slate-800/60 flex safe-area-pb">
      {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onNavigate(id)}
          className={clsx(
            'flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors',
            active === id ? 'text-amber-400' : 'text-slate-600 hover:text-slate-400',
          )}
        >
          <Icon className={clsx('w-5 h-5', active === id && 'drop-shadow-[0_0_4px_rgba(251,191,36,0.4)]')} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
