/**
 * Scene document — the renderer-agnostic layer (CLAUDE.md: "the schema is the
 * actual IP"). Holds hotspots; camera tracks live in viewpoints.ts and spawn
 * overrides in scenes.ts.
 *
 * Round trip: loadSceneDoc() reads the saved document from the API and feeds
 * its tracks and hotspots into the stores; sceneDocFor() writes the edits back
 * ON TOP of that saved document, so fields the studio doesn't edit (uploaded
 * splat variants, transform, status…) survive a save untouched.
 */
import * as THREE from 'three';
import { spawnFor, SCENE_BY_ID } from './scenes';
import { getScene, getPublishedScene } from './api';
import { liveViewpoints, loadTracks } from './viewpoints';
import { transformFor, loadTransform } from './transform';
import type { Hotspot, HotspotPayload, HotspotType } from '../@types/hotspot.types';
import type { SceneDoc, SplatVariant, Track } from '../@types/scene.types';

const doc: Record<string, { hotspots: Hotspot[] }> = {};
const listeners = new Set<() => void>();
export const subscribeDoc = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach((f) => f());

let hsSeq = 0; // with the timestamp in the id, never collides with saved ids after a reload
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
    id: `hs-${sceneId}-${Date.now().toString(36)}${(++hsSeq).toString(36)}`,
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

/* ------------------------------------------------------------------ */
/* Load / save bookkeeping                                            */
/* ------------------------------------------------------------------ */

type SavedDoc = SceneDoc & Record<string, unknown>;
const serverDocs: Record<string, SavedDoc> = {};
const savedJson: Record<string, string> = {}; // what the server holds, to spot unsaved edits
const loading: Record<string, Promise<SceneDoc | null>> = {};

/**
 * Fetch a scene's document once and adopt its tracks, hotspots and
 * placement. The studio reads the DRAFT; the public tour reads the PUBLISHED
 * copy, so editing never changes what visitors see (§3.6, §7.5).
 *
 * Resolves null when there's no document or no API — the scene then runs on
 * the hand-written defaults. `force` re-reads and replaces local state (used
 * after "Revert to published").
 */
export function loadSceneDoc(
  sceneId: string,
  source: 'draft' | 'published' = 'draft',
  { force = false }: { force?: boolean } = {}
): Promise<SceneDoc | null> {
  const key = `${source}:${sceneId}`;
  if (force) delete loading[key];
  return (loading[key] ??= (source === 'draft' ? getScene(sceneId) : getPublishedScene(sceneId))
    .then((saved) => {
      if (!saved) return null;
      loadTracks(sceneId, saved.tracks ?? [], { replace: force });
      loadTransform(sceneId, saved.transform);
      const ids = new Set((saved.hotspots ?? []).map((h) => h.id));
      const localOnly = force ? [] : hotspotsFor(sceneId).filter((h) => !ids.has(h.id));
      doc[sceneId] = { hotspots: [...(saved.hotspots ?? []), ...localOnly] };
      if (source === 'draft') {
        serverDocs[sceneId] = saved as SavedDoc;
        savedJson[sceneId] = JSON.stringify(sceneDocFor(sceneId));
      }
      emit();
      return saved;
    })
    .catch(() => {
      delete loading[key]; // retry on the next call, once the API is back
      return null;
    }));
}

/** Call after a successful save, with the exact doc that was sent. */
export function markSaved(sceneId: string, sent: SceneDoc) {
  serverDocs[sceneId] = sent as SavedDoc;
  savedJson[sceneId] = JSON.stringify(sent);
  emit();
}

/** True when the studio holds edits the server doesn't have yet. A scene
 *  that was never loaded counts as unsaved. */
export const hasUnsavedChanges = (sceneId: string) =>
  savedJson[sceneId] !== JSON.stringify(sceneDocFor(sceneId));

/** Schema v2 (CLAUDE.md §5.2). The studio's edits — title, start view,
 *  hotspots, tracks — laid over the saved document, so everything it doesn't
 *  edit is kept as-is.
 *
 *  Never mint `splat` here. This used to write `local:<id>` unconditionally,
 *  which overwrote an uploaded scene's real asset id on its first save and
 *  left it pointing at nothing. */
export function sceneDocFor(sceneId: string): SceneDoc {
  const conf = SCENE_BY_ID[sceneId];
  const saved = serverDocs[sceneId];
  const { spawn, yaw } = spawnFor(sceneId);
  const tracks: Track[] = liveViewpoints(sceneId).map((v) => {
    const last = Math.max(1, v.path.length - 1);
    return {
      id: v.id,
      label: v.label,
      loop: false,
      autoplayOnLoad: false,
      keyframes: v.path.map((w, i) => ({
        t: r3((i / last) * v.seconds), // §5.2: keyframe time in seconds
        position: w.pos,
        target: w.look,
        easing: 'easeInOutCubic'
      })),
      cues: [],
      audio: null,
      seconds: v.seconds,
      thumb: v.thumb ?? null
    };
  });
  const splat = saved?.splat ?? {
    format: 'lcc2' as const,
    variants: {
      high: conf?.assetId
        ? { assetId: conf.assetId, meta: conf.meta ?? 'meta.lcc2' }
        : { assetId: `local:${sceneId}`, meta: 'meta.lcc2' }
    }
  };
  // The saved doc if there is one; defaults for a scene never saved.
  const base = saved ?? {
    propertyId: null,
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 },
    unitScale: Number.isFinite(conf?.unitScale) ? (conf!.unitScale as number) : 1,
    // Default is 'viewpoint' per CLAUDE.md §6.1 — never 'free' by accident.
    camera: { fov: 60, near: 0.25, far: 300, mode: 'viewpoint' as const },
    viewpoints: [],
    audio: null,
    cta: null,
    theme: null,
    neighbours: conf?.neighbours ?? [],
    status: 'draft' as const
  };
  return {
    ...base,
    id: sceneId,
    version: 2,
    title: conf?.name ?? saved?.title ?? sceneId,
    splat,
    transform: transformFor(sceneId),
    spawn: {
      ...(saved?.spawn ?? { eyeHeight: 1.65 }),
      position: spawn.map(r3) as [number, number, number],
      yaw: r3(yaw)
    },
    hotspots: hotspotsFor(sceneId),
    tracks
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
