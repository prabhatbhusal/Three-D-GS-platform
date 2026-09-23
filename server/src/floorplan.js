/* Floor plan from a Lixel Studio export, no Lixel Studio needed.
 *
 * Reads the export's collision mesh (data/mesh/*.ply: binary, Z-up, metres)
 * and the scanner's walked path (info/poses.json), then:
 *   1. finds the floor: the height where most flat, horizontal area piles up;
 *   2. cuts the mesh at floor + 1.5 m, as an architect's plan does (above
 *      desks, through windows);
 *   3. drops walls more than 2.5 m from the walked path: rooms the scanner
 *      only saw through doors and windows.
 * Writes floorplan/plan.svg (2D), floorplan/3d.svg (walls raised, seen from
 * above at an angle) and floorplan/plan.json (walls, path, numbers) into the
 * asset. Runs on upload (routes/assets.js) and on demand from the studio.
 * ponytail: reads the local asset folder directly; an S3 driver needs a get-to-temp step first. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import * as storage from './storage.js';

const CUT = 1.5; // m above the floor
const NEAR_PATH = 2.5; // m
const WALL_H = 2.4; // m, how high the 3D plan raises walls

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

  // 1. floor: 5 cm bins of horizontal area; the lowest big one
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
  const top = Math.max(...bins.values());
  const floorZ = Math.min(...[...bins].filter(([, a]) => a > top * 0.15).map(([k]) => k * 0.05));
  const cutZ = floorZ + CUT;

  // 2. the cut
  let walls = [];
  for (let t = 0; t < nT; t++) {
    const hit = [];
    for (let e = 0; e < 3; e++) {
      const a = t * 9 + e * 3, b = t * 9 + ((e + 1) % 3) * 3;
      const za = tris[a + 2] - cutZ, zb = tris[b + 2] - cutZ;
      if (za * zb < 0) {
        const s = za / (za - zb);
        hit.push([tris[a] + (tris[b] - tris[a]) * s, tris[a + 1] + (tris[b + 1] - tris[a + 1]) * s]);
      }
    }
    if (hit.length === 2) walls.push(hit);
  }

  // 3. only walls near where the scanner walked
  const w = walk.filter((_, i) => i % 15 === 0);
  if (w.length) {
    walls = walls.filter(([p, q]) => {
      const x = (p[0] + q[0]) / 2, y = (p[1] + q[1]) / 2;
      return w.some((t) => (t[0] - x) ** 2 + (t[1] - y) ** 2 < NEAR_PATH ** 2);
    });
  }
  if (!walls.length) return null;

  // floor: horizontal triangles within 25 cm of it, flattened
  const floor = [];
  let area = 0;
  for (let t = 0; t < nT; t++) {
    const a = t * 9;
    if (Math.abs((tris[a + 2] + tris[a + 5] + tris[a + 8]) / 3 - floorZ) > 0.25) continue;
    area += Math.abs((tris[a + 3] - tris[a]) * (tris[a + 7] - tris[a + 1]) - (tris[a + 6] - tris[a]) * (tris[a + 4] - tris[a + 1])) / 2;
    floor.push([tris[a], tris[a + 1], tris[a + 3], tris[a + 4], tris[a + 6], tris[a + 7]]);
  }

  // bounds: 0.5 % trimmed, so a stray fragment can't stretch the drawing
  const xs = walls.flatMap(([p, q]) => [p[0], q[0]]).sort((a, b) => a - b);
  const ys = walls.flatMap(([p, q]) => [p[1], q[1]]).sort((a, b) => a - b);
  const pick = (arr, f) => arr[Math.floor((arr.length - 1) * f)];
  const box = [pick(xs, 0.005), pick(ys, 0.005), pick(xs, 0.995), pick(ys, 0.995)];
  const inBox = (x, y) => x > box[0] - 0.5 && x < box[2] + 0.5 && y > box[1] - 0.5 && y < box[3] + 0.5;

  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    version: 1,
    floorZ: r2(floorZ),
    cutHeight: CUT,
    size: [r2(box[2] - box[0]), r2(box[3] - box[1])],
    floorArea: Math.round(area),
    box: box.map(r2),
    walls: walls.filter(([p]) => inBox(p[0], p[1])).map(([p, q]) => [r2(p[0]), r2(p[1]), r2(q[0]), r2(q[1])]),
    walk: walk.filter((_, i) => i % 5 === 0 && inBox(walk[i][0], walk[i][1])).map((t) => [r2(t[0]), r2(t[1])]),
    floor: floor.filter((f) => inBox(f[0], f[1])).map((f) => f.map(r2))
  };
}

const INK = { bg: '#131419', floor: '#1E1F26', wall: '#F6F7FA', path: '#3364FF', text: '#B9BCCC' };

/** 2D plan: walls, floor, walked path, 5 m scale bar, a caption. */
export function planSvg(p, title) {
  const S = 40, pad = 60;
  const [x0, y0, x1, y1] = [p.box[0] - 0.5, p.box[1] - 0.5, p.box[2] + 0.5, p.box[3] + 0.5];
  const W = (x1 - x0) * S, H = (y1 - y0) * S;
  const X = (x) => ((x - x0) * S).toFixed(1), Y = (y) => ((y1 - y) * S).toFixed(1);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2 + 40}" font-family="Inter,Segoe UI,sans-serif">
<rect x="${-pad}" y="${-pad}" width="${W + pad * 2}" height="${H + pad * 2 + 40}" fill="${INK.bg}"/>
<g fill="${INK.floor}">${p.floor.map((f) => `<path d="M${X(f[0])} ${Y(f[1])}L${X(f[2])} ${Y(f[3])}L${X(f[4])} ${Y(f[5])}Z"/>`).join('')}</g>
<g stroke="${INK.wall}" stroke-width="3" stroke-linecap="round">${p.walls.map((w) => `<line x1="${X(w[0])}" y1="${Y(w[1])}" x2="${X(w[2])}" y2="${Y(w[3])}"/>`).join('')}</g>
<polyline fill="none" stroke="${INK.path}" stroke-width="2" stroke-dasharray="4 5" opacity="0.8" points="${p.walk.map((t) => `${X(t[0])},${Y(t[1])}`).join(' ')}"/>
<g fill="${INK.text}" font-size="16"><line x1="${W - 5 * S}" y1="${H + 30}" x2="${W}" y2="${H + 30}" stroke="${INK.text}" stroke-width="3"/><text x="${W - 5 * S}" y="${H + 22}">5 m</text>
<text x="0" y="${H + 62}">${esc(title)}: ${p.size[0]} × ${p.size[1]} m, about ${p.floorArea} m² of floor scanned</text></g></svg>`;
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
<polyline fill="none" stroke="${INK.path}" stroke-width="2" stroke-dasharray="4 5" points="${p.walk.map((t) => P(proj(t[0], t[1], 0.02)).replace(' ', ',')).join(' ')}"/>
${quads.map((q) => `<path d="M${q.pts.map(P).join('L')}Z" fill="rgb(${q.tone},${q.tone + 4},${q.tone + 18})" fill-opacity="0.92" stroke="${INK.bg}" stroke-width="0.4"/>`).join('')}
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
  return { size: plan.size, floorArea: plan.floorArea, walls: plan.walls.length };
}
