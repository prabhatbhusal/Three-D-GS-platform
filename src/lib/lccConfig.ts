/**
 * LCC load configuration.
 *
 * ALIGNED WITH THE SDK's OWN EXAMPLE (the Three.js sample in the XGRIDS LCC Web
 * SDK download). It passes only the documented options:
 *
 *   camera, scene, canvas, renderer, renderLib, dataPath, modelMatrix, appKey,
 *   useEnv, useIndexDB, useLoadingEffect
 *
 * Earlier revisions of this file also set gpuAcceleration, writeDepth,
 * useOcclusionCulling, maxGpuCacheSize/maxHostCacheSize, maxConcurrentDownloads,
 * workerPerFrameRequests, useEPSG, useDefaultRenderLoop, enableLoadingLog and
 * useLccPerf. None of those appear in the SDK docs or the example, several
 * override an SDK default of `false` (gpuAcceleration in particular), and the
 * SDK bundle is pinned to Three r164 — so the safe baseline is to send exactly
 * what the vendor sends and let every other option take its built-in default.
 * Re-introduce a flag only after A/B-testing it on your own scans.
 */

/* ------------------------------------------------------------------ */
/* Three quality tiers (CLAUDE.md §8) — detection lives in              */
/* src/lib/deviceTier.js (guess + measured downgrade + persistence);    */
/* this table is what each tier means to the SDK loader and the Canvas. */
/* ------------------------------------------------------------------ */

import type * as THREE from 'three';
import { resolveInitialTier } from './deviceTier';
import type { Tier, TierProfileEntry, TierResolution } from '../@types/config.types';

/**
 * `useEnv` is documented (environment.bin is a whole extra stream) and worth
 * turning off on weak / metered devices. `farPlane` is only a pre-load hint;
 * useSceneManager sets the real near/far from the measured scan afterwards.
 * `dpr` caps the Canvas's device-pixel-ratio — the single biggest fill-rate
 * lever on fill-heavy splats (CLAUDE.md §8 table).
 */
const TIERS: Record<Tier, TierProfileEntry> = {
  low:    { useEnv: false, farPlane: 120, dpr: 1 },
  medium: { useEnv: true,  farPlane: 210, dpr: 1.25 },
  high:   { useEnv: true,  farPlane: 350, dpr: 1.5 }
};

/** Cached for the session — resolved once, not re-guessed per call. */
let _resolved: TierResolution | null = null;
export function detectTier(): Tier {
  if (!_resolved) _resolved = resolveInitialTier();
  return _resolved.tier;
}

/** The full resolution (tier + what was guessed + why), for the one log line
 *  useSceneManager prints on load (CLAUDE.md §8.1: "every quality bug report
 *  starts with that line"). */
export function resolveTier(): TierResolution {
  if (!_resolved) _resolved = resolveInitialTier();
  return _resolved;
}

export const tierProfile = (tier: Tier = detectTier()) => TIERS[tier] ?? TIERS.medium;

/* ------------------------------------------------------------------ */
/* The config builder — documented options only                       */
/* ------------------------------------------------------------------ */

interface LoadOptionsInput {
  camera: THREE.Camera;
  scene: THREE.Scene;
  renderer: unknown;
  canvas: HTMLCanvasElement;
  THREE: typeof THREE;
  dataPath: string;
  modelMatrix: THREE.Matrix4;
  appKey?: string | null;
  visible?: boolean;
  tier?: Tier;
}

export function buildLoadOptions({
  camera,
  scene,
  renderer,
  canvas,
  THREE,
  dataPath,
  modelMatrix,
  appKey,
  visible = true,
  tier = detectTier()
}: LoadOptionsInput) {
  const p = TIERS[tier] ?? TIERS.medium;

  return {
    // required
    camera,
    scene,
    canvas,
    renderer,
    renderLib: THREE,
    dataPath,
    modelMatrix,

    // documented
    appKey,                    // absent -> SDK logs "No appKey provided"; still runs
    useIndexDB: true,          // persist tiles across sessions
    useEnv: p.useEnv,          // environment.bin stream
    useLoadingEffect: visible  // only for the scene the visitor is waiting on
  };
}

/* ------------------------------------------------------------------ */
/* Camera pre-load hint                                               */
/* ------------------------------------------------------------------ */

/**
 * Called before a scene loads so the first (streaming) frames aren't wildly
 * off. useSceneManager overrides `far` from the measured scan on `ready`, and
 * the walker enforces `near`/`far` from walkerConfig every frame — so this only
 * sets a sane pre-load `far` and re-asserts the 60° walking fov (the SDK's own
 * example uses 45° / near 1 / far 150000).
 */
export function tuneCameraForRoom(
  camera: THREE.PerspectiveCamera,
  { outdoor = false, tier = detectTier() }: { outdoor?: boolean; tier?: Tier } = {}
) {
  const p = TIERS[tier] ?? TIERS.medium;
  camera.fov = 60;
  camera.far = outdoor ? p.farPlane * 4 : p.farPlane;
  camera.updateProjectionMatrix();
}
