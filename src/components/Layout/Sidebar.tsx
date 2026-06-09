'use client';

import { CalendarDays, Activity, NotebookPen, BarChart2, Newspaper, TrendingUp, BarChart, DollarSign, LineChart, Gauge, Zap, ClipboardList, Bell, Bitcoin, CreditCard } from 'lucide-react';
import { clsx } from 'clsx';
import ThemeSelector from './ThemeSelector';

export type Section = 'calendar' | 'metrics' | 'news' | 'cot' | 'earnings' | 'options' | 'esi' | 'journal' | 'alerts' | 'crypto' | 'subscriptions';

const NAV_ITEMS: { id: Section; icon: React.ElementType; label: string; abbr: string }[] = [
  { id: 'calendar',      icon: CalendarDays,  label: 'CALENDAR',    abbr: 'CAL'  },
  { id: 'cot',           icon: TrendingUp,    label: 'COT',         abbr: 'COT'  },
  { id: 'metrics',       icon: Activity,      label: 'MACRO',       abbr: 'MAC'  },
  { id: 'options',       icon: LineChart,     label: 'OPTIONS',     abbr: 'OPT'  },
  { id: 'crypto',        icon: Bitcoin,       label: 'CRYPTO',      abbr: 'BTC'  },
  { id: 'news',          icon: Newspaper,     label: 'NEWS FEED',   abbr: 'NEWS' },
  { id: 'earnings',      icon: DollarSign,    label: 'EARNINGS',    abbr: 'ERN'  },
  { id: 'journal',       icon: ClipboardList, label: 'JOURNAL',     abbr: 'JRN'  },
  { id: 'subscriptions', icon: CreditCard,    label: 'SUBS',        abbr: 'SUB'  },
  { id: 'alerts',        icon: Bell,          label: 'ALERTS',      abbr: 'ALT'  },
];

interface Props {
  active: Section;
  onNavigate: (s: Section) => void;
}

export default function Sidebar({ active, onNavigate }: Props) {
  return (
    <aside className="hidden md:flex w-40 shrink-0 flex-col bg-[#000000] border-r border-amber-900/40 h-screen sticky top-0">
      {/* Logo / brand */}
      <div className="px-3 py-3 border-b border-amber-900/40 flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-amber-400 shrink-0" />
        <div>
          <p className="text-[11px] font-bold text-amber-400 uppercase tracking-widest leading-none">MACRO</p>
          <p className="text-[9px] text-amber-700 uppercase tracking-widest leading-none mt-0.5">TERMINAL</p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-1">
        {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={clsx(
              'w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-l-2',
              active === id
                ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                : 'border-transparent text-slate-600 hover:text-amber-400 hover:bg-amber-500/5 hover:border-amber-700',
            )}
          >
            <Icon className={clsx('w-3.5 h-3.5 shrink-0', active === id ? 'text-amber-400' : 'text-slate-700')} />
            <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-amber-900/30">
        <ThemeSelector />
        <div className="px-3 py-1.5">
          <p className="text-[9px] text-slate-700 uppercase tracking-wider">v1.0 · Local</p>
        </div>
      </div>
    </aside>
  );
}
