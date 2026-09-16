/**
 * Scene document — the renderer-agnostic layer (CLAUDE.md: "the schema is the
 * actual IP"). For now this holds session-only hotspots; camera tracks still
 * live in viewpoints.js and spawn overrides in scenes.js. `exportSceneJSON()`
 * assembles them into the CLAUDE.md shape so a real backend can pick it up later.
 *
 * Session-only: nothing persists until exported and committed.
 */
import * as THREE from 'three';
import { spawnFor, SCENE_BY_ID } from './scenes';
import { liveViewpoints } from './viewpoints';
import type { Hotspot, HotspotPayload, HotspotType } from '../@types/hotspot.types';
import type { SceneDoc, SplatVariant, Track } from '../@types/scene.types';

const doc: Record<string, { hotspots: Hotspot[] }> = {};
const listeners = new Set<() => void>();
export const subscribeDoc = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach((f) => f());

let hsSeq = 0; // monotonic id source — never collides, even after a delete
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const _f = new THREE.Vector3();

export const hotspotsFor = (sceneId: string): Hotspot[] => doc[sceneId]?.hotspots ?? [];

const blankPayload = (type: HotspotType): HotspotPayload =>
  type === 'image' ? { url: '', caption: '' }
    : type === 'video' ? { url: '' }
      : type === 'link' ? { url: '', text: 'Open' }
        : type === 'portal' ? { sceneId: '' }
          : { text: '' };

/** Drop a hotspot ~2 units in front of the camera. */
export function addHotspot(sceneId: string, camera: THREE.Camera, type: HotspotType = 'text'): Hotspot {
  const p = camera.position;
  camera.getWorldDirection(_f);
  const hs: Hotspot = {
    id: `hs-${sceneId}-${(++hsSeq).toString(36)}`,
    type,
    position: [r3(p.x + _f.x * 2), r3(p.y + _f.y * 2), r3(p.z + _f.z * 2)],
    radius: 0.4,
    label: 'New hotspot',
    payload: blankPayload(type),
    occludedBy: 'none'
  };
  (doc[sceneId] ??= { hotspots: [] }).hotspots.push(hs);
  emit();
  return hs;
}

export function updateHotspot(sceneId: string, id: string, patch: Partial<Hotspot>) {
  const hs = doc[sceneId]?.hotspots.find((h) => h.id === id);
  if (!hs) return;
  if (patch.type && patch.type !== hs.type) hs.payload = blankPayload(patch.type);
  Object.assign(hs, patch);
  emit();
}

export function removeHotspot(sceneId: string, id: string) {
  const arr = doc[sceneId]?.hotspots;
  if (!arr) return;
  const i = arr.findIndex((h) => h.id === id);
  if (i >= 0) { arr.splice(i, 1); emit(); }
}

export function placeHotspotAtCamera(sceneId: string, id: string, camera: THREE.Camera) {
  const p = camera.position;
  camera.getWorldDirection(_f);
  updateHotspot(sceneId, id, {
    position: [r3(p.x + _f.x * 2), r3(p.y + _f.y * 2), r3(p.z + _f.z * 2)]
  });
}

/** Schema v2 (CLAUDE.md §5.2), as a plain object. Used both for the clipboard
 *  export below and for saving to the Node API (see lib/api.js) — the API
 *  takes this exact shape. No `viewpoints[]` graph yet (§7.3's capture UI is
 *  what would populate it) and no upload system yet, so `splat.variants`
 *  only ever has `high`, minted from the local asset convention — same
 *  bridge server/src/migrate.js uses for scenes read off disk. */
export function sceneDocFor(sceneId: string): SceneDoc {
  const conf = SCENE_BY_ID[sceneId];
  const { spawn, yaw } = spawnFor(sceneId);
  const tracks: Track[] = liveViewpoints(sceneId).map((v) => ({
    id: v.id,
    label: v.label,
    loop: false,
    autoplayOnLoad: false,
    keyframes: v.path.map((w, i) => ({
      t: i,
      position: w.pos,
      target: w.look,
      easing: 'easeInOutCubic'
    })),
    cues: [],
    audio: null
  }));
  return {
    id: sceneId,
    version: 2,
    propertyId: null,
    title: conf?.name ?? sceneId,
    splat: {
      format: 'lcc2',
      variants: { high: { assetId: `local:${sceneId}`, meta: 'meta.lcc2' } }
    },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    unitScale: Number.isFinite(conf?.unitScale) ? (conf!.unitScale as number) : 1,
    spawn: { position: spawn.map(r3) as [number, number, number], yaw: r3(yaw), eyeHeight: 1.65 },
    // Default is 'viewpoint' per CLAUDE.md §6.1 — never 'free' by accident.
    camera: { fov: 60, near: 0.25, far: 300, mode: 'viewpoint' },
    viewpoints: [],
    hotspots: hotspotsFor(sceneId),
    tracks,
    audio: null,
    cta: null,
    theme: null,
    neighbours: conf?.neighbours ?? [],
    status: 'draft'
  };
}

/** A brand-new space, fresh out of the studio's uploader (CLAUDE.md §7.1).
 *  No spawn, viewpoints, hotspots or tracks yet — those come from the normal
 *  editor flow once the space is open. Publish is blocked without a spawn
 *  (§7.5); "Drop to floor" + "Set as start view" are the first things to do. */
export function blankSceneDoc(
  id: string,
  title: string,
  variants: { high: SplatVariant; medium?: SplatVariant; low?: SplatVariant }
): SceneDoc {
  return {
    id,
    version: 2,
    propertyId: null,
    title,
    splat: { format: 'lcc2', variants },
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    unitScale: 1,
    spawn: { position: [0, 1.7, 3], yaw: 0, eyeHeight: 1.65 },
    camera: { fov: 60, near: 0.25, far: 300, mode: 'viewpoint' },
    viewpoints: [],
    hotspots: [],
    tracks: [],
    audio: null,
    cta: null,
    theme: null,
    neighbours: [],
    status: 'draft'
  };
}

/** Same document, copied to the clipboard and logged as text (the pre-backend
 *  workflow: paste it into the scene's seed file by hand). */
export function exportSceneJSON(sceneId: string): string {
  const text = JSON.stringify(sceneDocFor(sceneId), null, 2);
  navigator.clipboard?.writeText(text).catch(() => {});
  console.log(text);
  return text;
}
