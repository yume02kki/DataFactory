import { useEffect, useState } from 'react';

/** 'system' follows the OS setting; picking light or dark in the app pins it. */
export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const KEY = 'datafactory.theme';
const media = () => window.matchMedia?.('(prefers-color-scheme: dark)');

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const resolve = (pref: ThemePref): Theme => (pref === 'system' ? (media()?.matches ? 'dark' : 'light') : pref);

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** Applies the saved theme straight away, before the first paint. */
export function initTheme() {
  apply(resolve(readPref()));
}

/** The current theme, and a toggle that pins the opposite one. */
export function useTheme(): [Theme, () => void] {
  const [pref, setPref] = useState<ThemePref>(readPref);
  const [systemDark, setSystemDark] = useState(() => !!media()?.matches);
  const theme: Theme = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;

  useEffect(() => {
    const m = media();
    if (!m) return;
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);

  useEffect(() => apply(theme), [theme]);

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode etc.: the toggle still works for this visit.
    }
    setPref(next);
  };
  return [theme, toggle];
}
