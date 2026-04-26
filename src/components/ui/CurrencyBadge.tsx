import type { Currency } from '@/lib/types';
import { clsx } from 'clsx';

const CURRENCY_CLS: Record<Currency, string> = {
  USD: 'bg-sky-500/15 text-sky-400 border border-sky-500/25',
  EUR: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/25',
  GBP: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
  JPY: 'bg-rose-500/15 text-rose-400 border border-rose-500/25',
  CAD: 'bg-orange-500/15 text-orange-400 border border-orange-500/25',
  AUD: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
};

interface Props {
  currency: Currency;
  className?: string;
}

export default function CurrencyBadge({ currency, className }: Props) {
  return (
    <span
      className={clsx(
        'inline-flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-bold tracking-wider font-mono',
        CURRENCY_CLS[currency],
        className,
      )}
    >
      {currency}
    </span>
  );
}
