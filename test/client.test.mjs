/**
 * Pure client helpers, run straight from the TypeScript source (Node 24
 * strips the types). `npm test` from the repo root.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardBox, nearestIds, CARD_W, CARD_H } from '../src/lib/hotspotLayout.ts';
import { safeUrl, resolveAsset, assetUrl } from '../src/lib/api.ts';
import { bookingHref, stayProblem, nightsBetween, isoDay } from '../src/lib/booking.ts';

test('booking link carries the visitor\'s dates and guests', () => {
  const t = 'https://basera.com/book?arrive={checkin}&depart={checkout}&adults={guests}&n={nights}';
  const stay = { checkin: '2026-10-01', checkout: '2026-10-04', guests: 2 };
  assert.equal(bookingHref(t, stay), 'https://basera.com/book?arrive=2026-10-01&depart=2026-10-04&adults=2&n=3');
  assert.equal(bookingHref(t, null), 'https://basera.com/book?arrive=&depart=&adults=&n=', 'no stay: placeholders emptied, never sent literally');
  assert.equal(bookingHref('https://basera.com/book', stay), 'https://basera.com/book', 'a plain link is left alone');
  // a hostile template still has to pass safeUrl before it is rendered
  assert.equal(safeUrl(bookingHref('javascript:alert({guests})', stay)), null);
});

test('a stay must be in the future, at least one night, with a guest', () => {
  const today = '2026-09-21';
  assert.equal(stayProblem({ checkin: '2026-09-22', checkout: '2026-09-24', guests: 2 }, today), null);
  assert.match(stayProblem({ checkin: '2026-09-20', checkout: '2026-09-24', guests: 2 }, today), /past/);
  assert.match(stayProblem({ checkin: '2026-09-24', checkout: '2026-09-24', guests: 2 }, today), /at least a day/);
  assert.match(stayProblem({ checkin: '2026-09-25', checkout: '2026-09-24', guests: 2 }, today), /at least a day/);
  assert.match(stayProblem({ checkin: '', checkout: '2026-09-24', guests: 2 }, today), /Pick/);
  assert.match(stayProblem({ checkin: '2026-09-22', checkout: '2026-09-24', guests: 0 }, today), /guest/);
  assert.equal(nightsBetween('2026-10-30', '2026-11-02'), 3, 'across a month end');
  assert.equal(isoDay(1, new Date(2026, 11, 31)), '2027-01-01', 'across a year end');
});

const W = 1280;
const H = 800;
const inside = (b) =>
  b.left >= 0 && b.top >= 0 && b.left + CARD_W <= W && b.top + CARD_H <= H;

test('a card leans toward the middle of the screen', () => {
  assert.equal(cardBox(300, 500, W, H).toLeft, false, 'left-side marker: card to its right');
  assert.equal(cardBox(1000, 500, W, H).toLeft, true, 'right-side marker: card to its left');
});

test('a card rises above its marker, and drops below near the top', () => {
  const up = cardBox(600, 500, W, H);
  assert.equal(up.below, false);
  assert.ok(up.top + CARD_H < 500, 'sits above the marker');
  const down = cardBox(600, 100, W, H);
  assert.equal(down.below, true);
  assert.ok(down.top > 100, 'sits below the marker');
});

test('the leader line meets the card corner nearest the marker', () => {
  const r = cardBox(300, 500, W, H); // card up and to the right
  assert.deepEqual([r.lineX, r.lineY], [r.left, r.top + CARD_H]);
  const l = cardBox(1000, 120, W, H); // card down and to the left
  assert.deepEqual([l.lineX, l.lineY], [l.left + CARD_W, l.top]);
});

test('a card never leaves the screen, even for markers at the edges', () => {
  for (const [x, y] of [[0, 0], [W, 0], [0, H], [W, H], [5, 400], [W - 5, 400], [640, 790], [640, 10]]) {
    assert.ok(inside(cardBox(x, y, W, H)), `marker at ${x},${y}`);
  }
  // A phone in portrait.
  for (const [x, y] of [[20, 300], [370, 300], [195, 700]]) {
    const b = cardBox(x, y, 390, 844);
    assert.ok(b.left >= 0 && b.left + CARD_W <= 390, `phone marker at ${x},${y}`);
  }
});

test('only the nearest few hotspots get a card', () => {
  const list = [{ id: 'far', dist: 30 }, { id: 'near', dist: 2 }, { id: 'mid', dist: 9 }, { id: 'close', dist: 4 }];
  assert.deepEqual([...nearestIds(list, 2)].sort(), ['close', 'near']);
  assert.equal(nearestIds(list, 10).size, 4);
  assert.deepEqual(list.map((m) => m.id), ['far', 'near', 'mid', 'close'], 'input left in its order');
});

test('only http(s) links reach a visitor page', () => {
  assert.equal(safeUrl('https://basera.com/book?room=deluxe'), 'https://basera.com/book?room=deluxe');
  assert.equal(safeUrl('  http://x.io  '), 'http://x.io');
  for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<b>', 'basera.com', '//evil.io', 'https://has space.com', '', null, undefined]) {
    assert.equal(safeUrl(bad), null, String(bad));
  }
});

test('asset:// references resolve through the asset route', () => {
  assert.equal(resolveAsset('asset://ast_1a2b3c4d5e6f/voice.m4a'), assetUrl('ast_1a2b3c4d5e6f', 'voice.m4a'));
  assert.equal(resolveAsset('asset://ast_x/folder/my clip.m4a'), assetUrl('ast_x', 'folder/my%20clip.m4a'));
  assert.equal(resolveAsset('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  assert.equal(resolveAsset('asset://../etc/passwd'), null, 'no traversal through the id');
  assert.equal(resolveAsset('javascript:alert(1)'), null);
  assert.equal(resolveAsset(undefined), null);
});

/* ---- 3D-model spaces: the model handle must answer like the SDK's ---- */

// three's FileLoader reports progress with ProgressEvent, which Node lacks.
globalThis.ProgressEvent ??= class extends Event { constructor(t, init = {}) { super(t); Object.assign(this, init); } };
const { loadMeshModel } = await import('../src/lib/meshModel.ts');
const { findFloorBelow, isClear } = await import('../src/lib/collision.ts');
const { guessUpAxis, pointCloudFloor } = await import('../src/lib/modelPrep.ts');
const { Document, NodeIO } = await import('@gltf-transform/core');
const { ALL_EXTENSIONS, EXTMeshoptCompression } = await import('@gltf-transform/extensions');
const { MeshoptEncoder } = await import('meshoptimizer');

/** A 6 x 6 m room, 3 m high, as the converter would upload it: a
 *  meshopt-compressed .glb, as a data: URL. The floor faces DOWN on purpose:
 *  scan exports disagree on winding, and collision must not care. */
async function roomGlb() {
  const v = [];
  const quad = (a, b, c, d) => v.push(...a, ...b, ...c, ...a, ...c, ...d);
  quad([-3, 0, -3], [3, 0, -3], [3, 0, 3], [-3, 0, 3]); // floor, normal pointing down
  quad([3, 0, -3], [3, 3, -3], [3, 3, 3], [3, 0, 3]);
  quad([-3, 0, -3], [-3, 0, 3], [-3, 3, 3], [-3, 3, -3]);
  quad([-3, 0, 3], [3, 0, 3], [3, 3, 3], [-3, 3, 3]);
  quad([-3, 0, -3], [-3, 3, -3], [3, 3, -3], [3, 0, -3]);
  const doc = new Document();
  const buffer = doc.createBuffer();
  const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(v)).setBuffer(buffer);
  const mesh = doc.createMesh().addPrimitive(doc.createPrimitive().setAttribute('POSITION', pos));
  doc.createScene().addChild(doc.createNode('room').setMesh(mesh));
  await MeshoptEncoder.ready;
  doc.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const bytes = await io.writeBinary(doc);
  return `data:model/gltf-binary;base64,${Buffer.from(bytes).toString('base64')}`;
}

const body = { eyeHeight: 1.6, radius: 0.3 };
const settled = (model) => new Promise((r) => { const t = setInterval(() => { if (model.hasCollision()) { clearInterval(t); r(); } }, 20); });

test('a model room collides like an LCC scan: floor found, walls push back', async () => {
  const model = await loadMeshModel(await roomGlb(), () => {});
  assert.equal(model.hasCollision(), false, 'collision is built after the first frame, not during load');
  await settled(model);

  const b = model.getBounds();
  assert.deepEqual([b.min.x, b.min.y, b.max.y, b.max.z], [-3, 0, 3, 3]);

  const floor = findFloorBelow(model, 0, 0, 2.5, -2, body);
  assert.ok(floor && Math.abs(floor.y - 1.6) < 0.35, `stands on a floor that faces down: ${JSON.stringify(floor)}`);
  assert.equal(isClear(model, 0, 1.6, 0, body), true, 'the middle of the room is open');

  const wall = model.intersectsCapsule({ start: { x: 2.85, y: 0.5, z: 0 }, end: { x: 2.85, y: 1.3, z: 0 }, radius: 0.3 });
  assert.equal(wall.hit, true);
  assert.ok(wall.delta.x < -0.1, `pushed back into the room, off the +x wall: ${JSON.stringify(wall.delta)}`);
  model.dispose();
});

test('moving, turning and scaling the model moves its collision with it', async () => {
  const model = await loadMeshModel(await roomGlb(), () => {});
  await settled(model);
  // What transform.ts applyToRenderer() does: the author transform on root.
  model.root.position.set(10, 5, 0);
  model.root.rotation.set(0, Math.PI / 2, 0);
  model.root.scale.setScalar(2);
  model.root.updateMatrixWorld(true);

  const floor = findFloorBelow(model, 10, 0, 8, 2, body);
  assert.ok(floor && Math.abs(floor.y - 6.6) < 0.35, `floor moved up 5 m: ${JSON.stringify(floor)}`);
  // Scaled x2 the room is 12 m wide, so its walls now sit 6 m from the middle.
  assert.equal(isClear(model, 10 + 4, 6.6, 0, body), true, 'inside the scaled-up room');
  const wall = model.intersectsCapsule({ start: { x: 15.85, y: 5.5, z: 0 }, end: { x: 15.85, y: 6.3, z: 0 }, radius: 0.3 });
  assert.equal(wall.hit, true, 'the turned, scaled wall is where the model now is');
  const b = model.getBounds();
  assert.ok(Math.abs(b.max.y - 11) < 1e-6 && Math.abs(b.max.x - 16) < 1e-6, `bounds follow: ${JSON.stringify(b)}`);
  model.dispose();
});

test('up axis: a scan wider than tall is upright on its short side; anything else stays Y-up', () => {
  assert.equal(guessUpAxis({ x: 6, y: 6, z: 3 }), 'z', 'a Z-up room');
  assert.equal(guessUpAxis({ x: 6, y: 3, z: 6 }), 'y', 'a Y-up room');
  assert.equal(guessUpAxis({ x: 400, y: 300, z: 25 }), 'z', 'a Z-up campus');
  assert.equal(guessUpAxis({ x: 10, y: 50, z: 10 }), 'y', 'a tower: nothing clearly shortest, keep Y');
  assert.equal(guessUpAxis({ x: 2, y: 2, z: 2 }), 'y', 'an object');
});

test('a point cloud gets a floor to stand on, and walls it can\'t walk through', () => {
  // A 6 x 6 m room scanned as points: floor, ceiling at 3 m, walls on x = +-3.
  const pts = [];
  for (let x = -2.95; x < 3; x += 0.1) for (let z = -2.95; z < 3; z += 0.1) pts.push(x, 0, z, x, 3, z);
  for (let z = -2.95; z < 3; z += 0.1) for (let y = 0; y <= 3; y += 0.1) pts.push(-3, y, z, 2.99, y, z);
  const tris = pointCloudFloor(pts);
  assert.ok(tris.length > 0 && tris.length % 9 === 0, 'whole triangles');
  const heights = (x0, x1) => {
    const ys = [];
    for (let i = 0; i < tris.length; i += 3) if (tris[i] > x0 && tris[i] < x1) ys.push(tris[i + 1]);
    return { min: Math.min(...ys), max: Math.max(...ys) };
  };
  const middle = heights(-1, 1);
  assert.ok(Math.abs(middle.min) < 1e-6 && Math.abs(middle.max) < 1e-6, `open floor at y = 0 in the middle: ${JSON.stringify(middle)}`);
  assert.ok(heights(2.8, 3.3).max >= 2.19, 'the wall cells are 2.2 m blocks');
  assert.equal(pointCloudFloor([]).length, 0);
});
