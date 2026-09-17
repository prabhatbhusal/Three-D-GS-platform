/**
 * Scene transform (CLAUDE.md §7.2) — where the author placed the model.
 *
 *   position  metres, world axes (Y up)
 *   rotation  DEGREES about X, Y, Z, applied in YXZ order (turn, then tilt)
 *   scale     uniform — a scan scaled unevenly is a broken scan
 *
 * Applied live by moving the SDK renderer's `root` group. That property is not
 * in src/vendor/README.md; it is what the bundle's own createRenderer() writes
 * `modelMatrix` onto, and collision (`intersectsCapsule`) reads the same
 * group's matrixWorld. Verified 2026-09-17 against bar-restro: after moving,
 * rotating 90° and scaling ×2, collision matched at the transformed positions
 * (72/72 sample points for move and rotate). Re-check after any SDK upgrade.
 *
 * The author transform sits on top of the fixed LCC Z-up → Y-up base matrix:
 * world = author × base.
 */
import * as THREE from 'three';

export type Vec3 = [number, number, number];
export interface SceneTransform { position: Vec3; rotation: Vec3; scale: number }

export const IDENTITY: SceneTransform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 };

const store: Record<string, SceneTransform> = {};
const listeners = new Set<() => void>();
export const subscribeTransform = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const emit = () => listeners.forEach((f) => f());

export const transformFor = (sceneId: string): SceneTransform => store[sceneId] ?? IDENTITY;

const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d;
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

function clean(t: Partial<SceneTransform> | null | undefined): SceneTransform {
  const p = t?.position ?? [], r = t?.rotation ?? [];
  return {
    position: [0, 1, 2].map((i) => round(num(p[i], 0), 4)) as Vec3,
    // keep angles in (-180, 180] so the readout never shows 540°
    rotation: [0, 1, 2].map((i) => round(((num(r[i], 0) + 540) % 360) - 180 || 0, 3)) as Vec3,
    scale: round(Math.min(1000, Math.max(0.001, num(t?.scale, 1))), 4)
  };
}

export function setTransform(sceneId: string, patch: Partial<SceneTransform>) {
  store[sceneId] = clean({ ...transformFor(sceneId), ...patch });
  emit();
}

/** Adopt the transform from a saved scene doc (absent → identity, §5.3). */
export function loadTransform(sceneId: string, saved: Partial<SceneTransform> | null | undefined) {
  store[sceneId] = clean(saved);
  emit();
}

/* Gizmo tool state — shared between the inspector (DOM) and the gizmo
 * (inside the canvas), same mutable-module pattern as walkerConfig. */
export type GizmoMode = 'off' | 'translate' | 'rotate' | 'scale';
export const gizmo: { mode: GizmoMode; dragging: boolean } = { mode: 'off', dragging: false };
export function setGizmoMode(mode: GizmoMode) {
  gizmo.mode = mode;
  emit();
}

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const DEG = Math.PI / 180;

export function authorMatrix(t: SceneTransform, out = new THREE.Matrix4()) {
  _e.set(t.rotation[0] * DEG, t.rotation[1] * DEG, t.rotation[2] * DEG, 'YXZ');
  _q.setFromEuler(_e);
  return out.compose(_v.fromArray(t.position), _q, _s.setScalar(t.scale));
}

/** Put the model where `t` says, render and collision together. */
export function applyToRenderer(renderer: { root?: THREE.Object3D } | null, t: SceneTransform, base: THREE.Matrix4) {
  const root = renderer?.root;
  if (!root) return false;
  authorMatrix(t, _m).multiply(base);
  _m.decompose(root.position, root.quaternion, root.scale);
  root.updateMatrix();
  root.updateMatrixWorld(true);
  return true;
}

/** Degrees in YXZ order, from any quaternion — for reading the gizmo back. */
export function eulerDegrees(q: THREE.Quaternion): Vec3 {
  _e.setFromQuaternion(q, 'YXZ');
  return [_e.x / DEG, _e.y / DEG, _e.z / DEG];
}
