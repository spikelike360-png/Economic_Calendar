'use client';

import { useEffect, useState } from 'react';
import { sbLoad, sbSave } from '@/lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

type Billing  = 'monthly' | 'annual' | 'weekly';
type Currency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD';

interface Subscription {
  id:          string;
  name:        string;
  price:       number;
  currency:    Currency;
  billing:     Billing;
  category:    string;
  renewalDay:  number;   // 1–31
  notes:       string;
  active:      boolean;
}

const STORAGE_KEY = 'macro_subscriptions_v1';

const CATEGORIES = [
  'Trading / Data',
  'Software / Dev',
  'Entertainment',
  'Finance / Banking',
  'Health / Fitness',
  'News / Media',
  'Cloud / Storage',
  'Other',
];

const CAT_COLORS: Record<string, string> = {
  'Trading / Data':    'text-amber-400  border-amber-800/50  bg-amber-900/20',
  'Software / Dev':    'text-blue-400   border-blue-800/50   bg-blue-900/20',
  'Entertainment':     'text-purple-400 border-purple-800/50 bg-purple-900/20',
  'Finance / Banking': 'text-emerald-400 border-emerald-800/50 bg-emerald-900/20',
  'Health / Fitness':  'text-pink-400   border-pink-800/50   bg-pink-900/20',
  'News / Media':      'text-cyan-400   border-cyan-800/50   bg-cyan-900/20',
  'Cloud / Storage':   'text-violet-400 border-violet-800/50 bg-violet-900/20',
  'Other':             'text-zinc-400   border-zinc-700/50   bg-zinc-800/20',
};

const BLANK: Omit<Subscription, 'id'> = {
  name: '', price: 0, currency: 'USD', billing: 'monthly',
  category: 'Other', renewalDay: 1, notes: '', active: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMonthly(price: number, billing: Billing): number {
  if (billing === 'annual')  return price / 12;
  if (billing === 'weekly')  return (price * 52) / 12;
  return price;
}

function fmt(n: number, currency: Currency): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n);
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function daysUntilRenewal(day: number): number {
  const now  = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), day);
  if (next <= now) next.setMonth(next.getMonth() + 1);
  return Math.ceil((next.getTime() - now.getTime()) / 86_400_000);
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-5xl mb-4">💳</div>
      <p className="text-lg font-bold text-zinc-400 mb-1">No subscriptions yet</p>
      <p className="text-sm text-zinc-600 mb-4">Track everything you pay for each month</p>
      <button onClick={onAdd}
        className="px-4 py-2 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-sm font-bold rounded hover:bg-amber-500/30 transition-colors uppercase tracking-wider">
        + Add First Subscription
      </button>
    </div>
  );
}

// ── Form modal ────────────────────────────────────────────────────────────────

function SubForm({
  initial, onSave, onClose,
}: {
  initial: Omit<Subscription, 'id'> & { id?: string };
  onSave:  (s: Subscription) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState(initial);
  const set = <K extends keyof typeof BLANK>(k: K, v: (typeof BLANK)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || form.price <= 0) return;
    onSave({ ...form, id: initial.id ?? uid() } as Subscription);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0d0d12] border border-zinc-700/60 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <p className="text-sm font-bold text-white uppercase tracking-widest">
            {initial.id ? 'Edit Subscription' : 'Add Subscription'}
          </p>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1">Name *</label>
            <input
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              placeholder="e.g. TradingView, Netflix, ChatGPT…"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              required
            />
          </div>

          {/* Price + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1">Price *</label>
              <input
                type="number" min="0" step="0.01"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                value={form.price || ''}
                onChange={(e) => set('price', parseFloat(e.target.value) || 0)}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1">Currency</label>
              <select
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                value={form.currency}
                onChange={(e) => set('currency', e.target.value as Currency)}
              >
                {(['USD','EUR','GBP','CAD','AUD'] as Currency[]).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Billing + Renewal day */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1">Billing cycle</label>
              <select
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                value={form.billing}
                onChange={(e) => set('billing', e.target.value as Billing)}
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1">Renewal day</label>
              <input
                type="number" min="1" max="31"
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                value={form.renewalDay}
                onChange={(e) => set('renewalDay', Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1">Category</label>
            <select
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-zinc-500 uppercase tracking-widest mb-1">Notes</label>
            <input
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500"
              placeholder="Optional notes…"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => set('active', !form.active)}
              className={`w-9 h-5 rounded-full transition-colors relative ${form.active ? 'bg-amber-500' : 'bg-zinc-700'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${form.active ? 'left-4' : 'left-0.5'}`} />
            </div>
            <span className="text-sm text-zinc-400">Active</span>
          </label>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 border border-zinc-700 text-zinc-400 text-sm rounded hover:border-zinc-500 transition-colors">
              Cancel
            </button>
            <button type="submit"
              className="flex-1 py-2 bg-amber-500/20 border border-amber-500/50 text-amber-300 text-sm font-bold rounded hover:bg-amber-500/30 transition-colors">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SubscriptionsSection() {
  const [subs,       setSubs]       = useState<Subscription[]>([]);
  const [showForm,   setShowForm]   = useState(false);
  const [editing,    setEditing]    = useState<Subscription | null>(null);
  const [delConfirm, setDelConfirm] = useState<string | null>(null);
  const [filterCat,  setFilterCat]  = useState<string>('All');
  const [sortBy,     setSortBy]     = useState<'name' | 'price' | 'renewal'>('price');

  // Load — Supabase first, localStorage fallback
  useEffect(() => {
    async function load() {
      try {
        const remote = await sbLoad<Subscription[]>('subscriptions', 'all');
        if (remote) { setSubs(remote); localStorage.setItem(STORAGE_KEY, JSON.stringify(remote)); return; }
      } catch { /* ignore */ }
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) setSubs(JSON.parse(raw));
      } catch { /* ignore */ }
    }
    load();
  }, []);

  const save = (updated: Subscription[]) => {
    setSubs(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    sbSave('subscriptions', 'all', updated).catch(() => {});
  };

  const handleSave = (sub: Subscription) => {
    const existing = subs.find((s) => s.id === sub.id);
    save(existing ? subs.map((s) => s.id === sub.id ? sub : s) : [...subs, sub]);
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = (id: string) => {
    save(subs.filter((s) => s.id !== id));
    setDelConfirm(null);
  };

  const toggleActive = (id: string) => {
    save(subs.map((s) => s.id === id ? { ...s, active: !s.active } : s));
  };

  // Derived
  const activeSubs = subs.filter((s) => s.active);
  const totalMonthly = activeSubs.reduce((sum, s) => sum + toMonthly(s.price, s.billing), 0);
  const totalAnnual  = totalMonthly * 12;

  const cats = ['All', ...Array.from(new Set(subs.map((s) => s.category)))];

  const filtered = subs
    .filter((s) => filterCat === 'All' || s.category === filterCat)
    .sort((a, b) => {
      if (sortBy === 'name')    return a.name.localeCompare(b.name);
      if (sortBy === 'renewal') return a.renewalDay - b.renewalDay;
      return toMonthly(b.price, b.billing) - toMonthly(a.price, a.billing);
    });

  // Category totals for chart
  const catTotals = CATEGORIES
    .map((cat) => ({
      cat,
      monthly: activeSubs.filter((s) => s.category === cat).reduce((sum, s) => sum + toMonthly(s.price, s.billing), 0),
    }))
    .filter((x) => x.monthly > 0)
    .sort((a, b) => b.monthly - a.monthly);

  return (
    <div className="space-y-4">

      {/* ── SUMMARY ──────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[#0a0a10] border border-zinc-800/60 rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Monthly total</p>
          <p className="text-2xl font-bold text-white font-mono">{fmt(totalMonthly, 'USD')}</p>
          <p className="text-xs text-zinc-600 mt-1">{activeSubs.length} active subscriptions</p>
        </div>
        <div className="bg-[#0a0a10] border border-zinc-800/60 rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Annual total</p>
          <p className="text-2xl font-bold text-amber-400 font-mono">{fmt(totalAnnual, 'USD')}</p>
          <p className="text-xs text-zinc-600 mt-1">per year</p>
        </div>
        <div className="bg-[#0a0a10] border border-zinc-800/60 rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Avg per sub</p>
          <p className="text-2xl font-bold text-white font-mono">
            {activeSubs.length > 0 ? fmt(totalMonthly / activeSubs.length, 'USD') : '—'}
          </p>
          <p className="text-xs text-zinc-600 mt-1">monthly average</p>
        </div>
        <div className="bg-[#0a0a10] border border-zinc-800/60 rounded-lg p-4">
          <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">Paused</p>
          <p className="text-2xl font-bold text-zinc-500 font-mono">{subs.filter((s) => !s.active).length}</p>
          <p className="text-xs text-zinc-600 mt-1">inactive subscriptions</p>
        </div>
      </div>

      {/* ── CATEGORY BREAKDOWN ────────────────────────────────────────────────── */}
      {catTotals.length > 0 && (
        <div className="bg-[#0a0a10] border border-zinc-800/60 rounded-lg p-4">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-3">Monthly spend by category</p>
          <div className="space-y-2">
            {catTotals.map(({ cat, monthly }) => {
              const pct  = totalMonthly > 0 ? (monthly / totalMonthly) * 100 : 0;
              const cols = CAT_COLORS[cat] ?? CAT_COLORS['Other'];
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className={`text-xs font-mono w-28 shrink-0 ${cols.split(' ')[0]}`}>{cat}</span>
                  <div className="flex-1 h-2 bg-zinc-900 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${cols.split(' ')[0].replace('text-', 'bg-')}`}
                      style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs font-mono text-zinc-300 w-20 text-right shrink-0">{fmt(monthly, 'USD')}/mo</span>
                  <span className="text-xs text-zinc-600 w-10 text-right shrink-0">{pct.toFixed(0)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── CONTROLS ─────────────────────────────────────────────────────────── */}
      {subs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {/* Category filter */}
          <div className="flex flex-wrap gap-1">
            {cats.map((c) => (
              <button key={c} onClick={() => setFilterCat(c)}
                className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                  filterCat === c
                    ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                    : 'border border-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}>
                {c}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Sort */}
          <select
            className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-400 focus:outline-none"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          >
            <option value="price">Sort: Price</option>
            <option value="name">Sort: Name</option>
            <option value="renewal">Sort: Renewal day</option>
          </select>

          <button onClick={() => { setEditing(null); setShowForm(true); }}
            className="px-3 py-1.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold rounded hover:bg-amber-500/30 transition-colors uppercase tracking-wider">
            + Add
          </button>
        </div>
      )}

      {/* ── SUBSCRIPTION LIST ─────────────────────────────────────────────────── */}
      {subs.length === 0 ? (
        <EmptyState onAdd={() => { setEditing(null); setShowForm(true); }} />
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => {
            const monthly   = toMonthly(s.price, s.billing);
            const daysLeft  = daysUntilRenewal(s.renewalDay);
            const soon      = daysLeft <= 5;
            const cols      = CAT_COLORS[s.category] ?? CAT_COLORS['Other'];
            const catColor  = cols.split(' ')[0];

            return (
              <div key={s.id}
                className={`bg-[#0a0a10] border rounded-lg px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 transition-opacity ${
                  s.active ? 'border-zinc-800/60' : 'border-zinc-800/30 opacity-50'
                }`}>

                {/* Name + category */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-bold ${s.active ? 'text-white' : 'text-zinc-500'}`}>{s.name}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${cols}`}>
                      {s.category}
                    </span>
                    {!s.active && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border border-zinc-700 text-zinc-500 uppercase">
                        Paused
                      </span>
                    )}
                  </div>
                  {s.notes && <p className="text-xs text-zinc-600 mt-0.5 truncate">{s.notes}</p>}
                </div>

                {/* Price */}
                <div className="text-right shrink-0">
                  <p className={`text-base font-bold font-mono ${s.active ? 'text-white' : 'text-zinc-600'}`}>
                    {fmt(s.price, s.currency)}
                    <span className="text-xs text-zinc-500 ml-1 font-normal">
                      /{s.billing === 'monthly' ? 'mo' : s.billing === 'annual' ? 'yr' : 'wk'}
                    </span>
                  </p>
                  {s.billing !== 'monthly' && (
                    <p className="text-xs text-zinc-500 font-mono">≈ {fmt(monthly, s.currency)}/mo</p>
                  )}
                </div>

                {/* Renewal */}
                <div className="text-right shrink-0 min-w-[80px]">
                  <p className={`text-xs font-mono ${soon && s.active ? 'text-amber-400 font-bold' : 'text-zinc-500'}`}>
                    {soon && s.active ? `⚠ ${daysLeft}d` : `day ${s.renewalDay}`}
                  </p>
                  <p className="text-[10px] text-zinc-700">renewal</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => toggleActive(s.id)}
                    className={`w-8 h-4 rounded-full transition-colors relative ${s.active ? 'bg-amber-500' : 'bg-zinc-700'}`}>
                    <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${s.active ? 'left-4' : 'left-0.5'}`} />
                  </button>
                  <button onClick={() => { setEditing(s); setShowForm(true); }}
                    className="text-zinc-600 hover:text-amber-400 transition-colors text-xs px-1">✎</button>
                  {delConfirm === s.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(s.id)}
                        className="text-red-400 hover:text-red-300 text-xs font-bold px-1">✓</button>
                      <button onClick={() => setDelConfirm(null)}
                        className="text-zinc-600 hover:text-zinc-400 text-xs px-1">✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setDelConfirm(s.id)}
                      className="text-zinc-700 hover:text-red-500 transition-colors text-xs px-1">🗑</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── FORM MODAL ────────────────────────────────────────────────────────── */}
      {showForm && (
        <SubForm
          initial={editing ?? BLANK}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      <p className="text-center text-xs text-zinc-700 font-mono uppercase tracking-widest pb-2">
        Stored locally · private · never sent anywhere
      </p>
    </div>
  );
}
