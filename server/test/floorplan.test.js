import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFrom, planSvg, plan3dSvg } from '../src/floorplan.js';

// A 4 × 3 m room, Z-up, walls 2.5 m high, plus one wall 20 m away that the
// scanner never walked near (a room seen through a window).
const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
const wall = (x0, y0, x1, y1) => quad([x0, y0, 0], [x1, y1, 0], [x1, y1, 2.5], [x0, y0, 2.5]);
const slab = (x0, y0, x1, y1, z) => quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]);
const room = [
  ...slab(0, 0, 4, 3, 0),
  ...wall(0, 0, 4, 0), ...wall(4, 0, 4, 3), ...wall(4, 3, 0, 3), ...wall(0, 3, 0, 0)
];
const tris = [...room, ...wall(24, 0, 24, 3)];
const walk = Array.from({ length: 60 }, (_, i) => [1 + (i % 20) * 0.1, 1.5, 1]);

/** Turn triangles (and a path) about the origin by `deg`, like a scan whose
 *  axes don't line up with the building. */
const turn = (list, deg, stride) => {
  const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
  const out = [...list];
  for (let i = 0; i < out.length; i += stride) [out[i], out[i + 1]] = [out[i] * c - out[i + 1] * s, out[i] * s + out[i + 1] * c];
  return out;
};

test('a room: floor found, walls cut, size and area right', () => {
  const p = planFrom(tris, walk);
  assert.equal(p.floorZ, 0);
  assert.deepEqual(p.size, [4, 3]);
  assert.equal(p.floorArea, 12);
  assert.equal(p.walls.length, 4, 'each wall is one straight line, its cut pieces joined');
});

test('walls far from the walked path are dropped — and far from the scanned floor when there is no path', () => {
  assert.ok(planFrom(tris, walk).walls.every((w) => w[0] < 5 && w[2] < 5));
  const noPath = planFrom(tris, []);
  assert.ok(noPath, 'still a plan without a path');
  assert.ok(noPath.walls.every((w) => w[0] < 5 && w[2] < 5), 'the wall 20 m off the floor goes too');
  assert.deepEqual(noPath.size, [4, 3]);
});

test('a scan that is turned comes out square', () => {
  const p = planFrom(turn(room, 20, 3), walk.map(([x, y, z]) => [...turn([x, y], 20, 2), z]));
  assert.ok(Math.abs(Math.abs(p.rotation) - 20) < 1, `turned back by about 20°, got ${p.rotation}`);
  for (const w of p.walls) {
    assert.ok(Math.abs(w[0] - w[2]) < 0.02 || Math.abs(w[1] - w[3]) < 0.02, `wall ${w} is square`);
  }
  assert.ok(Math.abs(p.size[0] - 4) < 0.05 && Math.abs(p.size[1] - 3) < 0.05, `size ${p.size}`);
});

test('the floor is the level under the path, not a table top, the ground outside, or a storey below', () => {
  const busy = [
    ...room,
    ...slab(1.2, 1.2, 2.8, 1.8, 0.75), // a table, under the path
    ...slab(-20, -20, 20, -5, -0.4), // the ground outside, bigger than the room and lower
    ...slab(-10, 10, 10, 30, -3.5) // a storey below, seen down a stairwell
  ];
  const high = walk.map(([x, y]) => [x, y, 1.3]);
  assert.equal(planFrom(busy, high).floorZ, 0);
});

test('a wall\'s wobble straightens out, and a stray scrap far off goes', () => {
  // the south wall, cut from many small wobbling panels (±2 cm)
  const wobbly = [];
  for (let i = 0; i < 40; i++) {
    const x0 = i * 0.1, x1 = x0 + 0.1;
    wobbly.push(...wall(x0, (i % 2) * 0.02, x1, ((i + 1) % 2) * 0.02));
  }
  const scene = [
    ...slab(0, 0, 4, 3, 0), ...wobbly, ...wall(4, 0, 4, 3), ...wall(4, 3, 0, 3), ...wall(0, 3, 0, 0),
    ...wall(9, 1, 9.4, 1) // a 40 cm scrap 5 m off, near enough the path to survive that test
  ];
  const p = planFrom(scene, walk);
  const south = p.walls.filter((w) => Math.abs(w[1]) < 0.05 && Math.abs(w[3]) < 0.05);
  assert.equal(south.length, 1, 'one straight south wall');
  assert.ok(Math.abs(Math.abs(south[0][2] - south[0][0]) - 4) < 0.05);
  assert.ok(p.walls.every((w) => w[0] < 5 && w[2] < 5), 'the scrap is gone');
});

test('no geometry, no plan; titles are escaped', () => {
  assert.equal(planFrom([], walk), null);
  const p = planFrom(tris, walk);
  assert.match(planSvg(p, 'Bar & <b>'), /Bar &amp; &lt;b&gt;/);
  assert.match(planSvg(p, 'Lab'), />4 m</, 'overall width dimension');
  assert.match(plan3dSvg(p, 'Lab'), /^<svg/);
});

// rooms are an indoor thing: these have a ceiling (no ceiling reads as outdoors)
const roof = slab(0, 0, 4, 3, 2.6);
const line = (x0, y0, x1, y1, n = 40) => Array.from({ length: n }, (_, i) => [x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * i) / (n - 1), 1]);

test('a room is found, with its size and area; outdoors there are none', () => {
  assert.equal(planFrom(room, line(1, 1.5, 3, 1.5)).rooms.length, 0, 'no ceiling: outdoors');
  const p = planFrom([...room, ...roof], line(1, 1.5, 3, 1.5));
  assert.equal(p.rooms.length, 1);
  assert.ok(Math.abs(p.rooms[0].area - 12) <= 1.5, `area ${p.rooms[0].area}`);
});

test('a partition with a doorway the scanner walked through: two rooms and a door', () => {
  const p = planFrom([...room, ...roof, ...wall(2, 0, 2, 1.1), ...wall(2, 1.9, 2, 3)], line(0.6, 1.5, 3.4, 1.5));
  assert.equal(p.rooms.length, 2);
  assert.equal(p.doors.length, 1);
  assert.ok(Math.abs(p.doors[0].a1 - p.doors[0].a0 - 0.8) < 0.15, JSON.stringify(p.doors[0]));
  assert.match(planSvg(p, 'Two rooms'), /Room 2/);
});

test('a gap nobody walked through, with wall under it at sill height, is a window', () => {
  const sill = quad([4, 1, 0], [4, 2, 0], [4, 2, 0.9], [4, 1, 0.9]);
  const east = [...wall(4, 0, 4, 1), ...wall(4, 2, 4, 3), ...sill];
  const box3 = [...slab(0, 0, 4, 3, 0), ...wall(0, 0, 4, 0), ...east, ...wall(4, 3, 0, 3), ...wall(0, 3, 0, 0), ...roof];
  const p = planFrom(box3, line(1, 1.5, 3, 1.5));
  assert.equal(p.windows.length, 1);
  assert.equal(p.rooms.length, 1, 'the window keeps the room shut');
});
