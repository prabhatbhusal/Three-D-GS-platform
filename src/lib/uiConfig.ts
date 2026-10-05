import { useSyncExternalStore } from 'react';
import type { BrandFont, ProjectTheme, UiConfig } from '../@types/config.types';
import { API_BASE_URL } from './api';
import { inkOn } from './brandColor';

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
    const root = document.documentElement.style, ink = inkOn(patch.accent);
    root.setProperty('--gold', patch.accent);
    // text on it: black or white, whichever reads (a navy brand gets white)
    root.setProperty('--gold-ink', ink);
    // on a light card (the tour's booking sheet) a pale accent wouldn't show:
    // there it is the accent when that is dark, else its dark ink (viewer.css .vw-sheet)
    const pale = ink !== '#ffffff';
    root.setProperty('--gold-on-light', pale ? ink : patch.accent);
    root.setProperty('--gold-on-light-ink', pale ? '#ffffff' : ink);
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
export function applyTheme(theme: ProjectTheme | undefined, fallbackBrand: string, whatsapp: string | null = null) {
  setUiConfig({
    whatsapp,
    brand: theme?.brand || fallbackBrand,
    // without its own colour, a tour is monochrome like the site (2026-10-05; it was gold)
    accent: theme?.accent || '#ededed',
    font: theme?.font || 'serif',
    logo: theme?.logo ? `${API_BASE_URL}/api/assets/${theme.logo}` : null
  });
  // without its own heading face, the tour's titles are in JetBrains Mono, the site's one typeface
  if (!theme?.font) document.documentElement.style.setProperty('--serif', 'var(--font-ui), ui-monospace, monospace');
}

export function useUiConfig() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
