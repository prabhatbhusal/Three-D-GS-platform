/** A hotel scene entry from lib/scenes.js (CLAUDE.md §5.2's pre-schema shape). */
export interface Scene {
  id: string;
  name: string;
  tagline?: string;
  spawn: [number, number, number];
  yaw: number;
  outdoor?: boolean;
  /** World units per metre. Explicit when the scan's bbox can't be trusted (§14). */
  unitScale?: number;
  /** Override for META_FILE, per-scene. */
  meta?: string;
  /** High-variant asset id (CLAUDE.md §2, §9) — when set, metaPath() resolves
   *  through /api/assets/<id>/... instead of the legacy public/assets/rooms/
   *  convention. Unset for the two hand-authored demo scenes. */
  assetId?: string;
  neighbours?: string[];
}

export interface SpawnState {
  spawn: [number, number, number];
  yaw: number;
}

/** Shape returned by GET /api/scenes, used to patch the static SCENES list. */
export interface ApiScene {
  id: string;
  title?: string;
  tagline?: string;
  spawn?: { position?: number[]; yaw?: number };
  outdoor?: boolean;
  unitScale?: number;
  assetId?: string;
  meta?: string;
  neighbours?: string[];
}

/** Scene document schema v2 (CLAUDE.md §5.2) as produced by sceneDoc.js today —
 *  a subset: no upload system yet, so `splat.variants` only ever has `high`. */
export interface TrackKeyframe {
  t: number;
  position: number[];
  target: number[];
  easing: string;
}

export interface Track {
  id: string;
  label: string;
  loop: boolean;
  autoplayOnLoad: boolean;
  keyframes: TrackKeyframe[];
  cues: unknown[];
  audio: null;
}

export interface SplatVariant {
  assetId: string;
  meta: string;
}

export interface SceneDoc {
  id: string;
  version: 2;
  propertyId: string | null;
  title: string;
  splat: {
    format: 'lcc2';
    // high is mandatory (CLAUDE.md §7.5 won't publish without it); medium/low
    // fall back upward when absent (§8.2).
    variants: { high: SplatVariant; medium?: SplatVariant; low?: SplatVariant };
  };
  transform: { position: [number, number, number]; rotation: [number, number, number]; scale: number };
  unitScale: number;
  spawn: { position: [number, number, number]; yaw: number; eyeHeight: number };
  camera: { fov: number; near: number; far: number; mode: 'viewpoint' };
  viewpoints: unknown[];
  hotspots: import('./hotspot.types').Hotspot[];
  tracks: Track[];
  audio: null;
  cta: null;
  theme: null;
  neighbours: string[];
  status: 'draft' | 'published';
}
