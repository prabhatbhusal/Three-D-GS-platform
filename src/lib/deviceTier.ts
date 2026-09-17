/**
 * Three quality tiers — high / medium / low (CLAUDE.md §8). Resolved once per
 * session, before the SDK loads, because the tier decides which splat variant
 * gets fetched.
 *
 * There is no reliable device-capability API on the web — every signal below
 * is missing or lies on some browser. This is a GUESS, corrected by
 * MEASUREMENT (§8.1). Extends src/lib/lccConfig.js's tier profile table;
 * this file owns detection, persistence and the measured-downgrade — lccConfig
 * owns what each tier means to the SDK loader.
 */
import type { Tier, TierResolution } from '../@types/config.types';

export const TIER_ORDER: Tier[] = ['low', 'medium', 'high'];
const STORAGE_PREFIX = 'splatspace.tier.';
const FPS_FLOOR = 24; // median below this for 3s straight -> downgrade once
const FPS_WINDOW_MS = 5000;

/* ------------------------------------------------------------------ */
/* Rule 1: no WebGL2, no splat — constraint 5 (the CTA must still work) */
/* ------------------------------------------------------------------ */

let _webgl2: boolean | null = null;
export function hasWebGL2(): boolean {
  if (_webgl2 !== null) return _webgl2;
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    _webgl2 = !!gl;
  } catch {
    _webgl2 = false;
  }
  return _webgl2;
}

/* ------------------------------------------------------------------ */
/* A stable-ish per-device key, so the persisted tier survives reloads  */
/* without needing an account. Best-effort; a wrong key just means a    */
/* fresh guess, which is exactly the fallback behaviour anyway.         */
/* ------------------------------------------------------------------ */

function deviceKey(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? gl!.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
    return [
      navigator.userAgent,
      renderer,
      navigator.hardwareConcurrency,
      navigator.deviceMemory,
      window.devicePixelRatio
    ].join('|');
  } catch {
    return 'unknown';
  }
}

function hashKey(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* ------------------------------------------------------------------ */
/* Rule 9: overrides — URL wins, then a persisted manual choice          */
/* ------------------------------------------------------------------ */

const ALIASES: Record<string, Tier> = { 'desktop-high': 'high', 'desktop-low': 'medium', mobile: 'medium', minimal: 'low' };

function urlOverride(): Tier | null {
  try {
    const raw = new URLSearchParams(location.search).get('tier');
    if (!raw) return null;
    const t = ALIASES[raw] ?? raw;
    return TIER_ORDER.includes(t as Tier) ? (t as Tier) : null;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- parsed JSON of unknown prior shape
function readStorage(key: string): any {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / storage full — degrade to guess-every-load, harmless */
  }
}

/** A manual choice from the viewer's quality control. Wins over everything. */
export function setManualTier(tier: Tier) {
  if (!TIER_ORDER.includes(tier)) return;
  writeStorage(STORAGE_PREFIX + 'manual', tier);
}

export function clearManualTier() {
  try { localStorage.removeItem(STORAGE_PREFIX + 'manual'); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Rules 2-5, 8: the guess                                              */
/* ------------------------------------------------------------------ */

export function guessTier(): Tier {
  try {
    if (navigator.connection?.saveData) return 'low'; // rule 8
  } catch { /* no Network Information API */ }

  const coarse = (() => {
    try { return matchMedia('(pointer: coarse)').matches; } catch { return false; }
  })();
  const cores = navigator.hardwareConcurrency; // undefined on some browsers
  const mem = navigator.deviceMemory; // Chromium only; undefined elsewhere

  if (coarse && mem === undefined) return 'medium'; // rule 2: iOS gives us almost nothing
  if (coarse && (mem !== undefined && mem <= 4 || cores !== undefined && cores <= 6)) return 'low'; // rule 3
  if (!coarse && (mem ?? 0) >= 8 && (cores ?? 0) >= 8) return 'high'; // rule 4
  return 'medium'; // rule 5: default when unsure
}

/* ------------------------------------------------------------------ */
/* Resolve once per load: manual > persisted-measured > URL > guess     */
/* ------------------------------------------------------------------ */

export function resolveInitialTier(): TierResolution {
  // --- MAX-GRAPHICS OVERRIDE (temporary, requested 2026-09-17) ---
  // Forces every session to `high`, skipping detection entirely — no low/medium
  // tier ever gets resolved while this is active. This deliberately breaks
  // CLAUDE.md §3's "5s TTFF on the low tier" budget for any visitor on a real
  // low-end device; it's meant for local preview only, not for a deployed tour.
  // To revert: delete this early return and uncomment the block below.
  return { tier: 'high', guessed: 'high', source: 'manual' };

  /*
  if (!hasWebGL2()) return { tier: 'low', guessed: 'low', source: 'no-webgl2' };

  const manual = readStorage(STORAGE_PREFIX + 'manual');
  if (manual && TIER_ORDER.includes(manual)) return { tier: manual, guessed: manual, source: 'manual' };

  const fromUrl = urlOverride();
  if (fromUrl) return { tier: fromUrl, guessed: fromUrl, source: 'url' };

  const key = STORAGE_PREFIX + hashKey(deviceKey());
  const persisted = readStorage(key);
  const guessed = guessTier();
  if (persisted?.tier && TIER_ORDER.includes(persisted.tier)) {
    return { tier: persisted.tier, guessed, source: 'measured', deviceStorageKey: key };
  }
  return { tier: guessed, guessed, source: 'guess', deviceStorageKey: key };
  */
}

export function persistMeasuredTier(deviceStorageKey: string | undefined, tier: Tier) {
  if (!deviceStorageKey) return;
  writeStorage(deviceStorageKey, { tier, at: Date.now() });
}

/* ------------------------------------------------------------------ */
/* Rule 6: verify by measurement — a rolling median FPS, one downgrade  */
/* ------------------------------------------------------------------ */

/**
 * Call `.sample(dtSeconds)` once per rendered frame after the scene is ready.
 * Fires `onDowngrade(nextTier)` at most once per session if the median frame
 * rate over a 5s window stays below FPS_FLOOR for 3 such windows running —
 * never auto-upgrades (oscillating tiers reads as a bug to a visitor).
 */
export function createFpsMonitor({ tier, onDowngrade }: { tier: Tier; onDowngrade: (next: Tier, medianFps: number) => void }) {
  let samples: number[] = [];
  let windowStart = performance.now();
  let badWindows = 0;
  let done = false;

  return {
    sample(dt: number) {
      if (done || tier === 'low') return; // nothing lower to fall back to
      if (dt > 0) samples.push(1 / dt);
      const now = performance.now();
      if (now - windowStart < FPS_WINDOW_MS) return;

      const sorted = samples.slice().sort((a, b) => a - b);
      const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 60;
      samples = [];
      windowStart = now;

      if (median < FPS_FLOOR) {
        badWindows++;
        if (badWindows >= 3) {
          done = true;
          const i = TIER_ORDER.indexOf(tier);
          const next = TIER_ORDER[Math.max(0, i - 1)];
          onDowngrade(next, median);
        }
      } else {
        badWindows = 0;
      }
    }
  };
}

/* ------------------------------------------------------------------ */
/* One log line per load — every quality bug report starts here         */
/* ------------------------------------------------------------------ */

export function logTierLine(
  { tier, guessed, downgraded, variant, bytes }:
  { tier: Tier; guessed: Tier; downgraded?: boolean; variant?: string; bytes?: number }
) {
  const guessNote = downgraded
    ? ` (guessed: ${guessed}, downgraded: fps)`
    : tier !== guessed ? ` (guessed: ${guessed})` : '';
  const bytesNote = typeof bytes === 'number' ? ` bytes=${(bytes / 1e6).toFixed(1)}MB` : '';
  console.log(`[tier] tier=${tier}${guessNote} variant=${variant ?? tier}${bytesNote}`);
}
