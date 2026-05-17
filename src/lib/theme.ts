export const THEMES = ['bloomberg', 'matrix', 'cobalt', 'crimson', 'violet', 'cyan', 'mono'] as const;
export type Theme = typeof THEMES[number];

export const THEME_META: Record<Theme, { label: string; accent: string; desc: string }> = {
  bloomberg: { label: 'Bloomberg', accent: '#f59e0b', desc: 'Amber on black' },
  matrix:    { label: 'Matrix',    accent: '#4ade80', desc: 'Green on black' },
  cobalt:    { label: 'Cobalt',    accent: '#60a5fa', desc: 'Blue on black'  },
  crimson:   { label: 'Crimson',   accent: '#f87171', desc: 'Red on black'   },
  violet:    { label: 'Violet',    accent: '#c084fc', desc: 'Purple on black'},
  cyan:      { label: 'Cyan',      accent: '#22d3ee', desc: 'Teal on black'  },
  mono:      { label: 'Mono',      accent: '#94a3b8', desc: 'Grey on black'  },
};

const LS_KEY = 'macro_theme';

export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(LS_KEY) as Theme;
    if (THEMES.includes(t)) return t;
  } catch {}
  return 'bloomberg';
}

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(LS_KEY, t); } catch {}
}
