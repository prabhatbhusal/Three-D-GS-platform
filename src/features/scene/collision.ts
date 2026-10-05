/**
 * Finding solid ground in an LCC scan.
 *
 * Everything here is built on the SDK's `intersectsCapsule`, which is the one
 * collision call that demonstrably answers for both legacy and uploaded
 * scenes. `LCCRender.raycastFromOrigin` looked like the natural fit for a
 * floor probe and is what the walker's reset() used to call — but it returns
 * nothing usable on these scans, so the walker never actually floor-snapped.
 *
 * Why this matters for uploaded spaces: a fresh scene doc has a guessed spawn
 * (blankSceneDoc), and a scan's collision mesh only covers where the operator
 * actually walked. Put the visitor outside that cover and gravity drops them
 * out of the world with nothing to stop it.
 */

/** Matches the body capsule useLccWalker.resolve() uses: `y` is the EYE. */
export interface WalkerShape {
  eyeHeight: number;
  radius: number;
}

interface CapsuleHit {
  hit?: boolean;
  delta?: { x: number; y: number; z: number };
}

export interface Bounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

/* eslint-disable @typescript-eslint/no-explicit-any -- vendor SDK renderer handle */
type SceneRenderer = any;

function probe(r: SceneRenderer, x: number, y: number, z: number, s: WalkerShape): CapsuleHit | null {
  if (!r?.intersectsCapsule) return null;
  try {
    return r.intersectsCapsule({
      start: { x, y: y - s.eyeHeight + s.radius, z },
      end: { x, y: y - s.radius, z },
      radius: s.radius
    });
  } catch {
    return null;
  }
}

/** True when a body standing with its eye at `y` is clear of geometry. */
export function isClear(r: SceneRenderer, x: number, y: number, z: number, s: WalkerShape): boolean {
  const h = probe(r, x, y, z, s);
  return !h?.hit;
}

/**
 * Steps a body capsule down from `fromY` looking for the first solid thing
 * under (x, z), and returns the eye height it settles at — or null if there
 * is simply nothing below, which is the case that drops a visitor out of the
 * world. Stepping (rather than one long query) is what keeps a thin floor
 * from being missed between samples.
 */
export function findFloorBelow(
  r: SceneRenderer,
  x: number,
  z: number,
  fromY: number,
  toY: number,
  s: WalkerShape
): { x: number; y: number; z: number } | null {
  if (!r?.intersectsCapsule || !(fromY > toY)) return null;
  const step = Math.max(s.eyeHeight * 0.5, (fromY - toY) / 400);
  for (let y = fromY; y > toY; y -= step) {
    const h = probe(r, x, y, z, s);
    if (h?.hit && h.delta) {
      // Stand where the push-out actually puts us, not where we probed —
      // returning only `y` would drop the body back into the wall it was
      // just pushed clear of.
      const at = { x: x + h.delta.x, y: y + h.delta.y, z: z + h.delta.z };
      if (isClear(r, at.x, at.y, at.z, s)) return at;
    }
  }
  return null;
}

/**
 * Looks for somewhere a visitor can actually stand, for a scene whose authored
 * spawn has no ground under it at all. Samples a ring-out grid so the result
 * is the open floor nearest the middle of the scan rather than a far corner.
 */
export function findStandingSpot(
  r: SceneRenderer,
  bounds: Bounds,
  s: WalkerShape
): { x: number; y: number; z: number } | null {
  if (!bounds) return null;
  const cx = (bounds.min.x + bounds.max.x) / 2;
  const cz = (bounds.min.z + bounds.max.z) / 2;
  const spanX = bounds.max.x - bounds.min.x;
  const spanZ = bounds.max.z - bounds.min.z;
  const top = bounds.max.y + s.eyeHeight;
  const bottom = bounds.min.y - s.eyeHeight;

  const STEPS = 6; // rings out from the centre; 13x13 samples at the widest
  for (let ring = 0; ring <= STEPS; ring++) {
    for (let ix = -ring; ix <= ring; ix++) {
      for (let iz = -ring; iz <= ring; iz++) {
        // only the perimeter of this ring — inner ones were already tried
        if (ring > 0 && Math.abs(ix) !== ring && Math.abs(iz) !== ring) continue;
        const x = cx + (ix / (STEPS * 2)) * spanX;
        const z = cz + (iz / (STEPS * 2)) * spanZ;
        const at = findFloorBelow(r, x, z, top, bottom, s);
        if (at) return at;
      }
    }
  }
  return null;
}


/** True when a small ball at (x, y, z) touches the scan's collision mesh. */
function touches(r: SceneRenderer, x: number, y: number, z: number, radius: number): boolean {
  if (!r?.intersectsCapsule) return false;
  try {
    const h: CapsuleHit | null = r.intersectsCapsule({
      start: { x, y: y - radius * 0.1, z },
      end: { x, y: y + radius * 0.1, z },
      radius
    });
    return !!h?.hit;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- */
/* Collision boxes (scene.types Collider)                           */
/* ---------------------------------------------------------------- */

type XYZ = { x: number; y: number; z: number };
interface Capsule { start: XYZ; end: XYZ; radius: number }
/** What collision needs of a Collider. */
interface Box { position: number[]; size: number[]; yaw: number }

const DEG = Math.PI / 180;

/**
 * The push that moves a capsule clear of one box, or null when they don't
 * touch: the same contract as the SDK's `intersectsCapsule` delta. Works in
 * the box's own frame (it turns about Y only), then turns the push back.
 */
export function capsuleBoxPush(q: Capsule, b: Box): XYZ | null {
  const r = q.radius;
  const h = [b.size[0] / 2, b.size[1] / 2, b.size[2] / 2];
  const cos = Math.cos(b.yaw * DEG), sin = Math.sin(b.yaw * DEG);
  const toBox = (p: XYZ) => {
    const x = p.x - b.position[0], z = p.z - b.position[2];
    return [x * cos - z * sin, p.y - b.position[1], x * sin + z * cos];
  };
  const a = toBox(q.start), e = toBox(q.end);

  // Apart along any face axis = apart (and the cheap reject for far boxes).
  for (let i = 0; i < 3; i++) {
    if (Math.min(a[i], e[i]) - r > h[i] || Math.max(a[i], e[i]) + r < -h[i]) return null;
  }

  // The segment's distance to the box is convex in t, so a ternary search
  // finds its closest point.
  const gap = (t: number) => [0, 1, 2].map((i) => {
    const p = a[i] + (e[i] - a[i]) * t;
    return p - Math.max(-h[i], Math.min(h[i], p));
  });
  const len = (v: number[]) => Math.hypot(v[0], v[1], v[2]);
  let lo = 0, hi = 1;
  for (let k = 0; k < 30; k++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (len(gap(m1)) < len(gap(m2))) hi = m2; else lo = m1;
  }
  const g = gap((lo + hi) / 2);
  const dist = len(g);
  if (dist >= r) return null;

  let push = [0, 0, 0];
  if (dist > 1e-6) {
    push = g.map((v) => (v * (r - dist)) / dist);
  } else {
    // The segment itself is inside: out by the shortest face.
    let best = Infinity;
    for (let i = 0; i < 3; i++) {
      const up = h[i] - (Math.min(a[i], e[i]) - r);
      const down = Math.max(a[i], e[i]) + r + h[i];
      if (up < best) { best = up; push = [0, 0, 0]; push[i] = up; }
      if (down < best) { best = down; push = [0, 0, 0]; push[i] = -down; }
    }
  }
  return { x: push[0] * cos + push[2] * sin, y: push[1], z: -push[0] * sin + push[2] * cos };
}

/** withColliders' renderer → the scan underneath it, without the boxes. */
const SCAN = Symbol('scan');
/** The scan without the collision boxes. The studio's camera collides with
 *  this, so an author can walk up to and through the boxes they are placing:
 *  a solid box stopped the camera half a metre in front of it, and its tint
 *  then filled the view whichever way they moved. Visitors, and Preview,
 *  keep the boxes solid. */
export const scanOf = (r: SceneRenderer) => r?.[SCAN] ?? r;

/**
 * The scene renderer, with the author's collision boxes added to the two
 * methods the walker and the probes above call. Everything else passes
 * straight through, so the gizmo, bounds and transform see the real thing.
 * useSceneManager wraps each loaded space once.
 */
export function withColliders<T extends object>(renderer: T, boxes: () => Box[]): T {
  const r = renderer as SceneRenderer;
  const intersectsCapsule = (q: Capsule) => {
    const list = boxes();
    const h: CapsuleHit | undefined = r.intersectsCapsule?.(q);
    if (!list.length) return h ?? { hit: false };
    let hit = !!h?.hit;
    const d = { x: 0, y: 0, z: 0, ...(hit ? h?.delta : null) };
    for (const b of list) {
      // each box sees the capsule where the pushes so far have left it
      const p = capsuleBoxPush({
        start: { x: q.start.x + d.x, y: q.start.y + d.y, z: q.start.z + d.z },
        end: { x: q.end.x + d.x, y: q.end.y + d.y, z: q.end.z + d.z },
        radius: q.radius
      }, b);
      if (p) { d.x += p.x; d.y += p.y; d.z += p.z; hit = true; }
    }
    return hit ? { hit, delta: d } : { hit: false };
  };
  const hasCollision = () => !!r.hasCollision?.() || boxes().length > 0;
  return new Proxy(renderer, {
    get(target, key) {
      if (key === SCAN) return target;
      if (key === 'intersectsCapsule') return intersectsCapsule;
      if (key === 'hasCollision') return hasCollision;
      const v = Reflect.get(target, key);
      return typeof v === 'function' ? v.bind(target) : v;
    }
  });
}

/**
 * How far along `dir` from `from` the first surface is (a wall, a table, a
 * collision box), or null when nothing is within `max`. A small ball is
 * stepped out, then the hit is narrowed down, so thin things aren't missed.
 * The studio pins hotspots there, so they stay on the thing they're about
 * instead of floating in the air in front of it.
 */
export function surfaceDistance(
  r: SceneRenderer,
  from: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  max: number,
  radius: number
): number | null {
  if (!r?.intersectsCapsule) return null;
  const hit = (s: number) => touches(r, from.x + dir.x * s, from.y + dir.y * s, from.z + dir.z * s, radius);
  const step = Math.max(radius * 1.5, max / 800);
  for (let s = radius * 2; s <= max; s += step) {
    if (!hit(s)) continue;
    let lo = Math.max(0, s - step), hi = s;
    for (let k = 0; k < 12; k++) { const m = (lo + hi) / 2; if (hit(m)) hi = m; else lo = m; }
    return hi;
  }
  return null;
}

/**
 * Where a collision box goes, on the level: where the middle of the view
 * (`look`, a unit vector) meets the scan, and a turn that faces the camera.
 * The boxes are left out of the measuring, so the one being moved doesn't
 * land on its own front. Put 2 units ahead in mid-air, a box seemed to slide
 * about as the camera moved, as hotspots did before 2026-09-29. Nothing
 * within reach (a 360 video, no scene, looking out of a hole): 2 units ahead.
 */
export function boxSpotInView(
  r: SceneRenderer,
  from: { x: number; y: number; z: number },
  look: { x: number; y: number; z: number },
  unit: number
): { x: number; z: number; yaw: number } {
  const flat = Math.hypot(look.x, look.z);
  const fx = flat > 1e-6 ? look.x / flat : 0;
  const fz = flat > 1e-6 ? look.z / flat : -1;
  const d = surfaceDistance(scanOf(r), from, look, 30 * unit, 0.04 * unit);
  return {
    x: d === null ? from.x + fx * 2 * unit : from.x + look.x * d,
    z: d === null ? from.z + fz * 2 * unit : from.z + look.z * d,
    yaw: Math.atan2(fx, fz) * 180 / Math.PI
  };
}

/**
 * Fly mode's line of sight. Walks out from `target` along `-dir` (the way a
 * camera orbiting at distance `dist` sits) and returns how far it can go
 * before a wall or the ceiling gets in the way — so the camera stays inside
 * the room looking in, instead of outside looking at the back of a wall.
 * The SDK has no way to hide a scan's ceiling (no clipping on its shaders),
 * so this is how an indoor "dollhouse" view stays useful. Outdoors nothing is
 * hit and the full distance comes back.
 */
export function clearOrbitDistance(
  r: SceneRenderer,
  target: { x: number; y: number; z: number },
  dir: { x: number; y: number; z: number },
  dist: number,
  radius: number,
  minDist: number
): number {
  if (!r?.intersectsCapsule) return dist;
  const step = Math.max(radius, dist / 24);
  // If the middle itself sits in something (a table, a pillar), walk out of
  // it first: only the first thing hit AFTER open air counts, or the camera
  // would be pinned inside that object with nowhere to zoom.
  let clear = !touches(r, target.x, target.y, target.z, radius);
  for (let s = step; s <= dist; s += step) {
    const hit = touches(r, target.x - dir.x * s, target.y - dir.y * s, target.z - dir.z * s, radius);
    if (!clear) { clear = !hit; continue; }
    if (hit) return Math.max(minDist, s - step);
  }
  return dist;
}
