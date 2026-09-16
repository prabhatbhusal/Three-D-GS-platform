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
