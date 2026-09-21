import { useSyncExternalStore } from 'react';

/**
 * Tour audio (CLAUDE.md §6.3). One AudioContext for the page, Web Audio API
 * only, no library. Today there is one layer — hotspot clips — behind one
 * gain node that is also the mute switch. Ambient and track music/narration
 * join as their own gain nodes when they are built.
 *
 * The rules this enforces:
 * - Starts muted, and muting is remembered per visitor (localStorage).
 * - The context is created and resumed only inside a tap — never on load.
 * - Clips are fetched when a hotspot opens, so never before the first frame.
 * - Everything pauses while the tab is hidden.
 */

const MUTE_KEY = 'threedview.muted';

export interface SoundState {
  muted: boolean;
  /** URL of the clip playing now. */
  playing: string | null;
  /** URL of the clip being fetched/decoded. */
  loading: string | null;
  error: string | null;
}

const readMuted = () => {
  try { return localStorage.getItem(MUTE_KEY) !== '0'; } catch { return true; }
};

let state: SoundState = { muted: readMuted(), playing: null, loading: null, error: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<SoundState>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
};

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let source: AudioBufferSourceNode | null = null;
const buffers = new Map<string, Promise<AudioBuffer>>();

function onVisibility() {
  if (!ctx) return;
  if (document.hidden) ctx.suspend().catch(() => {});
  else ctx.resume().catch(() => {});
}

/**
 * Call synchronously inside a tap handler — the enter gate, a Listen button,
 * the sound toggle. iOS Safari only resumes a context from inside the gesture
 * itself, so nothing may be awaited before this (§18 "No sound").
 */
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = state.muted ? 0 : 1;
    out.connect(ctx.destination);
    document.addEventListener('visibilitychange', onVisibility);
  }
  if (ctx.state === 'suspended' && !document.hidden) ctx.resume().catch(() => {});
}

export function setMuted(muted: boolean) {
  try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* private mode: session-only */ }
  if (!muted) unlockAudio();
  if (ctx && out) out.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.04);
  set({ muted });
}

export function stopClip() {
  if (source) {
    source.onended = null;
    try { source.stop(); } catch { /* never started */ }
    source.disconnect();
    source = null;
  }
  if (state.playing || state.loading) set({ playing: null, loading: null });
}

/** Plays one clip, stopping whatever was playing. Decoded clips are cached,
 *  so reopening a hotspot doesn't fetch it again. */
export async function playClip(url: string) {
  unlockAudio(); // first, while we're still inside the tap
  stopClip();
  if (!ctx || !out) {
    set({ error: 'This browser can’t play audio. The transcript has the same words.' });
    return;
  }
  const c = ctx;
  set({ loading: url, error: null });
  let pending = buffers.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.arrayBuffer();
      })
      .then((b) => c.decodeAudioData(b));
    buffers.set(url, pending);
    pending.catch(() => buffers.delete(url)); // retry on the next open
  }
  try {
    const buf = await pending;
    if (state.loading !== url) return; // stopped, or another clip started, while this loaded
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(out);
    src.onended = () => {
      if (source !== src) return;
      source = null;
      set({ playing: null });
    };
    source = src;
    src.start();
    set({ playing: url, loading: null });
  } catch {
    if (state.loading === url) set({ loading: null, error: 'The audio didn’t load. Check your connection and try again.' });
  }
}

const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const snapshot = () => state;

export const useSound = () => useSyncExternalStore(subscribe, snapshot, snapshot);
