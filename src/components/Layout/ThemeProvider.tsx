'use client';

import { useEffect } from 'react';
import { readTheme, applyTheme } from '@/lib/theme';

export default function ThemeProvider() {
  useEffect(() => {
    applyTheme(readTheme());
  }, []);
  return null;
}
