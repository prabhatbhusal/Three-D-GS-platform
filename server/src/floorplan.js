/* Floor plan from a Lixel Studio export, no Lixel Studio needed.
 *
 * Reads the export's collision mesh (data/mesh/*.ply: binary, Z-up, metres)
 * and the scanner's walked path (info/poses.json), then:
 *   1. finds the floor: the biggest flat level right under the walked path,
 *      within reach below the scanner (not a table top, not the ground outside
 *      or a storey below);
 *   2. cuts the mesh at floor + 1.5 m, as an architect's plan does (above
 *      desks, through windows);
 *   3. drops walls more than 3 m from the walked path (8 m outdoors, where
 *      there's no roof): rooms the scanner only saw through doors and
 *      windows. No path in the export: near the scanned floor instead;
 *   4. joins the cut into lines, removes the scan's wobble, turns the plan
 *      square to the building's own walls, snaps near-square walls square,
 *      joins a wall's pieces across small gaps, and drops furniture-sized
 *      round blobs (stools, plants) while keeping square ones (columns).
 * Writes floorplan/plan.svg (2D), floorplan/3d.svg (walls raised, seen from
 * above at an angle) and floorplan/plan.json (walls, path, numbers) into the
 * asset. Runs on upload (routes/assets.js) and on demand from the studio.
 * ponytail: reads the local asset folder directly; an S3 driver needs a get-to-temp step first. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import * as storage from './storage.js';

const CUT = 1.5; // m above the floor
const NEAR_IN = 3; // m: indoors, walls this close to the walked path
const NEAR_OUT = 8; // m: outdoors, facades stand further back from it
const SIMPLIFY = 0.05; // m: wobble smaller than this is scan noise
const SNAP = 6; // degrees: a wall this close to square is square
const SAME_LINE = 0.08; // m: pieces this close in offset are one wall face
const GAP = 0.25; // m: ... and join across gaps this narrow (a doorway is wider)
const SMALL = 0.8; // m: a curvy blob smaller than this is furniture or a plant
const SHORT = 0.25; // m: a straight piece shorter than this is clutter
const WALL_H = 2.4; // m, how high the 3D plan raises walls
const TEETH = 0.4; // m: what sticks out of a wall less than this at 1.5 m (flush cabinets, radiators) is against it, not part of it
const MIN_RUN = 0.4; // m: a straight stretch shorter than this isn't fitted as a wall
const SILL_CUT = 0.6; // m: the low cut, under window sills (windows)
const RCELL = 0.1; // m: the room grid
const SEAL = 0.3; // m: walls grow by this to seal scan gaps up to 0.6 m when finding rooms
const REACH = 3; // m: how far from the walked path an open-sided area still counts as room

function readPly(buf) {
  const end = buf.indexOf('end_header\n') + 'end_header\n'.length;
  const head = buf.subarray(0, end).toString();
  const nv = +(head.match(/element vertex (\d+)/)?.[1] ?? 0);
  const nf = +(head.match(/element face (\d+)/)?.[1] ?? 0);
  const vprops = head.split('element face')[0].match(/property float \w+/g)?.length ?? 0;
  if (!/binary_little_endian/.test(head) || vprops < 3) return [];
  let o = end;
  const v = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++, o += vprops * 4) {
    v[i * 3] = buf.readFloatLE(o); v[i * 3 + 1] = buf.readFloatLE(o + 4); v[i * 3 + 2] = buf.readFloatLE(o + 8);
  }
  const tris = [];
  for (let i = 0; i < nf; i++) {
    const n = buf[o]; o += 1;
    const idx = [];
    for (let k = 0; k < n; k++, o += 4) idx.push(buf.readInt32LE(o));
    for (let k = 1; k + 1 < n; k++) {
      for (const j of [idx[0], idx[k], idx[k + 1]]) tris.push(v[j * 3], v[j * 3 + 1], v[j * 3 + 2]);
    }
  }
  return tris;
}

/** Pure: triangles (9 numbers each) + walked path → plan. Tested. */
export function planFrom(tris, walk = []) {
  const nT = tris.length / 9;
  if (!nT) return null;

  // 1. flat horizontal area, in 5 cm height bins
  const bins = new Map();
  for (let t = 0; t < nT; t++) {
    const a = t * 9;
    const ux = tris[a + 3] - tris[a], uy = tris[a + 4] - tris[a + 1], uz = tris[a + 5] - tris[a + 2];
    const vx = tris[a + 6] - tris[a], vy = tris[a + 7] - tris[a + 1], vz = tris[a + 8] - tris[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0 && Math.abs(nz) / len > 0.9) {
      const k = Math.round((tris[a + 2] + tris[a + 5] + tris[a + 8]) / 3 / 0.05);
      bins.set(k, (bins.get(k) ?? 0) + len / 2);
    }
  }
  if (!bins.size) return null;
  const floorZ = pickFloor(tris, bins, walk);
  const cutZ = floorZ + CUT;

  // indoors or out: a roof over most of what's underfoot means a room. The
  // ground outside slopes, so "underfoot" is everything flat up to 1 m over
  // the floor, not one level. (Outdoor scan: ~0.05; rooms: 0.3 and up.)
  let low = 0, ceiling = 0;
  for (const [k, area] of bins) {
    const z = k * 0.05 - floorZ;
    if (z > -0.5 && z <= 1) low += area;
    else if (z > 2 && z < 6) ceiling += area;
  }
  const near = ceiling < low * 0.2 ? NEAR_OUT : NEAR_IN;

  // 2. the cut. Each edge is cut with its two ends in a fixed order, so the
  //    two triangles sharing it get bit-identical points and chain up exactly.
  //    A second, low cut under the window sills finds windows later (glass
  //    is invisible to LiDAR: a window is a gap at 1.5 m, wall at 0.6 m).
  const cutAt = (z) => {
    const out = [];
    const hitOn = (a, b, hit) => {
      if (tris[a] > tris[b] || (tris[a] === tris[b] && tris[a + 1] > tris[b + 1])) [a, b] = [b, a];
      const za = tris[a + 2] - z, zb = tris[b + 2] - z;
      if (za * zb >= 0) return;
      const s = za / (za - zb);
      hit.push(tris[a] + (tris[b] - tris[a]) * s, tris[a + 1] + (tris[b + 1] - tris[a + 1]) * s);
    };
    for (let t = 0; t < nT; t++) {
      const hit = [];
      for (let e = 0; e < 3; e++) hitOn(t * 9 + e * 3, t * 9 + ((e + 1) % 3) * 3, hit);
      if (hit.length === 4) out.push(hit);
    }
    return out;
  };
  const segs = cutAt(cutZ);

  // 3. only walls near where the scanner walked — or, for an export without
  //    its path, near the floor it scanned
  let floorTris = [];
  for (let t = 0; t < nT; t++) {
    const a = t * 9;
    if (Math.abs((tris[a + 2] + tris[a + 5] + tris[a + 8]) / 3 - floorZ) > 0.25) continue;
    floorTris.push([tris[a], tris[a + 1], tris[a + 3], tris[a + 4], tris[a + 6], tris[a + 7]]);
  }
  const centre = (f) => [(f[0] + f[2] + f[4]) / 3, (f[1] + f[3] + f[5]) / 3];
  const refs = walk.length
    ? walk.filter((_, i) => i % 15 === 0).map((t) => [t[0], t[1]])
    : floorTris.filter((_, i) => i % Math.max(1, Math.ceil(floorTris.length / 4000)) === 0).map(centre);
  const isNear = nearTest(refs, near);
  const kept = segs.filter((s) => isNear((s[0] + s[2]) / 2, (s[1] + s[3]) / 2));
  if (!kept.length) return null;
  // the floor area counts only floor the scanner walked near: ground at the
  // same height outside a window isn't the room's
  if (walk.length) floorTris = floorTris.filter((f) => isNear(...centre(f)));
  const area = floorTris.reduce((s, f) => s + Math.abs((f[2] - f[0]) * (f[5] - f[1]) - (f[4] - f[0]) * (f[3] - f[1])) / 2, 0);

  // 4. join the cut into lines, and smooth out the scan's wobble
  const lines = chains(kept).map((c) => simplify(c, SIMPLIFY));

  // 5. square the plan up to the building's own walls
  const theta = dominantAngle(lines);
  const cos = Math.cos(theta), sin = Math.sin(theta);
  const rot = ([x, y]) => [x * cos + y * sin, -x * sin + y * cos];
  const rLines = lines.map((c) => c.map(rot));

  // 6. straight walls snap square and join up; small curvy blobs (stools,
  //    plants) go; small square ones (columns) stay
  const H = [], V = [], other = [];
  for (const c of rLines) {
    const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
    const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const pieces = [];
    let square = true, axisLen = 0, allLen = 0;
    for (let i = 1; i < c.length; i++) {
      const [x0, y0] = c[i - 1], [x1, y1] = c[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len < 1e-3) continue;
      const deg = ((Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI + 180) % 180;
      const kind = Math.min(deg, 180 - deg) < SNAP ? 'H' : Math.abs(deg - 90) < SNAP ? 'V' : 'O';
      if (kind === 'O' && len > 0.05) square = false;
      if (kind !== 'O') axisLen += len;
      allLen += len;
      pieces.push([kind, x0, y0, x1, y1, len, i]);
    }
    if (diag < SMALL && !square) continue;
    // a stretch of the line that stays inside a thin band along one axis is
    // one straight wall, teeth and all (curtain folds, radiators, shelving
    // against it at 1.5 m): fitted at its length-weighted median offset
    const fitted = new Uint8Array(c.length);
    for (const [i0, i1, kind] of straightRuns(c)) {
      const ax = kind === 'H' ? 0 : 1;
      const run = c.slice(i0, i1 + 1);
      const lo = Math.min(...run.map((q) => q[ax])), hi = Math.max(...run.map((q) => q[ax]));
      if (hi - lo < MIN_RUN) continue;
      const offs = [];
      for (let i = i0 + 1; i <= i1; i++) offs.push([(c[i - 1][1 - ax] + c[i][1 - ax]) / 2, Math.hypot(c[i][0] - c[i - 1][0], c[i][1] - c[i - 1][1])]);
      offs.sort((m, n) => m[0] - n[0]);
      let half = offs.reduce((t, o) => t + o[1], 0) / 2, at = offs[0][0];
      for (const [o, l] of offs) { at = o; if ((half -= l) <= 0) break; }
      (kind === 'H' ? H : V).push({ at, a: lo, b: hi });
      for (let i = i0 + 1; i <= i1; i++) fitted[i] = 1;
    }
    // a mostly square wall's short slanted bits are what's against it at
    // 1.5 m (curtain folds, frames, a lamp), not the wall: the zig-zag teeth
    const squareWall = axisLen >= allLen * 0.6;
    for (const [kind, x0, y0, x1, y1, len, i] of pieces) {
      if (fitted[i]) continue;
      if (kind === 'H') H.push({ at: (y0 + y1) / 2, a: Math.min(x0, x1), b: Math.max(x0, x1) });
      else if (kind === 'V') V.push({ at: (x0 + x1) / 2, a: Math.min(y0, y1), b: Math.max(y0, y1) });
      else if (!(squareWall && len < 0.3)) other.push([x0, y0, x1, y1]);
    }
  }
  const walls = dropStrays(clearTeeth([
    ...joinSteps(mergeRuns(H)).map((r) => [r.a, r.at, r.b, r.at]),
    ...joinSteps(mergeRuns(V)).map((r) => [r.at, r.a, r.at, r.b]),
    ...other
  ]));
  if (!walls.length) return null;

  // bounds: 0.2 % trimmed, so a last stray fragment can't stretch the drawing
  const xs = walls.flatMap((w) => [w[0], w[2]]).sort((a, b) => a - b);
  const ys = walls.flatMap((w) => [w[1], w[3]]).sort((a, b) => a - b);
  const pick = (arr, f) => arr[Math.floor((arr.length - 1) * f)];
  const box = [pick(xs, 0.002), pick(ys, 0.002), pick(xs, 0.998), pick(ys, 0.998)];
  const inBox = (x, y) => x > box[0] - 0.5 && x < box[2] + 0.5 && y > box[1] - 0.5 && y < box[3] + 0.5;

  const r2 = (n) => Math.round(n * 100) / 100;
  const rWalk = walk.map((t) => rot([t[0], t[1]]));

  // 7. rooms, doors and windows (indoors only)
  const lowCut = near === NEAR_OUT ? [] : cutAt(floorZ + SILL_CUT)
    .filter((s) => isNear((s[0] + s[2]) / 2, (s[1] + s[3]) / 2))
    .map((s) => [...rot([s[0], s[1]]), ...rot([s[2], s[3]])]);
  const inside = walls.filter((w) => inBox(w[0], w[1]) && inBox(w[2], w[3]));
  const { rooms, doors, windows } = near === NEAR_OUT || !rWalk.length
    ? { rooms: [], doors: [], windows: [] }
    : roomsFrom(inside, rWalk, lowCut, rLines, box);
  // a thick wall seen from both sides: two parallel faces 6–40 cm apart,
  // mostly overlapping → drawn solid between them
  const solids = [];
  for (const o of ['h', 'v']) {
    const f = inside
      .filter((w) => (o === 'h' ? Math.abs(w[1] - w[3]) < 0.02 : Math.abs(w[0] - w[2]) < 0.02))
      .map((w) => (o === 'h' ? [w[1], Math.min(w[0], w[2]), Math.max(w[0], w[2])] : [w[0], Math.min(w[1], w[3]), Math.max(w[1], w[3])]))
      .sort((m, n) => m[0] - n[0]);
    for (let i = 0; i < f.length; i++) {
      for (let j = i + 1; j < f.length && f[j][0] - f[i][0] <= 0.4; j++) {
        if (f[j][0] - f[i][0] < 0.06) continue;
        const a = Math.max(f[i][1], f[j][1]), b = Math.min(f[i][2], f[j][2]);
        if (b - a < 0.6 * Math.min(f[i][2] - f[i][1], f[j][2] - f[j][1])) continue;
        solids.push(o === 'h' ? [a, f[i][0], b, f[j][0]] : [f[i][0], a, f[j][0], b]);
      }
    }
  }

  return {
    version: 2,
    floorZ: r2(floorZ),
    cutHeight: CUT,
    /** degrees the scan was turned to square it up (scan frame -> plan frame) */
    rotation: r2((theta * 180) / Math.PI),
    outdoor: near === NEAR_OUT,
    rooms,
    doors,
    windows,
    solids: solids.map((b) => b.map(r2)),
    size: [r2(box[2] - box[0]), r2(box[3] - box[1])],
    floorArea: Math.round(area),
    box: box.map(r2),
    walls: walls.filter((w) => inBox(w[0], w[1]) && inBox(w[2], w[3])).map((w) => w.map(r2)),
    walk: rWalk.filter((p, i) => i % 5 === 0 && inBox(p[0], p[1])).map((p) => p.map(r2)),
    floor: floorTris
      .map((f) => [...rot([f[0], f[1]]), ...rot([f[2], f[3]]), ...rot([f[4], f[5]])])
      .filter((f) => inBox(f[0], f[1]))
      .map((f) => f.map(r2))
  };
}

/** The floor you stood on: the biggest flat level right under the walked
 *  path (within 1 m of it, sideways) and within reach below the scanner
 *  (0.3–2.2 m under its median height). Under the path, because the ground
 *  outside at a similar height is big too — on the team's canteen scan the
 *  ground outside (−1.15) is lower than the room's own floor (−0.8) and was
 *  picked before; within reach, so Floor 4's storey below (−4.35), seen down
 *  a stairwell, doesn't count. Without the path: the lowest level at least
 *  40 % the size of the biggest. Z-up metres. */
function pickFloor(tris, bins, walk) {
  const zs = walk.map((t) => t[2]).filter(Number.isFinite).sort((p, q) => p - q);
  if (zs.length) {
    const scanZ = zs[zs.length >> 1];
    const onPath = nearTest(walk.filter((_, i) => i % 5 === 0).map((t) => [t[0], t[1]]), 1);
    const under = new Map();
    for (let a = 0; a < tris.length; a += 9) {
      const z = (tris[a + 2] + tris[a + 5] + tris[a + 8]) / 3;
      if (z > scanZ - 0.3 || z < scanZ - 2.2) continue;
      const ux = tris[a + 3] - tris[a], uy = tris[a + 4] - tris[a + 1], uz = tris[a + 5] - tris[a + 2];
      const vx = tris[a + 6] - tris[a], vy = tris[a + 7] - tris[a + 1], vz = tris[a + 8] - tris[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (!(len > 0 && Math.abs(nz) / len > 0.9)) continue;
      if (!onPath((tris[a] + tris[a + 3] + tris[a + 6]) / 3, (tris[a + 1] + tris[a + 4] + tris[a + 7]) / 3)) continue;
      const k = Math.round(z / 0.05);
      under.set(k, (under.get(k) ?? 0) + len / 2);
    }
    if (under.size) return [...under].reduce((m, q) => (q[1] > m[1] ? q : m))[0] * 0.05;
  }
  const top = Math.max(...bins.values());
  return [...bins].filter(([, a]) => a >= top * 0.4).map(([k]) => k * 0.05).sort((p, q) => p - q)[0];
}

/** A point test against a spatial hash of reference points. */
function nearTest(refs, r) {
  const grid = new Map();
  const cell = (v) => Math.floor(v / r);
  for (const [x, y] of refs) {
    const k = `${cell(x)},${cell(y)}`;
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(x, y);
  }
  return (x, y) => {
    const cx = cell(x), cy = cell(y);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const pts = grid.get(`${cx + i},${cy + j}`);
        if (!pts) continue;
        for (let k = 0; k < pts.length; k += 2) if ((pts[k] - x) ** 2 + (pts[k + 1] - y) ** 2 < r * r) return true;
      }
    }
    return false;
  };
}

/** Segments that share end points, joined into polylines. */
function chains(segs) {
  const key = (x, y) => `${x},${y}`;
  const ends = new Map();
  segs.forEach((s, i) => {
    for (const k of [key(s[0], s[1]), key(s[2], s[3])]) {
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push(i);
    }
  });
  const used = new Uint8Array(segs.length);
  const out = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const fwd = [[segs[i][2], segs[i][3]]];
    const back = [[segs[i][0], segs[i][1]]];
    for (const line of [fwd, back]) {
      for (;;) {
        const [x, y] = line[line.length - 1];
        const k = key(x, y);
        const j = (ends.get(k) ?? []).find((n) => !used[n]);
        if (j === undefined) break;
        used[j] = 1;
        const s = segs[j];
        line.push(key(s[0], s[1]) === k ? [s[2], s[3]] : [s[0], s[1]]);
      }
    }
    out.push([...back.reverse(), ...fwd]);
  }
  return out;
}

/** Douglas–Peucker, iterative: drops points within `eps` of the line through
 *  their neighbours, so a straight wall's wobble becomes one segment. */
function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    const [ax, ay] = pts[i], [bx, by] = pts[j];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let far = -1, best = eps;
    for (let k = i + 1; k < j; k++) {
      const [px, py] = pts[k];
      let d;
      if (L2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
        d = Math.hypot(px - ax - t * dx, py - ay - t * dy);
      }
      if (d > best) { best = d; far = k; }
    }
    if (far >= 0) { keep[far] = 1; stack.push([i, far], [far, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

/** The direction most wall length runs in, mod 90°, in radians (−45°…45°):
 *  a histogram finds the peak, then the walls near it are averaged exactly.
 *  Directions repeat every 90°, so the average is a circular one on 4θ —
 *  89.8° and 0.1° are the same wall direction, not 45° apart. */
function dominantAngle(lines) {
  const segs = [];
  const hist = new Float64Array(90);
  for (const c of lines) {
    for (let i = 1; i < c.length; i++) {
      const dx = c[i][0] - c[i - 1][0], dy = c[i][1] - c[i - 1][1];
      const len = Math.hypot(dx, dy);
      if (len < 0.3) continue;
      const deg = (((Math.atan2(dy, dx) * 180) / Math.PI) % 90 + 90) % 90;
      segs.push([deg, len]);
      hist[Math.floor(deg) % 90] += len;
    }
  }
  if (!segs.length) return 0;
  let peak = 0, best = -1;
  for (let d = 0; d < 90; d++) {
    let s = 0;
    for (let k = -2; k <= 2; k++) s += hist[(d + k + 90) % 90];
    if (s > best) { best = s; peak = d; }
  }
  let cx = 0, cy = 0;
  for (const [deg, len] of segs) {
    const off = ((deg - peak - 0.5) % 90 + 135) % 90 - 45; // signed, −45…45
    if (Math.abs(off) > 4) continue;
    const r = (deg * 4 * Math.PI) / 180;
    cx += Math.cos(r) * len;
    cy += Math.sin(r) * len;
  }
  return Math.atan2(cy, cx) / 4;
}

/** One wall scanned as pieces that carry on end to end but step a few cm
 *  in or out (the scan drifts along a long wall): pieces within 15 cm of
 *  each other's line that meet end to end (overlapping 10 cm at most) become
 *  one wall on their length-weighted line. Parallel faces side by side (a
 *  thick wall's two sides) overlap more, and stay two. */
function joinSteps(runs) {
  const out = runs.map((r) => ({ ...r }));
  for (let again = true; again;) {
    again = false;
    out.sort((p, q) => p.a - q.a);
    for (let i = 0; i < out.length && !again; i++) {
      for (let j = 0; j < out.length; j++) {
        const p = out[i], q = out[j];
        if (i === j || Math.abs(p.at - q.at) > 0.15 || q.a < p.b - 0.1 || q.a - p.b > GAP) continue;
        const lp = p.b - p.a, lq = q.b - q.a;
        p.at = (p.at * lp + q.at * lq) / (lp + lq);
        p.b = Math.max(p.b, q.b);
        out.splice(j, 1);
        again = true;
        break;
      }
    }
  }
  return out;
}

/** What stands against a wall at 1.5 m (cabinets, shelving, frames) is cut
 *  as scraps just in front of it: slanted bits within 35 cm of a long
 *  straight wall, and short straight bits parallel to one, in front of it
 *  and within its length. They go; the wall stays. */
function clearTeeth(walls) {
  const NEAR = 0.35;
  const axis = (w) => (Math.abs(w[1] - w[3]) < 0.02 ? 'h' : Math.abs(w[0] - w[2]) < 0.02 ? 'v' : null);
  const len = (w) => Math.hypot(w[2] - w[0], w[3] - w[1]);
  const long = walls.filter((w) => axis(w) && len(w) >= 1);
  const toWall = (x, y, w) => (axis(w) === 'h'
    ? (x >= Math.min(w[0], w[2]) - 0.1 && x <= Math.max(w[0], w[2]) + 0.1 ? Math.abs(y - w[1]) : Infinity)
    : (y >= Math.min(w[1], w[3]) - 0.1 && y <= Math.max(w[1], w[3]) + 0.1 ? Math.abs(x - w[0]) : Infinity));
  return walls.filter((w) => {
    const o = axis(w);
    if (!o) return !long.some((l) => toWall(w[0], w[1], l) < NEAR && toWall(w[2], w[3], l) < NEAR);
    if (len(w) >= 1) return true;
    return !long.some((l) => l !== w && axis(l) === o && toWall(w[0], w[1], l) < NEAR && toWall(w[2], w[3], l) < NEAR
      && toWall(w[0], w[1], l) > 0.03);
  });
}

/** A line (plan frame) cut into stretches that each stay inside a band
 *  TEETH wide along one axis: [first point, last point, 'H' | 'V']. Stretches
 *  that are neither (a real slanted wall) aren't returned. */
function straightRuns(c) {
  const out = [];
  if (c.length < 2) return out;
  let s = 0, x0 = c[0][0], x1 = x0, y0 = c[0][1], y1 = y0;
  const kind = (a, b, e, f) => (b - a >= f - e ? (f - e <= TEETH ? 'H' : null) : (b - a <= TEETH ? 'V' : null));
  for (let i = 1; i < c.length; i++) {
    const [x, y] = c[i];
    const nx0 = Math.min(x0, x), nx1 = Math.max(x1, x), ny0 = Math.min(y0, y), ny1 = Math.max(y1, y);
    if (kind(nx0, nx1, ny0, ny1)) { x0 = nx0; x1 = nx1; y0 = ny0; y1 = ny1; continue; }
    const k = kind(x0, x1, y0, y1);
    if (i - 1 > s && k) out.push([s, i - 1, k]);
    s = i - 1;
    x0 = Math.min(c[s][0], x); x1 = Math.max(c[s][0], x); y0 = Math.min(c[s][1], y); y1 = Math.max(c[s][1], y);
  }
  const k = kind(x0, x1, y0, y1);
  if (c.length - 1 > s && k) out.push([s, c.length - 1, k]);
  return out;
}

/** Walls grouped by touching (ends within 0.6 m of another wall). The
 *  biggest group is the building; another group stays if it's substantial
 *  on its own (10 % of the building's length: a second block, outdoors), or
 *  is within 3 m of the building and not a scrap (3 % of all the walls: a
 *  corridor, a detached wall). Anything else is a stray seen through a window or a door, and
 *  goes, so it can't stretch the plan's size either.
 *  ponytail: O(n²) over walls; fine to a few thousand, grid it past that. */
function dropStrays(walls) {
  const n = walls.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const root = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const toSeg = (px, py, [x0, y0, x1, y1]) => {
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / L2)) : 0;
    return Math.hypot(px - x0 - t * dx, py - y0 - t * dy);
  };
  const TOUCH = 0.6;
  for (let i = 0; i < n; i++) {
    const a = walls[i];
    for (let j = i + 1; j < n; j++) {
      const b = walls[j];
      // cheap reject on bounding boxes first
      if (Math.min(a[0], a[2]) > Math.max(b[0], b[2]) + TOUCH || Math.min(b[0], b[2]) > Math.max(a[0], a[2]) + TOUCH) continue;
      if (Math.min(a[1], a[3]) > Math.max(b[1], b[3]) + TOUCH || Math.min(b[1], b[3]) > Math.max(a[1], a[3]) + TOUCH) continue;
      if (Math.min(toSeg(a[0], a[1], b), toSeg(a[2], a[3], b), toSeg(b[0], b[1], a), toSeg(b[2], b[3], a)) < TOUCH) {
        parent[root(i)] = root(j);
      }
    }
  }
  const len = (w) => Math.hypot(w[2] - w[0], w[3] - w[1]);
  const groups = new Map(); // root -> { len, box }
  walls.forEach((w, i) => {
    const r = root(i);
    const g = groups.get(r) ?? { len: 0, box: [Infinity, Infinity, -Infinity, -Infinity] };
    g.len += len(w);
    g.box = [Math.min(g.box[0], w[0], w[2]), Math.min(g.box[1], w[1], w[3]), Math.max(g.box[2], w[0], w[2]), Math.max(g.box[3], w[1], w[3])];
    groups.set(r, g);
  });
  if (!groups.size) return walls;
  const main = [...groups.values()].reduce((m, g) => (g.len > m.len ? g : m));
  const gap = (a, b) => Math.hypot(Math.max(0, a[0] - b[2], b[0] - a[2]), Math.max(0, a[1] - b[3], b[1] - a[3]));
  const total = [...groups.values()].reduce((t, g) => t + g.len, 0);
  const keep = (g) => g === main || g.len >= main.len * 0.1 || (gap(g.box, main.box) < 3 && g.len >= total * 0.03);
  return walls.filter((_, i) => keep(groups.get(root(i))));
}

/** Pieces of one wall face (same offset, give or take) joined across gaps
 *  narrower than a doorway; what's left too short is clutter. */
function mergeRuns(pieces) {
  pieces.sort((p, q) => p.at - q.at);
  const out = [];
  let i = 0;
  while (i < pieces.length) {
    let j = i + 1;
    while (j < pieces.length && pieces[j].at - pieces[i].at < SAME_LINE) j++;
    const group = pieces.slice(i, j).sort((p, q) => p.a - q.a);
    let run = null;
    for (const p of group) {
      if (run && p.a <= run.b + GAP) {
        run.b = Math.max(run.b, p.b);
        run.w += p.b - p.a;
        run.s += p.at * (p.b - p.a);
      } else {
        if (run) out.push(run);
        run = { a: p.a, b: p.b, w: p.b - p.a, s: p.at * (p.b - p.a) };
      }
    }
    if (run) out.push(run);
    i = j;
  }
  return out
    .filter((r) => r.b - r.a >= SHORT)
    .map((r) => ({ a: r.a, b: r.b, at: r.w ? r.s / r.w : 0 }));
}

/** Rooms, doors and windows, from the squared-up walls (plan frame, metres).
 *  A 0.3–4 m gap between two pieces of one straight wall line parts rooms:
 *  walked through (path seen on both sides) and 0.6–1.8 m wide, it's a door;
 *  nobody walked through and there's wall under it at sill height, a window.
 *  Rooms flood-fill from the walked path over indoor cells (walls in at least
 *  three of four directions: open ground outside has two open sides), with
 *  walls grown to seal scan gaps, then grow back out to the wall faces.
 *  Wider openings don't part rooms: that's an open-plan hall. */
function roomsFrom(walls, path, low, cut, box) {
  const r2 = (n) => Math.round(n * 100) / 100;
  const ou = box[0] - 1, ov = box[1] - 1;
  const RW = Math.ceil((box[2] - box[0] + 2) / RCELL), RH = Math.ceil((box[3] - box[1] + 2) / RCELL), N = RW * RH;
  const cellOf = (u, v) => {
    const x = Math.floor((u - ou) / RCELL), y = Math.floor((v - ov) / RCELL);
    return x >= 0 && y >= 0 && x < RW && y < RH ? y * RW + x : -1;
  };
  const draw = (m, x0, y0, x1, y1, pad = 0) => { // a line into a grid, thickened by pad
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (RCELL / 2)) + 1, r = Math.ceil(pad / RCELL);
    for (let i = 0; i <= n; i++) {
      const k = cellOf(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
      if (k < 0) continue;
      const cx = k % RW, cy = (k / RW) | 0;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && y >= 0 && x < RW && y < RH) m[y * RW + x] = 1;
        }
      }
    }
  };
  const lowAt = new Uint8Array(N), cutAtCell = new Uint8Array(N);
  for (const s of low) draw(lowAt, ...s);
  for (const c of cut) for (let i = 1; i < c.length; i++) draw(cutAtCell, c[i - 1][0], c[i - 1][1], c[i][0], c[i][1]);

  // openings: gaps between two pieces of one straight wall line
  const doors = [], windows = [], gaps = [];
  for (const o of ['h', 'v']) {
    const line = walls
      .filter((w) => (o === 'h' ? Math.abs(w[1] - w[3]) < 0.02 : Math.abs(w[0] - w[2]) < 0.02))
      .map((w) => (o === 'h'
        ? { c: w[1], a: Math.min(w[0], w[2]), b: Math.max(w[0], w[2]) }
        : { c: w[0], a: Math.min(w[1], w[3]), b: Math.max(w[1], w[3]) }));
    for (const w of line) {
      const next = line.filter((x) => x !== w && Math.abs(x.c - w.c) < 0.15 && x.a >= w.b).sort((p, q) => p.a - q.a)[0];
      if (!next || next.a - w.b < 0.3 || next.a - w.b > 4) continue;
      const g = { o, a0: w.b, a1: next.a, c: (w.c + next.c) / 2 };
      gaps.push(g);
      const sides = new Set();
      for (const [pu, pv] of path) {
        const along = o === 'h' ? pu : pv, across = (o === 'h' ? pv : pu) - g.c;
        if (along > g.a0 && along < g.a1 && Math.abs(across) > 0.2 && Math.abs(across) < 1) sides.add(Math.sign(across));
      }
      if (sides.size === 2) {
        if (g.a1 - g.a0 >= 0.6 && g.a1 - g.a0 <= 1.8) doors.push(g);
        continue;
      }
      let under = 0, n = 0;
      for (let a = g.a0 + RCELL / 2; a < g.a1; a += RCELL, n++) {
        for (const d of [-0.1, 0, 0.1]) {
          const k = o === 'h' ? cellOf(a, g.c + d) : cellOf(g.c + d, a);
          if (k >= 0 && lowAt[k]) { under++; break; }
        }
      }
      if (n && under / n >= 0.6) windows.push(g);
    }
  }

  const wallAt = new Uint8Array(N), shut = new Uint8Array(N);
  for (const w of walls) { draw(wallAt, ...w); draw(shut, ...w, SEAL); }
  for (const g of gaps) {
    const seg = g.o === 'h' ? [g.a0, g.c, g.a1, g.c] : [g.c, g.a0, g.c, g.a1];
    draw(wallAt, ...seg); draw(shut, ...seg, RCELL);
  }
  // indoors: a wall somewhere in at least three of the four directions
  const hits = new Uint8Array(N);
  for (let y = 0; y < RH; y++) {
    for (let x = 0, seen = 0; x < RW; x++) { const k = y * RW + x; if (wallAt[k]) seen = 1; else hits[k] += seen; }
    for (let x = RW - 1, seen = 0; x >= 0; x--) { const k = y * RW + x; if (wallAt[k]) seen = 1; else hits[k] += seen; }
  }
  for (let x = 0; x < RW; x++) {
    for (let y = 0, seen = 0; y < RH; y++) { const k = y * RW + x; if (wallAt[k]) seen = 1; else hits[k] += seen; }
    for (let y = RH - 1, seen = 0; y >= 0; y--) { const k = y * RW + x; if (wallAt[k]) seen = 1; else hits[k] += seen; }
  }
  const nearPath = new Uint8Array(N); // within REACH of the path, for open-sided areas
  const R = Math.ceil(REACH / RCELL);
  let last = null;
  for (const p of path) {
    if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.5) continue;
    last = p;
    const k = cellOf(p[0], p[1]);
    if (k < 0) continue;
    const px = k % RW, py = (k / RW) | 0;
    for (let y = Math.max(0, py - R); y <= Math.min(RH - 1, py + R); y++) {
      for (let x = Math.max(0, px - R); x <= Math.min(RW - 1, px + R); x++) if ((x - px) ** 2 + (y - py) ** 2 <= R * R) nearPath[y * RW + x] = 1;
    }
  }
  const nbrs = (q) => { const x = q % RW; return [x > 0 ? q - 1 : -1, x < RW - 1 ? q + 1 : -1, q - RW, q + RW]; };
  const label = new Int32Array(N).fill(-1);
  const found = [];
  for (const p of path) {
    const k = cellOf(p[0], p[1]);
    if (k < 0 || shut[k] || hits[k] < 3 || label[k] >= 0) continue;
    const id = found.length, cells = [k], stack = [k];
    let open = false;
    label[k] = id;
    while (stack.length) {
      const q = stack.pop(), x = q % RW, y = (q / RW) | 0;
      if (x === 0 || y === 0 || x === RW - 1 || y === RH - 1) open = true;
      for (const n of nbrs(q)) if (n >= 0 && n < N && !shut[n] && hits[n] >= 3 && label[n] < 0) { label[n] = id; cells.push(n); stack.push(n); }
    }
    found.push({ cells, open });
  }
  for (const r of found) {
    if (r.open) r.cells = r.cells.filter((k) => { if (nearPath[k]) return true; label[k] = -1; return false; });
  }
  let front = found.flatMap((r) => r.cells); // grow back out to the wall faces
  for (let step = 0; step <= Math.ceil(SEAL / RCELL) + 3 && front.length; step++) {
    const next = [];
    for (const q of front) {
      for (const n of nbrs(q)) {
        if (n >= 0 && n < N && label[n] < 0 && !wallAt[n] && hits[n] >= 2 && (nearPath[n] || !found[label[q]].open)) {
          label[n] = label[q]; found[label[q]].cells.push(n); next.push(n);
        }
      }
    }
    front = next;
  }

  const rooms = found.filter((r) => r.cells.length * RCELL * RCELL >= 2).sort((a, b) => b.cells.length - a.cells.length).map((r, i) => {
    const set = new Set(r.cells);
    let x0 = RW, y0 = RH, x1 = 0, y1 = 0, sx = 0, sy = 0;
    for (const k of r.cells) {
      const x = k % RW, y = (k / RW) | 0;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); sx += x; sy += y;
    }
    const boxes = [], growing = new Map(); // row runs, stacked while identical
    for (let y = y0; y <= y1; y++) {
      const seen = new Set();
      for (let x = x0; x <= x1;) {
        if (!set.has(y * RW + x)) { x++; continue; }
        const s0 = x;
        while (x <= x1 && set.has(y * RW + x)) x++;
        const key = `${s0},${x}`, b = growing.get(key);
        seen.add(key);
        if (b && b[3] === y) b[3] = y + 1;
        else { const nb = [s0, y, x, y + 1]; boxes.push(nb); growing.set(key, nb); }
      }
      for (const key of [...growing.keys()]) if (!seen.has(key)) growing.delete(key);
    }
    // its label goes where the room is roomiest: furthest from its edges and
    // from anything cut inside it (ties: nearest the middle)
    const depth = new Map();
    let ring = r.cells.filter((k) => cutAtCell[k] || nbrs(k).some((n) => n < 0 || n >= N || !set.has(n)));
    for (const k of ring) depth.set(k, 0);
    for (let d = 1; ring.length; d++) {
      const next = [];
      for (const k of ring) for (const n of nbrs(k)) if (n >= 0 && n < N && set.has(n) && !depth.has(n)) { depth.set(n, d); next.push(n); }
      ring = next;
    }
    const mx = sx / r.cells.length, my = sy / r.cells.length;
    let at = r.cells[0], best = -Infinity;
    for (const [k, d] of depth) {
      const score = d - Math.hypot((k % RW) - mx, ((k / RW) | 0) - my) * 0.05;
      if (score > best) { best = score; at = k; }
    }
    return {
      id: `r${i + 1}`,
      name: `Room ${i + 1}`,
      area: Math.round(r.cells.length * RCELL * RCELL),
      size: [r2((x1 - x0 + 1) * RCELL), r2((y1 - y0 + 1) * RCELL)],
      at: [r2(ou + ((at % RW) + 0.5) * RCELL), r2(ov + (((at / RW) | 0) + 0.5) * RCELL)],
      rects: boxes.map((b) => [r2(ou + b[0] * RCELL), r2(ov + b[1] * RCELL), r2(ou + b[2] * RCELL), r2(ov + b[3] * RCELL)])
    };
  });
  const out = (g) => ({ o: g.o, a0: r2(g.a0), a1: r2(g.a1), c: r2(g.c) });
  return { rooms, doors: doors.map(out), windows: windows.map(out) };
}

const INK = { bg: '#131419', floor: '#1E1F26', wall: '#F6F7FA', path: '#3364FF', text: '#B9BCCC' };
const TINTS = ['#1E2233', '#1F2A2E', '#2A2233', '#22262E', '#1D2A36', '#2B2A22'];

/** 2D plan: walls, floor, walked path, 5 m scale bar, a caption. */
export function planSvg(p, title) {
  const S = 40;
  const [x0, y0, x1, y1] = [p.box[0] - 0.5, p.box[1] - 0.5, p.box[2] + 0.5, p.box[3] + 0.5];
  const W = (x1 - x0) * S, H = (y1 - y0) * S;
  // Line weights and type grow with the building, so a 100 m site doesn't
  // come out hair-thin when it's shown at the same size as one room.
  const k = Math.max(1, Math.max(W, H) / 700);
  const sw = (3 * k).toFixed(1), fs = Math.round(16 * k), pad = Math.round(70 * k);
  const X = (x) => ((x - x0) * S).toFixed(1), Y = (y) => ((y1 - y) * S).toFixed(1);
  // overall dimensions, architect-style: a line with end ticks, the length on it
  const L = (p.box[0] - x0) * S, R = (p.box[2] - x0) * S, T = (y1 - p.box[3]) * S, B = (y1 - p.box[1]) * S;
  const d = -pad * 0.45, t = 6 * k;
  const bar = [100, 50, 20, 10, 5, 2, 1].find((m) => m <= Math.max(p.size[0], p.size[1]) / 4) ?? 1; // a round length, about a quarter of the plan
  const rooms = p.rooms ?? [];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2 + fs * 3}" font-family="Inter,Segoe UI,sans-serif">
<rect x="${-pad}" y="${-pad}" width="${W + pad * 2}" height="${H + pad * 2 + fs * 3}" fill="${INK.bg}"/>
<g fill="${INK.floor}">${p.floor.map((f) => `<path d="M${X(f[0])} ${Y(f[1])}L${X(f[2])} ${Y(f[3])}L${X(f[4])} ${Y(f[5])}Z"/>`).join('')}</g>
${rooms.length ? '' : `<polyline fill="none" stroke="${INK.path}" stroke-width="${(sw * 0.6).toFixed(1)}" stroke-dasharray="${4 * k} ${5 * k}" opacity="0.7" points="${p.walk.map((q) => `${X(q[0])},${Y(q[1])}`).join(' ')}"/>`}
${rooms.map((r, i) => `<path d="${r.rects.map((b) => `M${X(b[0])} ${Y(b[3])}H${X(b[2])}V${Y(b[1])}H${X(b[0])}Z`).join('')}" fill="${TINTS[i % TINTS.length]}" opacity="0.85" shape-rendering="crispEdges"/>`).join('')}
<g fill="${INK.wall}" opacity="0.55">${(p.solids ?? []).map((b) => `<path d="M${X(b[0])} ${Y(b[3])}H${X(b[2])}V${Y(b[1])}H${X(b[0])}Z"/>`).join('')}</g>
<g stroke="${INK.wall}" stroke-width="${sw}" stroke-linecap="square">${p.walls.map((w) => `<line x1="${X(w[0])}" y1="${Y(w[1])}" x2="${X(w[2])}" y2="${Y(w[3])}"/>`).join('')}</g>
<g stroke="${INK.wall}" stroke-width="${(k * 1.2).toFixed(1)}" fill="none">${(p.windows ?? []).map((g) => {
    const o = 4 * k; // a window: two thin lines along the opening
    return g.o === 'h'
      ? `<path d="M${X(g.a0)} ${(+Y(g.c) - o).toFixed(1)}H${X(g.a1)}M${X(g.a0)} ${(+Y(g.c) + o).toFixed(1)}H${X(g.a1)}"/>`
      : `<path d="M${(+X(g.c) - o).toFixed(1)} ${Y(g.a0)}V${Y(g.a1)}M${(+X(g.c) + o).toFixed(1)} ${Y(g.a0)}V${Y(g.a1)}"/>`;
  }).join('')}</g>
<g stroke="#7C9CFF" stroke-width="${(k * 1.5).toFixed(1)}" fill="none">${(p.doors ?? []).map((g) => {
    const w = (g.a1 - g.a0) * S; // a door: its leaf, open, and its swing
    return g.o === 'h'
      ? `<path d="M${X(g.a0)} ${Y(g.c)}V${(+Y(g.c) - w).toFixed(1)}A${w.toFixed(1)} ${w.toFixed(1)} 0 0 1 ${X(g.a1)} ${Y(g.c)}"/>`
      : `<path d="M${X(g.c)} ${Y(g.a0)}H${(+X(g.c) + w).toFixed(1)}A${w.toFixed(1)} ${w.toFixed(1)} 0 0 0 ${X(g.c)} ${Y(g.a1)}"/>`;
  }).join('')}</g>
<g text-anchor="middle" fill="${INK.wall}" font-size="${fs}">${rooms.filter((r) => r.area >= 4).map((r) => {
    const x = X(r.at[0]), y = Y(r.at[1]), name = rooms.length === 1 ? title : r.name;
    return `<text x="${x}" y="${y}" font-weight="700">${esc(name)}<tspan x="${x}" dy="${(fs * 1.2).toFixed(0)}" font-weight="400" fill="${INK.text}" font-size="${Math.round(fs * 0.85)}">${r.size[0].toFixed(1)} × ${r.size[1].toFixed(1)} m, ${r.area} m²</tspan></text>`;
  }).join('')}</g>
<g stroke="${INK.text}" stroke-width="${(k * 1.2).toFixed(1)}" fill="${INK.text}" font-size="${fs}">
<path d="M${L} ${d}H${R}M${L} ${d - t}V${d + t}M${R} ${d - t}V${d + t}" fill="none"/><text stroke="none" x="${(L + R) / 2}" y="${d - fs * 0.5}" text-anchor="middle">${p.size[0]} m</text>
<path d="M${d} ${T}V${B}M${d - t} ${T}H${d + t}M${d - t} ${B}H${d + t}" fill="none"/><text stroke="none" transform="translate(${d - fs * 0.5} ${(T + B) / 2}) rotate(-90)" text-anchor="middle">${p.size[1]} m</text>
<path d="M${W - bar * S} ${H + fs * 1.4}H${W}" stroke-width="${sw}"/><text stroke="none" x="${W - bar * S}" y="${H + fs * 0.9}">${bar} m</text>
<text stroke="none" x="0" y="${H + fs * 2.9}">${esc(title)}: ${p.size[0]} × ${p.size[1]} m, about ${p.floorArea} m² of floor scanned</text></g></svg>`;
}

/** 3D plan: walls raised from the cut, floor and path, from above-left. */
export function plan3dSvg(p, title) {
  const cx = (p.box[0] + p.box[2]) / 2, cy = (p.box[1] + p.box[3]) / 2;
  const dist = Math.max(p.size[0], p.size[1]) * 1.6 + 4, f = 900, yaw = -0.6, pitch = 0.95;
  const proj = (x, y, z) => {
    const dx = x - cx, dy = y - cy;
    const rx = dx * Math.cos(yaw) - dy * Math.sin(yaw), ry = dx * Math.sin(yaw) + dy * Math.cos(yaw);
    const up = ry * Math.cos(pitch) + z * Math.sin(pitch);
    const depth = dist + ry * Math.sin(pitch) - z * Math.cos(pitch);
    return [(rx * f) / depth, (-up * f) / depth, depth];
  };
  const quads = p.walls.map((w) => {
    const pts = [proj(w[0], w[1], 0), proj(w[2], w[3], 0), proj(w[2], w[3], WALL_H), proj(w[0], w[1], WALL_H)];
    const tone = Math.round(150 + (Math.abs(Math.atan2(w[3] - w[1], w[2] - w[0]) % Math.PI) / Math.PI) * 70);
    return { d: pts.reduce((m, q) => m + q[2], 0) / 4, pts, tone };
  }).sort((a, b) => b.d - a.d);
  const floors = p.floor.map((t) => [proj(t[0], t[1], 0), proj(t[2], t[3], 0), proj(t[4], t[5], 0)]);
  const all = [...quads.flatMap((q) => q.pts), ...floors.flat()];
  const bx0 = Math.min(...all.map((q) => q[0])) - 40, bx1 = Math.max(...all.map((q) => q[0])) + 40;
  const by0 = Math.min(...all.map((q) => q[1])) - 40, by1 = Math.max(...all.map((q) => q[1])) + 70;
  const P = (q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bx0.toFixed(0)} ${by0.toFixed(0)} ${(bx1 - bx0).toFixed(0)} ${(by1 - by0).toFixed(0)}" font-family="Inter,Segoe UI,sans-serif">
<rect x="${bx0}" y="${by0}" width="${bx1 - bx0}" height="${by1 - by0}" fill="${INK.bg}"/>
<g fill="#262833">${floors.map((t) => `<path d="M${P(t[0])}L${P(t[1])}L${P(t[2])}Z"/>`).join('')}</g>
${(p.rooms ?? []).length ? '' : `<polyline fill="none" stroke="${INK.path}" stroke-width="2" stroke-dasharray="4 5" points="${p.walk.map((t) => P(proj(t[0], t[1], 0.02)).replace(' ', ',')).join(' ')}"/>`}
${quads.map((q) => `<path d="M${q.pts.map(P).join('L')}Z" fill="rgb(${q.tone},${q.tone + 4},${q.tone + 18})" fill-opacity="0.92" stroke="${INK.bg}" stroke-width="0.4"/>`).join('')}
<g text-anchor="middle" fill="#F6F7FA" font-size="16" font-weight="700">${(p.rooms ?? []).length > 1 ? p.rooms.filter((r) => r.area >= 4).map((r) => { const q = proj(r.at[0], r.at[1], 0.05); return `<text x="${q[0].toFixed(1)}" y="${q[1].toFixed(1)}">${esc(r.name)}</text>`; }).join('') : ''}</g>
<text x="${bx0 + 30}" y="${by1 - 24}" fill="${INK.text}" font-size="18">${esc(title)}: ${p.size[0]} × ${p.size[1]} m</text></svg>`;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Build and store the plan for an uploaded Lixel export. Null when the
 *  export has no collision mesh (a 3D-model space, or an old export). */
export async function buildFloorPlan(assetId, title = 'Floor plan') {
  const base = path.join(storage.ASSET_DIR, assetId);
  const meshDirs = [];
  const walk = async (dir) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && e.name !== 'floorplan') await walk(full);
      else if (e.name.toLowerCase().endsWith('.ply') && path.basename(dir) === 'mesh') meshDirs.push(full);
    }
  };
  try { await walk(base); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  if (!meshDirs.length) return null;

  const tris = [];
  for (const f of meshDirs) for (const n of readPly(await fs.readFile(f))) tris.push(n);

  let path3 = [];
  const poses = meshDirs[0].replace(/[\\/]data[\\/]mesh[\\/][^\\/]+$/, `${path.sep}info${path.sep}poses.json`);
  try { path3 = JSON.parse(await fs.readFile(poses, 'utf8')).poses.map((q) => q.T); } catch { /* no path in this export */ }

  const plan = planFrom(tris, path3);
  if (!plan) return null;
  const put = (rel, text) => storage.put(assetId, `floorplan/${rel}`, Readable.from([text]));
  await put('plan.json', JSON.stringify(plan));
  await put('plan.svg', planSvg(plan, title));
  await put('3d.svg', plan3dSvg(plan, title));
  return { size: plan.size, floorArea: plan.floorArea, walls: plan.walls.length, rooms: plan.rooms.length, doors: plan.doors.length, windows: plan.windows.length };
}
