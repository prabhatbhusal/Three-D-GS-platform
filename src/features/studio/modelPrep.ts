/**
 * Pure geometry for preparing a 3D model on upload (modelConvert.ts): which
 * way is up, and a floor to walk on for a point cloud. No three.js, no DOM,
 * so `npm test` runs it directly.
 */

export type Axis = 'y' | 'z';

/**
 * Guess the up axis from a model's size. A scanned room, floor or site is
 * wider than it is tall, so the clearly-shortest side is up. When nothing is
 * clearly shortest (a tower, a statue, a single object), keep Y: glTF, OBJ
 * and most FBX exporters are Y-up. The author can override on upload, and
 * turn it later with the gizmo.
 * ponytail: size only; a floor-plane fit would catch a Z-up tower.
 */
export function guessUpAxis(size: { x: number; y: number; z: number }): Axis {
  const sorted = [size.x, size.y, size.z].sort((a, b) => a - b);
  const clearly = sorted[0] < 0.7 * sorted[1];
  return clearly && size.z === sorted[0] && size.z < size.y ? 'z' : 'y';
}

/** What a body needs clear to stand in a cell: knees to above the head. */
const BAND_LOW = 0.4;
const BAND_HIGH = 1.8;
const WALL_HEIGHT = 2.2;

/**
 * A walkable floor for a point cloud, which has no surfaces to stand on.
 * `pos` is xyz triples, Y-up, in metres. Returns triangle vertices (xyz,
 * three per triangle) for a hidden collision mesh:
 *
 *  - each grid cell's floor is its lowest points, smoothed against its
 *    neighbours so a few stray points below the floor don't make a pit;
 *  - a cell with many points at body height (a wall, a cupboard) becomes a
 *    2.2 m block you can't walk through;
 *  - a cell with no points stays open, as a gap in the scan would be.
 */
export function pointCloudFloor(pos: ArrayLike<number>, cell = 0.25): Float32Array {
  const n = Math.floor(pos.length / 3);
  if (!n) return new Float32Array(0);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = pos[i * 3], z = pos[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  // Keep the grid to ~2M cells: a big site gets coarser cells, not a crash.
  const span = Math.max(maxX - minX, maxZ - minZ);
  const size = Math.max(cell, span / 1400);
  const w = Math.floor((maxX - minX) / size) + 1;
  const d = Math.floor((maxZ - minZ) / size) + 1;
  const at = (i: number) => Math.floor((pos[i * 3] - minX) / size) + Math.floor((pos[i * 3 + 2] - minZ) / size) * w;

  // Pass 1: lowest point and point count per cell.
  const low = new Float32Array(w * d).fill(Infinity);
  const count = new Uint32Array(w * d);
  for (let i = 0; i < n; i++) {
    const c = at(i);
    count[c]++;
    if (pos[i * 3 + 1] < low[c]) low[c] = pos[i * 3 + 1];
  }
  // Median of the 3x3 neighbourhood: one stray point can't dig a hole.
  const floor = new Float32Array(w * d).fill(Infinity);
  const near: number[] = [];
  for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
    if (count[x + z * w] < 3) continue;
    near.length = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, zz = z + dz;
      if (xx >= 0 && zz >= 0 && xx < w && zz < d && count[xx + zz * w] >= 3) near.push(low[xx + zz * w]);
    }
    near.sort((a, b) => a - b);
    floor[x + z * w] = near[Math.floor(near.length / 2)];
  }

  // Pass 2: points at body height above that floor.
  const body = new Uint32Array(w * d);
  for (let i = 0; i < n; i++) {
    const c = at(i);
    const h = pos[i * 3 + 1] - floor[c];
    if (h > BAND_LOW && h < BAND_HIGH) body[c]++;
  }

  const tris: number[] = [];
  const quad = (a: number[], b: number[], c: number[], e: number[]) => tris.push(...a, ...b, ...c, ...a, ...c, ...e);
  for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) {
    const c = x + z * w;
    if (!Number.isFinite(floor[c])) continue;
    const x0 = minX + x * size, x1 = x0 + size, z0 = minZ + z * size, z1 = z0 + size;
    const y0 = floor[c];
    const blocked = body[c] >= Math.max(6, count[c] * 0.25);
    const y1 = blocked ? y0 + WALL_HEIGHT : y0;
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]); // floor, or the block's top
    if (blocked) {
      quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]);
      quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]);
      quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]);
      quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]);
    }
  }
  return new Float32Array(tris);
}
