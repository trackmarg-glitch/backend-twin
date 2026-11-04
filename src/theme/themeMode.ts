import { useSyncExternalStore } from 'react';

/**
 * App theme: 'pastel' (light frosted glass, pinks and blues; the default) or
 * 'studio' (the dark Precision Engineering Studio). Applied as
 * <html data-theme="…">, remembered per browser, and switchable from the top
 * bar or the command palette. Importing this module applies the stored theme
 * before React renders, so there is no flash of the wrong theme.
 */
export type Theme = 'pastel' | 'studio';

const KEY = 'autotwin.theme';
const listeners = new Set<() => void>();

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'pastel' || v === 'studio') return v;
  } catch {
    /* storage unavailable */
  }
  return 'pastel';
}

let current: Theme = read();

function apply(t: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme = t === 'pastel' ? 'light' : 'dark';
}
apply(current);

export function getTheme(): Theme {
  return current;
}

export function setTheme(t: Theme) {
  if (t === current) return;
  current = t;
  apply(t);
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function toggleTheme() {
  setTheme(current === 'pastel' ? 'studio' : 'pastel');
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

/** Background colour for R3F canvases that paint their own background. */
export const CANVAS_BG: Record<Theme, string> = { pastel: '#eef0fb', studio: '#0a1020' };

/**
 * Series colours are chosen for a dark background. On the light theme, darken
 * them so lines and dots keep >= 3:1 contrast (WCAG 1.4.11) against the glass.
 */
export function inkFor(color: string, theme: Theme): string {
  if (theme !== 'pastel') return color;
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const k = 0.62;
  const ch = (s: number) => Math.round(((n >> s) & 255) * k);
  return `#${[ch(16), ch(8), ch(0)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
