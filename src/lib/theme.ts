export type Theme = 'dark' | 'light';

const THEME_KEY = 'threedview-theme';

export function readTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const value = window.localStorage.getItem(THEME_KEY);
  return value === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = theme;
  document.body.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // no-op: storage may be unavailable in private browsing or restricted contexts
  }
}
