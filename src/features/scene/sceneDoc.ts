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
import { getScene, getPublishedScene } from '../../lib/api';
import { liveViewpoints, loadTracks } from './viewpoints';
import { transformFor, loadTransform } from './transform';
import { walkerCfg } from './walkerConfig';
import { surfaceDistance, boxSpotInView } from './collision';
import type { Hotspot, HotspotPayload, HotspotType } from '../../@types/hotspot.types';
import type { Booking, Collider, ModelFormat, SceneDoc, SplatVariant, Track } from '../../@types/scene.types';

const doc: Record<string, { hotspots: Hotspot[] }> = {};
/** Book now per space (§7.6). Loaded with the doc, so the public tour reads
 *  the published copy's button and the studio the draft's. */
const booking: Record<string, Booking | null> = {};
const listeners = new Set<() => void>();
export const subscribeDoc = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach((f) => f());

let hsSeq = 0; // with the timestamp in the id, never collides with saved ids after a reload
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const _f = new THREE.Vector3();

export const hotspotsFor = (sceneId: string): Hotspot[] => doc[sceneId]?.hotspots ?? [];

export const bookingFor = (sceneId: string): Booking | null => booking[sceneId] ?? null;

export function setBooking(sceneId: string, patch: Partial<Booking>) {
  booking[sceneId] = { enabled: false, label: 'Book now', url: '', ...booking[sceneId], ...patch };
  emit();
}

/** True when any hotspot in the space carries audio — the sound toggle only
 *  shows then (§6.3). */
export const sceneHasAudio = (sceneId: string) =>
  hotspotsFor(sceneId).some((h) => !!h.payload?.audio) || liveViewpoints(sceneId).some((v) => !!v.audio);

const blankPayload = (type: HotspotType): HotspotPayload =>
  type === 'image' ? { url: '', caption: '' }
    : type === 'video' ? { url: '' }
      : type === 'link' ? { url: '', text: 'Open' }
        : type === 'portal' ? { sceneId: '' }
          : type === 'audio' ? { transcript: '' }
            : type === 'table' ? { tableId: '', text: '', capacity: 4 }
            : type === 'room' ? { roomId: '', text: '' }
            : type === 'hall' ? { hallId: '', text: '' }
            : { text: '' };

/**
 * Where a hotspot goes: on whatever the middle of the view rests on (a
 * wall, the bar, a painting), just in front of it, so it stays on that
 * thing as you walk around it. Placed in mid-air it floats in front of the
 * room and seems to slide about as the camera moves. Nothing in view
 * (outdoors, a 360 video, no scene renderer): 2 units ahead, as before.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor SDK renderer handle
function spotInView(camera: THREE.Camera, renderer: any): [number, number, number] {
  const u = walkerCfg.unitScale || 1;
  const p = camera.position;
  camera.getWorldDirection(_f);
  const d = renderer ? surfaceDistance(renderer, p, _f, 30 * u, 0.04 * u) : null;
  const k = d === null ? 2 : Math.max(0.2 * u, d - 0.05 * u);
  return [r3(p.x + _f.x * k), r3(p.y + _f.y * k), r3(p.z + _f.z * k)];
}

/** A new hotspot, on what the middle of the view rests on (spotInView). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor SDK renderer handle
export function addHotspot(sceneId: string, camera: THREE.Camera, type: HotspotType = 'text', renderer: any = null): Hotspot {
  const hs: Hotspot = {
    id: `hs-${sceneId}-${Date.now().toString(36)}${(++hsSeq).toString(36)}`,
    type,
    position: spotInView(camera, renderer),
    radius: 0.4,
    // a dining room has many tables: each new one is numbered
    label: type === 'table' ? `Table ${(doc[sceneId]?.hotspots.filter((h) => h.type === 'table').length ?? 0) + 1}` : 'New hotspot',
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
  // A new type gets a fresh payload, but the audio and its transcript are the
  // same whichever kind of card they sit on.
  if (patch.type && patch.type !== hs.type) {
    const { audio, transcript } = hs.payload ?? {};
    hs.payload = { ...blankPayload(patch.type), ...(audio ? { audio, transcript } : {}) };
  }
  Object.assign(hs, patch);
  emit();
}

export function removeHotspot(sceneId: string, id: string) {
  const arr = doc[sceneId]?.hotspots;
  if (!arr) return;
  const i = arr.findIndex((h) => h.id === id);
  if (i >= 0) { arr.splice(i, 1); emit(); }
}

/** A space's hotspots and Book now, set outright: undo/redo (history.ts) and
 *  copying hotspots in from another space. */
export function setHotspots(sceneId: string, hotspots: Hotspot[]) {
  doc[sceneId] = { hotspots: structuredClone(hotspots) };
  emit();
}
export function setBookingOutright(sceneId: string, b: Booking | null) {
  booking[sceneId] = b ? { ...b } : null;
  emit();
}
/** A new id for a copy of a hotspot in another space. */
export const copyHotspotId = (sceneId: string) => `hs-${sceneId}-${Date.now().toString(36)}${(++hsSeq).toString(36)}`;

/** "Set to current view": the hotspot moves onto what the middle of the view rests on. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor SDK renderer handle
export function placeHotspotAtCamera(sceneId: string, id: string, camera: THREE.Camera, renderer: any = null) {
  updateHotspot(sceneId, id, { position: spotInView(camera, renderer) });
}

/* ------------------------------------------------------------------ */
/* Collision boxes (scene.types Collider)                             */
/* ------------------------------------------------------------------ */

const colliders: Record<string, Collider[]> = {};
export const collidersFor = (sceneId: string): Collider[] => colliders[sceneId] ?? [];

/** Which box the studio has selected, for the move handle in the view (ColliderBoxes). */
export const colliderUi: { selected: string | null } = { selected: null };
export function selectCollider(id: string | null) {
  if (colliderUi.selected === id) return;
  colliderUi.selected = id;
  emit();
}

const finite = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const vec = (v: unknown, d: number, min = -Infinity) =>
  [0, 1, 2].map((i) => Math.max(min, finite((v as number[] | undefined)?.[i], d))) as [number, number, number];

/** A saved box made safe to collide with: a NaN here would put the visitor's camera at NaN. */
const cleanCollider = (c: Partial<Collider>, i: number): Collider => ({
  id: typeof c.id === 'string' && c.id ? c.id : `col-${i}`,
  label: typeof c.label === 'string' ? c.label : `Collision box ${i + 1}`,
  position: vec(c.position, 0),
  size: vec(c.size, 1, 0.01),
  yaw: finite(c.yaw, 0),
  color: typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#ff3b6b'
});

/** Where the middle of the view meets the scan (collision.ts boxSpotInView). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor SDK renderer handle
function boxSpot(camera: THREE.Camera, renderer: any) {
  camera.getWorldDirection(_f);
  return boxSpotInView(renderer, camera.position, _f, walkerCfg.unitScale || 1);
}

/** A wall 2 wide, 2.5 tall, standing on the floor where the middle of the view
 *  meets the scan, facing the camera. It stays there until it's moved. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor SDK renderer handle
export function addCollider(sceneId: string, camera: THREE.Camera, renderer: any = null): Collider {
  const u = walkerCfg.unitScale || 1;
  const s = boxSpot(camera, renderer);
  const list = (colliders[sceneId] ??= []);
  const c: Collider = {
    id: `col-${sceneId}-${Date.now().toString(36)}${(++hsSeq).toString(36)}`,
    label: `Collision box ${list.length + 1}`,
    position: [r3(s.x), r3(camera.position.y - walkerCfg.eyeHeight + 1.25 * u), r3(s.z)],
    size: [r3(2 * u), r3(2.5 * u), r3(0.2 * u)],
    yaw: r3(s.yaw),
    color: '#ff3b6b'
  };
  list.push(c);
  emit();
  return c;
}

export function updateCollider(sceneId: string, id: string, patch: Partial<Collider>) {
  const c = colliders[sceneId]?.find((x) => x.id === id);
  if (!c) return;
  Object.assign(c, patch);
  emit();
}

export function removeCollider(sceneId: string, id: string) {
  colliders[sceneId] = collidersFor(sceneId).filter((c) => c.id !== id);
  emit();
}

/** Set outright: undo/redo (history.ts). */
export function setColliders(sceneId: string, list: Collider[]) {
  colliders[sceneId] = structuredClone(list);
  emit();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- vendor SDK renderer handle
export function placeColliderAtCamera(sceneId: string, id: string, camera: THREE.Camera, renderer: any = null) {
  const c = collidersFor(sceneId).find((x) => x.id === id);
  if (!c) return;
  const s = boxSpot(camera, renderer);
  // keep it standing on whatever it stood on, and its turn: only x/z move
  updateCollider(sceneId, id, { position: [r3(s.x), c.position[1], r3(s.z)] });
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
      booking[sceneId] = saved.booking ?? null;
      colliders[sceneId] = (Array.isArray(saved.colliders) ? saved.colliders : []).map(cleanCollider);
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

/** Has the space's saved draft been read yet? Undo starts from it (history.ts). */
export const docLoaded = (sceneId: string) => !!serverDocs[sceneId];

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
    const totalSeconds = Number.isFinite(v.seconds) && v.seconds > 0 ? v.seconds : 4;
    const last = Math.max(1, v.path.length - 1);
    const keyframes = v.path.map((w, i) => ({
      t: r3((i / last) * totalSeconds),
      position: w.pos,
      target: w.look,
      easing: 'easeInOutCubic'
    }));
    const sorted = [...keyframes].sort((a, b) => a.t - b.t);
    return {
      id: v.id,
      label: v.label,
      loop: false,
      autoplayOnLoad: false,
      keyframes: sorted,
      cues: [],
      audio: v.audio ?? null,
      ...(v.transcript ? { transcript: v.transcript } : {}),
      seconds: totalSeconds,
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
    booking: null,
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
    colliders: collidersFor(sceneId),
    tracks,
    booking: bookingFor(sceneId),
    night: conf?.night ?? null,
    building: conf?.building ?? '',
    floor: conf?.floor ?? ''
  };
}

/** A brand-new space, fresh out of the studio's uploader (CLAUDE.md §7.1).
 *  No spawn, viewpoints, hotspots or tracks yet — those come from the normal
 *  editor flow once the space is open. Publish is blocked without a spawn
 *  (§7.5); "Drop to floor" + "Set as start view" are the first things to do. */
export function blankSceneDoc(
  id: string,
  title: string,
  variants: { high: SplatVariant; medium?: SplatVariant; low?: SplatVariant },
  propertyId: string | null = null,
  format: ModelFormat = 'lcc2'
): SceneDoc {
  return {
    id,
    version: 2,
    propertyId,
    title,
    splat: { format, variants },
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
    booking: null,
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
