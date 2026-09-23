import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFrom, planSvg, plan3dSvg } from '../src/floorplan.js';

// A 4 × 3 m room, Z-up, walls 2.5 m high, plus one wall 20 m away that the
// scanner never walked near (a room seen through a window).
const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
const wall = (x0, y0, x1, y1) => quad([x0, y0, 0], [x1, y1, 0], [x1, y1, 2.5], [x0, y0, 2.5]);
const tris = [
  ...quad([0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]),
  ...wall(0, 0, 4, 0), ...wall(4, 0, 4, 3), ...wall(4, 3, 0, 3), ...wall(0, 3, 0, 0),
  ...wall(24, 0, 24, 3)
];
const walk = Array.from({ length: 60 }, (_, i) => [1 + (i % 20) * 0.1, 1.5, 1]);

test('a room: floor found, walls cut, size and area right', () => {
  const p = planFrom(tris, walk);
  assert.equal(p.floorZ, 0);
  assert.deepEqual(p.size, [4, 3]);
  assert.equal(p.floorArea, 12);
  assert.equal(p.walls.length, 8); // two triangles per wall cut, four walls
});

test('walls far from the walked path are dropped', () => {
  assert.ok(planFrom(tris, walk).walls.every((w) => w[0] < 5 && w[2] < 5));
  assert.ok(planFrom(tris, []).walls.some((w) => w[0] > 20)); // no path: kept
});

test('no geometry, no plan; titles are escaped', () => {
  assert.equal(planFrom([], walk), null);
  const p = planFrom(tris, walk);
  assert.match(planSvg(p, 'Bar & <b>'), /Bar &amp; &lt;b&gt;/);
  assert.match(plan3dSvg(p, 'Lab'), /^<svg/);
});
