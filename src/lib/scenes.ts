/**
 * Hotel scenes.
 *
 * Two independent Gaussian-splat scans, each in its own folder under
 * `public/assets/rooms/<id>/` and containing a `meta.lcc2`. They do NOT share a
 * coordinate frame — each was scanned separately — so there is no "walk from one
 * into the other". The visitor picks a scene from the top menu and the manager
 * unloads whichever scene was loaded before.
 *
 * To add a scene: drop its folder in `public/assets/rooms/`, add an entry here,
 * and (optionally) author viewpoints for it in `viewpoints.js`.
 */
import type { ApiScene, Scene, SpawnState } from '../@types/scene.types';
import { assetUrl } from './api';

// Vite exposed this as import.meta.env.BASE_URL; Next has no built-in
// equivalent, so a sub-path deploy sets NEXT_PUBLIC_BASE_PATH and
// next.config.js's `basePath` from the same value.
const base = (process.env.NEXT_PUBLIC_BASE_PATH || '/').replace(/\/$/, '');
export const ASSET_ROOT = base ? `${base}/assets/rooms` : '/assets/rooms';

/** Filename inside each scene folder. LCC2 detection in the SDK is purely
 *  extension-based — it MUST end in `.lcc2` or you silently get the old code
 *  path. Override per-scene with `meta:` if an export used a different name. */
export const META_FILE = 'meta.lcc2';

export const SCENES: Scene[] = [
  {
    id: 'bar-restro',
    name: 'Bar & Restaurant',
    tagline: 'Ground floor · all-day dining',
    /** Where a cold visitor spawns before any viewpoint is played. World-space,
     *  Y-up (the model matrix in useSceneManager fixes LCC Z-up). Tune with the
     *  in-app recorder: walk somewhere sensible and press P. */
    spawn: [-3.08, 2.42, -0.92],
    yaw: 0,
    outdoor: false,
    /** World units per metre. This scan is metric; the value is pinned
     *  explicitly because its meta bbox is inflated by stray splats
     *  (~58-unit diagonal) and any bbox-based guess would be unreliable. */
    unitScale: 1
  },
  {
    id: 'veterinary-lab',
    name: 'Spa & Treatment Room',
    tagline: 'Wellness floor',
    spawn: [0, 1.7, 3],
    yaw: 0,
    outdoor: false
    // no unitScale -> auto-measured; set one here if it spawns you in the ceiling
  }
];

export const DEFAULT_SCENE = SCENES[0].id;
export const DEFAULT_SPAWN: [number, number, number] = [0, 1.7, 3];

export const SCENE_BY_ID: Record<string, Scene> = Object.fromEntries(SCENES.map((s) => [s.id, s]));

/* --- the public tour's limits, set by /tour before the 3D mounts --- */
let startScene: string | null = null;
let tourIds: Set<string> | null = null;
/* --- the studio's property, set by /studio/<property> before the 3D mounts --- */
let propertyScope: string | null = null;

/** Visitors may only open published spaces (§7.5); `start` is the one to
 *  load first, so the renderer never begins streaming anything else. */
export function limitTour(ids: string[], start: string) {
  tourIds = new Set(ids);
  startScene = start;
}
export const firstScene = () => startScene ?? DEFAULT_SCENE;
/** True on the public tour — its documents come from the published copy. */
export const isPublicTour = () => tourIds !== null;
export const visibleScenes = () =>
  SCENES.filter((s) => (!tourIds || tourIds.has(s.id)) && (!propertyScope || s.propertyId === propertyScope));

/** The studio works inside one client's property: only its spaces are listed,
 *  and the first of them is what the renderer loads. Returns false when the
 *  property has no spaces yet, so the page can offer an upload instead of
 *  opening some other client's model. */
export function scopeToProperty(propertyId: string): boolean {
  propertyScope = propertyId;
  const first = visibleScenes()[0];
  startScene = first?.id ?? null;
  return !!first;
}

/**
 * Rename a scene's display title.
 *
 * The `id` is deliberately left alone. It addresses the asset, the property's
 * `spaces[].sceneId`, other scenes' `neighbours` and any URL already handed to
 * a client (CLAUDE.md §2) — a rename must never move it. Only the label the
 * studio and the tour show changes.
 *
 * Persisting is the caller's job: `sceneDocFor()` reads `title` straight off
 * this object, so `saveScene(id, sceneDocFor(id))` writes it, and
 * `hydrateScenes()` reads it back on the next load.
 *
 * Returns false when there was nothing to do, so the caller can skip the save.
 */
export function renameScene(sceneId: string, name: string): boolean {
  const s = SCENE_BY_ID[sceneId];
  const next = name.trim();
  if (!s || !next || next === s.name) return false;
  s.name = next;
  return true;
}

/* --- session spawn overrides, set from the editor panel --- */
const sessionSpawn: Record<string, SpawnState> = {};

export function setSessionSpawn(sceneId: string, spawn: [number, number, number], yaw = 0): SpawnState {
  sessionSpawn[sceneId] = {
    spawn: spawn.map((n) => Math.round(n * 100) / 100) as [number, number, number],
    yaw: Math.round(yaw * 100) / 100
  };
  console.log(
    `%c[scene] spawn for "${sceneId}" — paste into scenes.ts:`,
    'color:#2f6f4f;font-weight:bold',
    `\n  spawn: [${sessionSpawn[sceneId].spawn.join(', ')}], yaw: ${sessionSpawn[sceneId].yaw},`
  );
  return sessionSpawn[sceneId];
}

/** The spawn to actually use: session override if set, else the authored one. */
export function spawnFor(sceneId: string): SpawnState {
  const o = sessionSpawn[sceneId];
  const s = SCENE_BY_ID[sceneId];
  return { spawn: o?.spawn ?? s?.spawn ?? DEFAULT_SPAWN, yaw: o?.yaw ?? s?.yaw ?? 0 };
}

/**
 * Must return an ABSOLUTE url. The SDK does `new URL(dataPath)` with no base to
 * sniff the extension, and `new URL('/assets/...')` throws — which surfaces as a
 * crash deep inside the LCCRender constructor, not a path error.
 *
 * Two addressing modes: a scene with a real `assetId` (anything uploaded
 * through the studio, CLAUDE.md §7.1) resolves through /api/assets/ — the
 * actual seam §9 describes. The two hand-authored demo scenes carry the
 * `local:<id>` placeholder migrate.js's v1→v2 bridge mints (never a real
 * asset — nothing is stored under it), so that prefix always falls back to
 * the legacy public/assets/rooms/ convention (§16) instead.
 */
export function metaPath(sceneId: string): string {
  const s = SCENE_BY_ID[sceneId];
  if (!s) throw new Error(`[scenes] unknown scene "${sceneId}"`);
  const meta = s.meta ?? META_FILE;
  if (s.assetId && !s.assetId.startsWith('local:')) {
    return new URL(assetUrl(s.assetId, meta), location.origin).href;
  }
  return new URL(`${ASSET_ROOT}/${sceneId}/${meta}`, location.origin).href;
}

/**
 * Overrides the list above with whatever the Node API (lib/api.js) reports,
 * once it answers, AND adds any scene the API knows about that this static
 * list doesn't — a space created through the studio's uploader (§7.1) has no
 * hand-authored entry here, only what the API returns. Called best-effort
 * from App.jsx; if it's never called (API down, offline dev), the
 * hand-authored values above keep working exactly as before.
 */
export function hydrateScenes(apiScenes: ApiScene[] | null | undefined) {
  if (!Array.isArray(apiScenes)) return;
  for (const s of apiScenes) {
    let existing = SCENE_BY_ID[s.id];
    if (!existing) {
      existing = { id: s.id, name: s.title ?? s.id, spawn: DEFAULT_SPAWN, yaw: 0 };
      SCENES.push(existing);
      SCENE_BY_ID[s.id] = existing;
    }
    if (s.title) existing.name = s.title;
    if (s.tagline) existing.tagline = s.tagline;
    if (Array.isArray(s.spawn?.position)) existing.spawn = s.spawn.position as [number, number, number];
    if (typeof s.spawn?.yaw === 'number') existing.yaw = s.spawn.yaw;
    if (typeof s.outdoor === 'boolean') existing.outdoor = s.outdoor;
    if (typeof s.unitScale === 'number') existing.unitScale = s.unitScale;
    // "local:<id>" is migrate.js's pre-upload placeholder, never a real asset
    // — and `meta` only means "relPath inside the asset" alongside a real one.
    // (Some legacy seed docs store a full `assets/rooms/<id>/meta.lcc2` path
    // in `splat.meta`, which only makes sense for the OTHER addressing mode.)
    if (typeof s.assetId === 'string' && !s.assetId.startsWith('local:')) {
      existing.assetId = s.assetId;
      if (typeof s.meta === 'string') existing.meta = s.meta;
    }
    if (Array.isArray(s.neighbours)) existing.neighbours = s.neighbours;
    if (s.propertyId !== undefined) existing.propertyId = s.propertyId;
  }
}
