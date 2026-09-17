import { useSyncExternalStore } from 'react';
import type { UiConfig } from '../@types/config.types';

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
  listeners.forEach((fn) => fn());
}

export function useUiConfig() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
