/**
 * Step-by-step undo and redo in the scene editor (2026-09-28), next to the
 * version history's save points. After each change settles (0.4 s: a whole
 * gizmo drag is one step), a snapshot of what the studio edits in the open
 * space — hotspots, camera tracks, the model's placement, the start view,
 * Book now — goes on its undo stack. Undo puts the one before back into the
 * stores; nothing is saved until "Save space", as with any other edit.
 * Per space, up to 100 steps, for as long as the tab is open.
 */
import { bookingFor, docLoaded, hotspotsFor, sceneDocFor, setBookingOutright, setHotspots, subscribeDoc } from './sceneDoc';
import { loadTracks, subscribeViewpoints } from './viewpoints';
import { loadTransform, subscribeTransform, transformFor } from './transform';
import { setSessionSpawn, spawnFor, subscribeSpawn } from './scenes';
import type { Hotspot } from '../@types/hotspot.types';
import type { Booking, Track } from '../@types/scene.types';

interface Snap { hotspots: Hotspot[]; tracks: Track[]; transform: ReturnType<typeof transformFor>; spawn: ReturnType<typeof spawnFor>; booking: Booking | null }

const MAX = 100;
const past: Record<string, string[]> = {};
const future: Record<string, string[]> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());
export const subscribeHistory = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

const snapOf = (sceneId: string) => JSON.stringify({
  hotspots: hotspotsFor(sceneId), tracks: sceneDocFor(sceneId).tracks, transform: transformFor(sceneId),
  spawn: spawnFor(sceneId), booking: bookingFor(sceneId)
} satisfies Snap);

/** Note the space as it is now, if it changed. The first note, once its draft is read, is where undo stops. */
export function record(sceneId: string) {
  if (!docLoaded(sceneId)) return;
  const s = snapOf(sceneId);
  const stack = (past[sceneId] ??= []);
  if (stack[stack.length - 1] === s) return;
  stack.push(s);
  if (stack.length > MAX) stack.shift();
  future[sceneId] = [];
  emit();
}

function apply(sceneId: string, json: string) {
  const s = JSON.parse(json) as Snap;
  setHotspots(sceneId, s.hotspots);
  loadTracks(sceneId, s.tracks, { replace: true });
  loadTransform(sceneId, s.transform);
  setSessionSpawn(sceneId, s.spawn.spawn, s.spawn.yaw);
  setBookingOutright(sceneId, s.booking);
}

export const canUndo = (sceneId: string) => (past[sceneId]?.length ?? 0) > 1;
export const canRedo = (sceneId: string) => (future[sceneId]?.length ?? 0) > 0;

export function undo(sceneId: string) {
  record(sceneId); // a change still settling counts as a step
  if (!canUndo(sceneId)) return;
  (future[sceneId] ??= []).push(past[sceneId].pop()!);
  apply(sceneId, past[sceneId][past[sceneId].length - 1]);
  emit();
}

export function redo(sceneId: string) {
  if (!canRedo(sceneId)) return;
  const s = future[sceneId].pop()!;
  past[sceneId].push(s);
  apply(sceneId, s);
  emit();
}

/** Keep the open space's history: note each change once it settles; Ctrl/⌘+Z undo, Ctrl+Y or Ctrl/⌘+Shift+Z redo
 *  (typing in a box keeps the browser's own undo). Returns the cleanup. */
export function watchHistory(sceneId: string): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  const settle = () => { clearTimeout(t); t = setTimeout(() => record(sceneId), 400); };
  const offs = [subscribeDoc(settle), subscribeViewpoints(settle), subscribeTransform(settle), subscribeSpawn(settle)];
  settle();
  const keys = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(sceneId); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(sceneId); }
  };
  window.addEventListener('keydown', keys);
  return () => { clearTimeout(t); offs.forEach((off) => off()); window.removeEventListener('keydown', keys); };
}
