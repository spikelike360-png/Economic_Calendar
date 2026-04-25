'use client';

import { CalendarDays, Activity, NotebookPen, BarChart2, Newspaper, TrendingUp } from 'lucide-react';
import { clsx } from 'clsx';

export type Section = 'calendar' | 'metrics' | 'news' | 'cot' | 'notes';

const NAV_ITEMS: { id: Section; icon: React.ElementType; label: string }[] = [
  { id: 'calendar', icon: CalendarDays,  label: 'Calendar'      },
  { id: 'metrics',  icon: Activity,      label: 'Macro Metrics' },
  { id: 'news',     icon: Newspaper,     label: 'News Feed'     },
  { id: 'cot',      icon: TrendingUp,    label: 'COT Report'    },
  { id: 'notes',    icon: NotebookPen,   label: 'Notes'         },
];

interface Props {
  active: Section;
  onNavigate: (s: Section) => void;
}

export default function Sidebar({ active, onNavigate }: Props) {
  return (
    <aside className="w-14 shrink-0 flex flex-col items-center py-4 gap-2 bg-[#05080f] border-r border-slate-800/60 h-screen sticky top-0">
      {/* Logo */}
      <div className="mb-4 p-2 rounded-xl bg-violet-500/15 border border-violet-500/25">
        <BarChart2 className="w-4 h-4 text-violet-400" />
      </div>

      {/* Nav items */}
      {NAV_ITEMS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          title={label}
          onClick={() => onNavigate(id)}
          className={clsx(
            'w-10 h-10 flex items-center justify-center rounded-xl transition-colors',
            active === id
              ? 'bg-violet-500/20 border border-violet-500/35 text-violet-300'
              : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800/60 border border-transparent',
          )}
        >
          <Icon className="w-4.5 h-4.5" />
        </button>
      ))}
    </aside>
  );
}
