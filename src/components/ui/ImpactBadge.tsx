import type { Impact } from '@/lib/types';
import { clsx } from 'clsx';

const IMPACT_CONFIG: Record<Impact, { label: string; dots: string; cls: string }> = {
  high:    { label: 'High',    dots: '●●●', cls: 'bg-red-500/15 text-red-400 border border-red-500/25' },
  medium:  { label: 'Med',     dots: '●●○', cls: 'bg-orange-500/15 text-orange-400 border border-orange-500/25' },
  low:     { label: 'Low',     dots: '●○○', cls: 'bg-yellow-500/15 text-yellow-500 border border-yellow-500/25' },
  holiday: { label: 'Holiday', dots: '—',   cls: 'bg-slate-700/50 text-slate-400 border border-slate-600/30' },
  none:    { label: '—',       dots: '—',   cls: 'bg-slate-700/50 text-slate-500 border border-slate-600/30' },
};

interface Props {
  impact: Impact;
  compact?: boolean;
}

export default function ImpactBadge({ impact, compact = false }: Props) {
  const cfg = IMPACT_CONFIG[impact];
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium font-mono tracking-tight',
        cfg.cls,
      )}
      title={cfg.label}
    >
      <span>{cfg.dots}</span>
      {!compact && <span className="hidden sm:inline">{cfg.label}</span>}
    </span>
  );
}
