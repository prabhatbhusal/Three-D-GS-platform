/**
 * Viewpoints — the clickable "camera shots" for each scene.
 *
 * A viewpoint is a short authored camera move. When the visitor clicks it, the
 * camera flies along `path` (a Catmull-Rom spline through the waypoint
 * positions, orientation slerped between them), eases to a stop on the LAST
 * waypoint, and then hands control back for free-look / walking.
 *
 *   path:     [{ pos:[x,y,z], look:[x,y,z] }, ...]   1+ waypoints, metric, Y-up
 *   seconds:  total flight time (ease-in-out is applied on top)
 *   fov:      optional camera FOV to settle on (default: leave unchanged)
 *
 * A 1-waypoint path is fine — it just glides from wherever the camera is to
 * that single pose.
 *
 * !!! The coordinates in VIEWPOINTS below are PLACEHOLDERS from early bring-up,
 * not real positions in the current scans. Re-author them in the scene:
 *   walk/fly to a spot, press  B  to drop a path waypoint (repeat as you move),
 *   press  V  to close the viewpoint (waypoints -> one entry),
 *   press  Shift+V  to copy this session's viewpoints as JSON,
 *   then replace the matching scene's array below.
 * (The editor's Views filmstrip does the same thing with thumbnails.)
 */

import * as THREE from 'three';
import type { PathWaypoint, Viewpoint } from '../@types/viewpoint.types';
import type { Track } from '../@types/scene.types';

export const VIEWPOINTS: Record<string, Viewpoint[]> = {
  'bar-restro': [
    {
      id: 'bar-entrance',
      label: 'Walk in',
      seconds: 5,
      path: [
        { pos: [0, 1.7, 6], look: [0, 1.5, 0] },
        { pos: [0, 1.7, 2.5], look: [-2, 1.4, -2] },
        { pos: [-1.5, 1.65, 0], look: [-3, 1.3, -3] }
      ]
    },
    {
      id: 'bar-counter',
      label: 'The bar',
      seconds: 4,
      path: [
        { pos: [-1.5, 1.65, 0], look: [-4, 1.4, -1] },
        { pos: [-3.2, 1.6, -1.2], look: [-5, 1.3, -2] }
      ]
    },
    {
      id: 'bar-window',
      label: 'Window seats',
      seconds: 4,
      path: [
        { pos: [-1.5, 1.65, 0], look: [2, 1.4, -3] },
        { pos: [1.5, 1.6, -2], look: [3.5, 1.3, -4] }
      ]
    }
  ],

  'veterinary-lab': [
    {
      id: 'spa-overview',
      label: 'Room overview',
      seconds: 5,
      path: [
        { pos: [0, 1.7, 5], look: [0, 1.4, 0] },
        { pos: [1.5, 1.7, 1.5], look: [-2, 1.3, -2] }
      ]
    },
    {
      id: 'spa-table',
      label: 'Treatment table',
      seconds: 4,
      path: [
        { pos: [1.5, 1.7, 1.5], look: [-1, 1.1, -1] },
        { pos: [0, 1.6, -0.5], look: [-1.5, 1.0, -2] }
      ]
    }
  ]
};

/* ------------------------------------------------------------------ */
/* In-app recorder                                                    */
/* ------------------------------------------------------------------ */
/* Deliberately crude. It exists so you can build the list above by
 * walking the space, not by guessing coordinates. */

let waypointBuf: PathWaypoint[] = []; // the keyboard (B/V) fly-through buffer
const sessionVPs: Record<string, Viewpoint[]> = {}; // sceneId -> [viewpoint] (saved this session, live in the dock)
let vpSeq = 0;
// A counter alone restarts at 0 on every page load and collides with ids
// already saved to the server, so the id carries the time as well.
const newVpId = (sceneId: string) => `vp-${sceneId}-${Date.now().toString(36)}${(++vpSeq).toString(36)}`;

// Scenes whose saved tracks have been read from the server. For those, the
// saved list IS the list — the hand-written VIEWPOINTS above were only ever
// the starting point, and a saved doc already contains whatever survived.
const loadedScenes = new Set<string>();

const r2 = (n: number) => Math.round(n * 100) / 100;
const _fwd = new THREE.Vector3();

/* --- change notification, so the rail + editor panel stay in sync --- */
const listeners = new Set<() => void>();
export function subscribeViewpoints(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
const emit = () => listeners.forEach((fn) => fn());

/** Authored config + everything saved this session, for one scene. Session
 *  entries carry `session:true` so the editor knows which are editable. */
export function liveViewpoints(sceneId: string): Viewpoint[] {
  return [
    ...(loadedScenes.has(sceneId) ? [] : VIEWPOINTS[sceneId] ?? []),
    ...(sessionVPs[sceneId] ?? []).map((v) => ({ ...v, session: true }))
  ];
}

/** A path waypoint at the current camera pose — NOT added to the buffer. */
export function poseWaypoint(camera: THREE.Camera): PathWaypoint {
  const p = camera.position;
  camera.getWorldDirection(_fwd);
  return {
    pos: [r2(p.x), r2(p.y), r2(p.z)],
    // A point 3 units ahead of the camera is a stable look target.
    look: [r2(p.x + _fwd.x * 3), r2(p.y + _fwd.y * 3), r2(p.z + _fwd.z * 3)]
  };
}

/** Drop one path waypoint at the current camera pose (key B / panel button). */
export function dropWaypoint(camera: THREE.Camera): PathWaypoint {
  const wp = poseWaypoint(camera);
  waypointBuf.push(wp);
  emit();
  return wp;
}

/** Turn the buffer into a saved viewpoint (key V / panel Save). It goes live in
 *  the rail immediately and into the JSON export. */
export function closeViewpoint(
  sceneId: string,
  camera: THREE.Camera,
  { label, seconds = 4 }: { label?: string; seconds?: number } = {}
): Viewpoint {
  if (!waypointBuf.length) dropWaypoint(camera);
  const n = (sessionVPs[sceneId]?.length ?? 0) + 1;
  const entry: Viewpoint = {
    id: newVpId(sceneId),
    label: label?.trim() || `Viewpoint ${n}`,
    seconds: Number(seconds) || 4,
    path: waypointBuf.slice()
  };
  (sessionVPs[sceneId] ??= []).push(entry);
  waypointBuf = [];
  emit();
  console.log(
    `%c[viewpoint] saved "${entry.label}" (${entry.path.length} waypoints) — export from the panel or Shift+V`,
    'color:#2f6f4f;font-weight:bold'
  );
  return entry;
}

export function removeSessionViewpoint(sceneId: string, id: string) {
  const arr = sessionVPs[sceneId];
  if (!arr) return;
  const i = arr.findIndex((v) => v.id === id);
  if (i >= 0) {
    arr.splice(i, 1);
    emit();
  }
}

/** Create a session viewpoint from an explicit object (not the buffer). */
export function newSessionViewpoint(
  sceneId: string,
  { label, seconds = 4, path, thumb }: { label?: string; seconds?: number; path?: PathWaypoint[]; thumb?: string }
): Viewpoint {
  const n = (sessionVPs[sceneId]?.length ?? 0) + 1;
  const entry: Viewpoint = {
    id: newVpId(sceneId),
    label: label?.trim() || `View ${n}`,
    seconds: Number(seconds) || 4,
    path: path?.length ? path.map((w) => ({ pos: [...w.pos], look: [...w.look] })) : [],
    thumb
  };
  (sessionVPs[sceneId] ??= []).push(entry);
  emit();
  return entry;
}

/** Merge a patch into a session viewpoint (label / seconds / path / thumb). */
export function updateSessionViewpoint(sceneId: string, id: string, patch: Partial<Viewpoint>) {
  const vp = sessionVPs[sceneId]?.find((v) => v.id === id);
  if (!vp) return;
  Object.assign(vp, patch);
  emit();
}

/** Append one waypoint at the given pose to a session viewpoint's path. */
export function appendWaypoint(sceneId: string, id: string, camera: THREE.Camera) {
  const vp = sessionVPs[sceneId]?.find((v) => v.id === id);
  if (!vp) return;
  vp.path.push(poseWaypoint(camera));
  emit();
}

export function removeWaypointFrom(sceneId: string, id: string, i: number) {
  const vp = sessionVPs[sceneId]?.find((v) => v.id === id);
  if (!vp || !vp.path[i]) return;
  vp.path.splice(i, 1);
  emit();
}

/** Paste-ready JSON of every session viewpoint, grouped by scene (also copied
 *  to the clipboard). Paste into VIEWPOINTS in this file. */
export function exportViewpoints(): string {
  const grouped: Record<string, Pick<Viewpoint, 'id' | 'label' | 'seconds' | 'path'>[]> = {};
  for (const [sceneId, arr] of Object.entries(sessionVPs)) {
    if (!arr.length) continue;
    grouped[sceneId] = arr.map(({ id, label, seconds, path }) => ({ id, label, seconds, path }));
  }
  const json = JSON.stringify(grouped, null, 2);
  console.log(json);
  navigator.clipboard?.writeText(json).then(
    () => console.log('[viewpoint] copied to clipboard'),
    () => {}
  );
  return json;
}

/**
 * Adopt the tracks saved in a scene document. They become ordinary editable
 * tracks. Anything created locally before the load finished is kept.
 */
export function loadTracks(sceneId: string, tracks: Track[], { replace = false }: { replace?: boolean } = {}) {
  const loaded: Viewpoint[] = tracks.map((t) => ({
    id: t.id,
    label: t.label,
    seconds: typeof t.seconds === 'number' && t.seconds > 0 ? t.seconds : 4,
    path: t.keyframes.map((k) => ({
      pos: k.position as [number, number, number],
      look: k.target as [number, number, number]
    })),
    thumb: t.thumb ?? undefined
  }));
  const ids = new Set(loaded.map((v) => v.id));
  const localOnly = replace ? [] : (sessionVPs[sceneId] ?? []).filter((v) => !ids.has(v.id));
  sessionVPs[sceneId] = [...loaded, ...localOnly];
  loadedScenes.add(sceneId);
  emit();
}
