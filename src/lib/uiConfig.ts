import { useSyncExternalStore } from 'react';
import type { BrandFont, ProjectTheme, UiConfig } from '../@types/config.types';
import { API_BASE_URL } from './api';

/**
 * Visitor-facing presentation settings, driven by the editor's Customize tab.
 * Shared mutable object + subscription, read by the visitor components through
 * `useUiConfig()`.
 */
export const uiConfig: UiConfig = {
  brand: 'The Xgrids Hotel',
  showBrand: true,
  showLabels: true,
  labelAlign: 'left',
  accent: '#b08d57',
  background: '#000000',
  hd: (() => {
    try { return typeof localStorage === 'undefined' || localStorage.getItem('threedview.hd') !== '0'; } catch { return true; }
  })()
};

const listeners = new Set<() => void>();

// Immutable snapshot for useSyncExternalStore — a fresh object only when a value
// actually changed, so getSnapshot() stays referentially stable between edits.
let snap: UiConfig = { ...uiConfig };

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const getSnapshot = () => snap;

export function setUiConfig(patch: Partial<UiConfig>) {
  Object.assign(uiConfig, patch);
  snap = { ...uiConfig };
  if (typeof patch.accent === 'string') {
    document.documentElement.style.setProperty('--gold', patch.accent);
  }
  if (patch.font) document.documentElement.style.setProperty('--serif', FONTS[patch.font]);
  listeners.forEach((fn) => fn());
}

/** Heading faces: system fonts only, so a brand never costs a download. */
const FONTS: Record<BrandFont, string> = {
  serif: "'Georgia', 'Times New Roman', serif",
  sans: "system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  classic: "'Palatino Linotype', 'Book Antiqua', Palatino, 'Times New Roman', serif"
};

/** A project's branding (its theme, else its title and the defaults) onto
 *  the tour. Called by /tour for the project it opens, and by the studio for
 *  the project it edits, so Preview shows what visitors will. */
export function applyTheme(theme: ProjectTheme | undefined, fallbackBrand: string) {
  setUiConfig({
    brand: theme?.brand || fallbackBrand,
    accent: theme?.accent || '#b08d57',
    font: theme?.font || 'serif',
    logo: theme?.logo ? `${API_BASE_URL}/api/assets/${theme.logo}` : null
  });
}

export function useUiConfig() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
