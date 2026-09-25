/* The tour's floor map: the plan the server drew from the scan
 * (server/src/floorplan.js → <asset>/floorplan/plan.json), and the bridge
 * between it and the 3D. Inside the Canvas, App writes where the camera is
 * in the scan's own coordinates every frame (mapPose) and registers how to
 * jump somewhere (setMapGoto); the map outside the Canvas reads and calls
 * them. Plain module state: 60 writes a second must not re-render React. */
import { assetUrl } from './api';

export interface FloorPlan {
  version: number;
  rotation: number; // degrees: scan (x, y) → plan (u, v) is a turn by −rotation
  floorZ: number;
  box: [number, number, number, number];
  walls: [number, number, number, number][]; // lines x0 y0 x1 y1
  doors: { o: 'h' | 'v'; a0: number; a1: number; c: number }[];
  rooms: { id: string; name: string; area: number; size: [number, number]; at: [number, number]; rects: [number, number, number, number][] }[];
}

/** Camera in scan coordinates (Z-up metres): position and a unit forward. */
export const mapPose = { x: 0, y: 0, fx: 0, fy: 1, ok: false };

let goto: ((x: number, y: number, z: number) => void) | null = null;
export const setMapGoto = (f: typeof goto) => { goto = f; };

/** Plan (u, v) ↔ scan (x, y). */
export const toPlan = (p: FloorPlan, x: number, y: number): [number, number] => {
  const a = (p.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [x * c + y * s, -x * s + y * c];
};
const toScan = (p: FloorPlan, u: number, v: number): [number, number] => {
  const a = (p.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [u * c - v * s, u * s + v * c];
};

/** Walk to a point on the plan, eye height above its floor. */
export function goToPlan(p: FloorPlan, u: number, v: number) {
  const [x, y] = toScan(p, u, v);
  goto?.(x, y, p.floorZ + 1.6);
}

const cache = new Map<string, Promise<FloorPlan | null>>();
/** A space's plan, or null when it has none (an older scan, a 3D-model space). */
export function loadPlan(assetId: string | undefined): Promise<FloorPlan | null> {
  if (!assetId || assetId.startsWith('local:')) return Promise.resolve(null);
  if (!cache.has(assetId)) {
    cache.set(assetId, fetch(assetUrl(assetId, 'floorplan/plan.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => (p?.version >= 2 && Array.isArray(p.rooms) ? (p as FloorPlan) : null))
      .catch(() => null));
  }
  return cache.get(assetId)!;
}
