// The floor plan through storage: built from a scan's PLY mesh, rooms named,
// names kept on a redraw, and print copies drawn in ink on white.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await mkdtemp(path.join(os.tmpdir(), 'rcaas-plan-'));
process.env.ASSET_DIR = dir;
process.env.ASSET_DRIVER = 'local';
const { buildFloorPlan, renameRooms } = await import('../src/floorplan.js');
const storage = await import('../src/storage.js');

// two rooms under one ceiling, parted by a wall with a doorway
const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
const wall = (x0, y0, x1, y1) => quad([x0, y0, 0], [x1, y1, 0], [x1, y1, 2.5], [x0, y0, 2.5]);
const slab = (x0, y0, x1, y1, z) => quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]);
const tris = [
  ...slab(0, 0, 6, 3, 0), ...slab(0, 0, 6, 3, 2.6),
  ...wall(0, 0, 6, 0), ...wall(6, 0, 6, 3), ...wall(6, 3, 0, 3), ...wall(0, 3, 0, 0),
  ...wall(4, 0, 4, 1.1), ...wall(4, 1.9, 4, 3)
];
const ply = (t) => {
  const n = t.length / 3, f = n / 3;
  const head = Buffer.from(`ply\nformat binary_little_endian 1.0\nelement vertex ${n}\nproperty float x\nproperty float y\nproperty float z\nelement face ${f}\nproperty list uchar int vertex_indices\nend_header\n`);
  const body = Buffer.alloc(n * 12 + f * 13);
  for (let i = 0; i < t.length; i++) body.writeFloatLE(t[i], i * 4);
  for (let i = 0; i < f; i++) { const o = n * 12 + i * 13; body[o] = 3; for (let k = 0; k < 3; k++) body.writeInt32LE(i * 3 + k, o + 1 + k * 4); }
  return Buffer.concat([head, body]);
};
const walk = Array.from({ length: 80 }, (_, i) => ({ T: [0.6 + (i / 79) * 4.8, 1.5, 1.2] }));

before(async () => {
  await mkdir(path.join(dir, 'ast_plan', 'data', 'mesh'), { recursive: true });
  await mkdir(path.join(dir, 'ast_plan', 'info'), { recursive: true });
  await writeFile(path.join(dir, 'ast_plan', 'data', 'mesh', '0_0_0.ply'), ply(tris));
  await writeFile(path.join(dir, 'ast_plan', 'info', 'poses.json'), JSON.stringify({ poses: walk }));
});
after(() => rm(dir, { recursive: true, force: true }));

const read = async (rel) => (await storage.readAll('ast_plan', `floorplan/${rel}`)).toString('utf8');

test('a plan is drawn from the scan, for screen and for print', async () => {
  const r = await buildFloorPlan('ast_plan', 'Ground floor');
  assert.equal(r.rooms, 2);
  assert.equal(r.doors, 1);
  for (const f of ['plan.json', 'plan.svg', '3d.svg', 'plan-print.svg', '3d-print.svg']) assert.ok((await read(f)).length > 100, f);
  assert.match(await read('plan-print.svg'), /fill="#FFFFFF"/, 'print copy on white');
  assert.match(await read('plan.svg'), /fill="#131419"/, 'screen copy on dark');
});

test('rooms can be named, and the names survive a redraw', async () => {
  const plan = JSON.parse(await read('plan.json'));
  const big = plan.rooms[0].id;
  const rooms = await renameRooms('ast_plan', { [big]: '  Banquet   hall ' });
  assert.equal(rooms.find((x) => x.id === big).name, 'Banquet hall');
  assert.match(await read('plan-print.svg'), /Banquet hall/);
  await buildFloorPlan('ast_plan', 'Ground floor');
  const again = JSON.parse(await read('plan.json'));
  assert.ok(again.rooms.some((x) => x.name === 'Banquet hall' && x.named), 'kept after redrawing from the scan');
  await renameRooms('ast_plan', { [big]: '' });
  assert.ok(!JSON.parse(await read('plan.json')).rooms.some((x) => x.name === 'Banquet hall'), 'an empty name puts the number back');
  assert.equal(await renameRooms('ast_none', { r1: 'x' }), null, 'no plan, nothing to rename');
});
