import { useSyncExternalStore } from 'react';
import type { NavModeState, VisitorMode } from '../@types/config.types';

/**
 * Visitor navigation mode (CLAUDE.md §6.1): **viewpoints** (default — free
 * look, tap the dock to dolly between authored stops) vs **walk** (explicit
 * opt-in — WASD / joystick free-roam with collision). A space must always
 * OPEN in viewpoints; walk must never become the default by accident.
 *
 * Plain mutable module read every frame by useLccWalker.js — same pattern as
 * mobileInput.js / walkerConfig.js. `useNavMode()` is for the one place that
 * needs to re-render on a change (the Viewer's toggle button).
 */
export const navMode: NavModeState = {
  walkEnabled: false,
  flyEnabled: false,
  orbitEnabled: false
};

const listeners = new Set<() => void>();
let snap: NavModeState = { ...navMode };
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const getSnapshot = () => snap;

/** Viewpoints (default), walk, orbit (circle the room at eye level) or fly
 *  (circle it from up high). Exactly one is on. */
export function setVisitorMode(mode: VisitorMode) {
  navMode.walkEnabled = mode === 'walk';
  navMode.flyEnabled = mode === 'fly';
  navMode.orbitEnabled = mode === 'orbit';
  snap = { ...navMode };
  listeners.forEach((fn) => fn());
}

export function setWalkEnabled(on: boolean) {
  setVisitorMode(on ? 'walk' : 'viewpoints');
}

export const visitorMode = (s: NavModeState = navMode): VisitorMode =>
  s.flyEnabled ? 'fly' : s.orbitEnabled ? 'orbit' : s.walkEnabled ? 'walk' : 'viewpoints';

/** Reset to the default (viewpoints) — called on every scene switch so a new
 *  space never inherits "walk" from the space before it. */
export function resetNavMode() {
  setVisitorMode('viewpoints');
}

export function useNavMode() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
