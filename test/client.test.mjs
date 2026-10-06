/**
 * Pure client helpers, run straight from the TypeScript source (Node 24
 * strips the types). `npm test` from the repo root.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardBox, nearestIds, showsCard, NEAR_DISTANCE, CARD_W, CARD_H } from '../src/features/hotspots/hotspotLayout.ts';
import { safeUrl, resolveAsset, assetUrl } from '../src/lib/api.ts';
import { bookingHref, stayProblem, nightsBetween, isoDay, venueDay, freeForStay, roomsNeeded } from '../src/features/booking/booking.ts';
import { resolveInitialTier } from '../src/features/scene/deviceTier.ts';

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

test('the Book now card counts days at the venue, not on the visitor’s clock', () => {
  // 22:00 on 4 October in New York is already 07:45 on 5 October in Kathmandu,
  // the day the server calls today (reservations.js nowIn)
  const at = new Date('2026-10-04T22:00:00-04:00');
  assert.equal(venueDay(0, 'Asia/Kathmandu', at), '2026-10-05');
  assert.equal(venueDay(1, 'Asia/Kathmandu', at), '2026-10-06');
  assert.equal(venueDay(1, 'Asia/Kathmandu', new Date('2026-12-31T12:00:00+05:45')), '2027-01-01', 'across a year end');
  assert.equal(venueDay(0, 'Not/AZone', at), '2026-10-05', 'an unknown zone falls back to Nepal');
});

test('rooms left for a stay: the fullest night counts, the check-out night does not', () => {
  const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
  const free = [3, 1, 2, 0];
  assert.equal(freeForStay(dates, free, '2026-10-01', '2026-10-03'), 1, 'two nights: the 2nd has one left');
  assert.equal(freeForStay(dates, free, '2026-10-03', '2026-10-04'), 2, 'leaving on the full 4th is fine');
  assert.equal(freeForStay(dates, free, '2026-10-03', '2026-10-05'), 0, 'staying the night of the 4th is not');
  assert.equal(freeForStay(dates, free, '2026-10-04', '2026-10-06'), 0, 'runs past the calendar');
  assert.equal(freeForStay(dates, free, '2026-10-02', '2026-10-02'), 0, 'no nights');
  assert.equal(freeForStay(dates, undefined, '2026-10-01', '2026-10-02'), 0, 'a room the calendar doesn’t know');
  assert.deepEqual([roomsNeeded(1, 2), roomsNeeded(2, 2), roomsNeeded(5, 2), roomsNeeded(3, 4)], [1, 1, 3, 1]);
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

test('a text hotspot\'s reveal setting overrides the nearest-few default', () => {
  // no `reveal` (or an old doc that predates the field): today's behaviour, unchanged
  assert.equal(showsCard(undefined, 0.2, true), true, 'in the nearest few');
  assert.equal(showsCard(undefined, 0.2, false), false, 'not in the nearest few, even up close');

  // 'near': only within NEAR_DISTANCE, whether or not it's one of the nearest few
  assert.equal(showsCard('near', NEAR_DISTANCE, true), true, 'right at the threshold');
  assert.equal(showsCard('near', NEAR_DISTANCE + 0.01, true), false, 'just past it, even if it would\'ve been carded');
  assert.equal(showsCard('near', 0.4, false), true, 'close enough although not in the nearest few');

  // 'always': every time, at any distance
  assert.equal(showsCard('always', 500, false), true);
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

test('manual and URL quality overrides are ignored; auto detection decides the tier', () => {
  const prevDocument = globalThis.document;
  const prevNavigator = globalThis.navigator;
  const prevMatchMedia = globalThis.matchMedia;
  const prevLocalStorage = globalThis.localStorage;

  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: {
      createElement: (tag) => tag === 'canvas' ? {
        getContext: () => ({
          getExtension: () => null,
          getParameter: () => 'fake-renderer'
        })
      } : {}
    }});
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
      userAgent: 'test-agent',
      hardwareConcurrency: 4,
      deviceMemory: 4,
      connection: { saveData: false }
    }});
    Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: () => ({ matches: true }) });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      store: { 'splatspace.tier.manual': JSON.stringify('high') },
      getItem: (k) => (k in globalThis.localStorage.store ? globalThis.localStorage.store[k] : null),
      setItem: (k, v) => { globalThis.localStorage.store[k] = String(v); },
      removeItem: (k) => { delete globalThis.localStorage.store[k]; }
    }});

    const resolved = resolveInitialTier();
    assert.equal(resolved.tier, 'low');
    assert.notEqual(resolved.source, 'manual');
    assert.notEqual(resolved.source, 'url');
  } finally {
    if (prevDocument === undefined) delete globalThis.document; else Object.defineProperty(globalThis, 'document', { configurable: true, value: prevDocument });
    if (prevNavigator === undefined) delete globalThis.navigator; else Object.defineProperty(globalThis, 'navigator', { configurable: true, value: prevNavigator });
    if (prevMatchMedia === undefined) delete globalThis.matchMedia; else Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: prevMatchMedia });
    if (prevLocalStorage === undefined) delete globalThis.localStorage; else Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prevLocalStorage });
  }
});

/* ---- 3D-model spaces: the model handle must answer like the SDK's ---- */

// three's FileLoader reports progress with ProgressEvent, which Node lacks.
globalThis.ProgressEvent ??= class extends Event { constructor(t, init = {}) { super(t); Object.assign(this, init); } };
const { loadMeshModel } = await import('../src/features/scene/meshModel.ts');
const { findFloorBelow, isClear } = await import('../src/features/scene/collision.ts');
const { guessUpAxis, pointCloudFloor } = await import('../src/features/studio/modelPrep.ts');
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

test('every tour string has a Nepali and a Chinese translation', async () => {
  const { DICT, translate } = await import('../src/lib/i18n.ts');
  const { readFileSync } = await import('node:fs');
  const files = ['tour/Viewer', 'enquiry/EnquiryPanel', 'tour/FloorMap', 'booking/BookingCard', 'scene/TouchControls', 'hotspots/HotspotMarkers', 'booking/TableCard', 'booking/RoomCard', 'tour/ConciergePanel']
    .map((f) => readFileSync(new URL(`../src/features/${f}.tsx`, import.meta.url), 'utf8'));
  const keys = new Set(files.flatMap((src) => [...src.matchAll(/\bt[r]?\('([^']+)'/g)].map((m) => m[1])));
  // passed to t() through a variable
  for (const k of ['Viewpoints', 'Walk', 'Fly', 'Orbit', 'Glide between the best spots', 'Move freely, as if you’re there',
    'Soar anywhere with W A S D', 'Circle the room at eye level', 'Look around', 'Fly to that view', 'Open what’s there',
    'Walk faster', 'Stop a flythrough', 'Name', 'Phone', 'What are you looking for?', 'Room booking',
    'Add your name so the team can reach you.', 'Add your phone so the team can reach you.',
    stayProblem({ checkin: '', checkout: '', guests: 1 }), stayProblem({ checkin: '2000-01-01', checkout: '2000-01-02', guests: 1 })]) keys.add(k);
  assert.ok(keys.size > 80, `found ${keys.size} strings`);
  for (const k of keys) {
    assert.ok(DICT.ne[k], `no Nepali for: ${k}`);
    assert.ok(DICT.zh[k], `no Chinese for: ${k}`);
  }
  assert.equal(translate('zh', 'Go to {place}', { place: 'Lobby' }), '前往Lobby');
  assert.equal(translate('ne', 'Not in the dictionary'), 'Not in the dictionary', 'unknown text stays English');
  assert.equal(translate('en', '{n} nights', { n: 3 }), '3 nights');
});

test('a night version is reached from its day space, not listed on its own', async () => {
  // scenes.ts imports './api' the bundler way (no extension); let Node find the .ts
  const { register } = await import('node:module');
  register('data:text/javascript,' + encodeURIComponent(
    'export async function resolve(s, c, next) { try { return await next(s, c); } catch (e) {' +
    ' if (s.startsWith(".") && !s.split("/").pop().includes(".")) return next(s + ".ts", c); throw e; } }'));
  const { hydrateScenes, limitTour, tourSpaces, dayNightPair, sameTimeOfDay } = await import('../src/features/scene/scenes.ts');
  hydrateScenes([
    { id: 'dn-a', title: 'A', night: 'dn-an' }, { id: 'dn-an', title: 'A at night' },
    { id: 'dn-b', title: 'B', night: 'dn-bn' }, { id: 'dn-bn', title: 'B at night' },
    { id: 'dn-c', title: 'C' }
  ]);
  limitTour(['dn-a', 'dn-an', 'dn-b', 'dn-bn', 'dn-c'], 'dn-a');
  assert.deepEqual(tourSpaces().map((s) => s.id), ['dn-a', 'dn-b', 'dn-c']);
  assert.deepEqual(dayNightPair('dn-an'), { day: 'dn-a', night: 'dn-an' });
  assert.deepEqual(dayNightPair('dn-a'), { day: 'dn-a', night: 'dn-an' });
  assert.equal(dayNightPair('dn-c'), null);
  assert.equal(sameTimeOfDay('dn-an', 'dn-b'), 'dn-bn', 'at night, the next space opens at night too');
  assert.equal(sameTimeOfDay('dn-an', 'dn-c'), 'dn-c', 'unless it has no night version');
  assert.equal(sameTimeOfDay('dn-a', 'dn-b'), 'dn-b');
  limitTour(['dn-a', 'dn-b', 'dn-bn'], 'dn-a'); // A's night version isn't published
  assert.equal(dayNightPair('dn-a'), null);
});

test('a large site’s spaces group by building, then floor, lowest floor first', async () => {
  // scenes.ts was already loaded (with its import resolver) by the night-version test above
  const { hydrateScenes, limitTour, placesMap, hasPlaces, floorRank } = await import('../src/features/scene/scenes.ts');
  assert.deepEqual(['Roof terrace', '2nd floor', 'Ground floor', 'Basement', 'First floor', 'Level 3'].sort((a, b) => floorRank(a) - floorRank(b)),
    ['Basement', 'Ground floor', 'First floor', '2nd floor', 'Level 3', 'Roof terrace']);
  hydrateScenes([
    { id: 'pl-lab', title: 'Lab', building: 'Science block', floor: '1st floor' },
    { id: 'pl-lobby', title: 'Lobby', building: 'Main block', floor: 'Ground floor' },
    { id: 'pl-hall', title: 'Hall', building: 'Main block', floor: 'First floor' },
    { id: 'pl-canteen', title: 'Canteen', building: 'Main block', floor: 'Ground floor' },
    { id: 'pl-store', title: 'Store', building: 'Main block', floor: 'Basement' }
  ]);
  limitTour(['pl-lab', 'pl-lobby', 'pl-hall', 'pl-canteen', 'pl-store'], 'pl-lobby');
  assert.ok(hasPlaces());
  assert.deepEqual(placesMap().map((b) => [b.name, b.floors.map((f) => [f.name, f.spaces.map((s) => s.id)])]), [
    ['Science block', [['1st floor', ['pl-lab']]]],
    ['Main block', [['Basement', ['pl-store']], ['Ground floor', ['pl-lobby', 'pl-canteen']], ['First floor', ['pl-hall']]]]
  ]);
  limitTour(['pl-lobby', 'pl-canteen'], 'pl-lobby'); // one building, one floor: nothing to pick
  assert.equal(hasPlaces(), false);
});

test('a logo’s colours: the brand colour, not its background, outline or edges', async () => {
  const { paletteFromPixels, inkOn } = await import('../src/lib/brandColor.ts');
  const px = (list) => list.flatMap(([hex, n, a = 255]) => {
    const v = parseInt(hex.slice(1), 16);
    return Array.from({ length: n }, () => [(v >> 16) & 255, (v >> 8) & 255, v & 255, a]).flat();
  });
  // a red logo with a navy word, on white, with a few pink anti-aliased edge pixels
  const logo = paletteFromPixels(px([['#ffffff', 600], ['#d62828', 300], ['#1d3557', 80], ['#f4b6b6', 5], ['#d82a2a', 15]]));
  assert.equal(logo.accent, '#d62828', 'the red, grouped with its near-twin');
  assert.ok(logo.colours.includes('#1d3557'), 'the navy is offered too');
  assert.ok(!logo.colours.includes('#ffffff'), 'the white background is not a brand colour');
  assert.ok(!logo.colours.some((c) => c === '#f4b6b6'), 'nor are edge pixels');
  // a transparent background is ignored; small but vivid beats big and dull
  const onClear = paletteFromPixels(px([['#000000', 900, 0], ['#333333', 70], ['#2a9d8f', 30]]));
  assert.equal(onClear.accent, '#2a9d8f');
  // black and white: nothing to suggest, but the black is listed
  const mono = paletteFromPixels(px([['#ffffff', 700], ['#111111', 300]]));
  assert.equal(mono.accent, null);
  assert.deepEqual(mono.colours, ['#111111']);
  assert.deepEqual(paletteFromPixels([]), { accent: null, colours: [] });
  // readable text on a brand-coloured button
  assert.equal(inkOn('#1d3557'), '#ffffff', 'navy: white text');
  assert.equal(inkOn('#ffd166'), '#14110e', 'yellow: dark text');
  assert.equal(inkOn('#b08d57'), '#14110e', 'the default gold keeps its dark text');
});

test('collision boxes: stand on one, get pushed off a turned wall, and pass untouched beside it', async () => {
  const { capsuleBoxPush, withColliders } = await import('../src/features/scene/collision.ts');
  const cap = (x, bottom, z, r = 0.3) => ({ start: { x, y: bottom + r, z }, end: { x, y: bottom + 1.65 - r, z }, radius: r });
  const close = (p, x, y, z) => assert.ok(p && Math.abs(p.x - x) < 1e-3 && Math.abs(p.y - y) < 1e-3 && Math.abs(p.z - z) < 1e-3, JSON.stringify(p));

  const floor = { position: [0, -0.5, 0], size: [10, 1, 10], yaw: 0 }; // top at y = 0
  close(capsuleBoxPush(cap(0, -0.1, 0), floor), 0, 0.1, 0); // sunk 0.1: up by 0.1
  close(capsuleBoxPush(cap(0, -0.8, 0), floor), 0, 0.8, 0); // segment inside: out the top
  assert.equal(capsuleBoxPush(cap(0, 0.05, 0), floor), null, 'standing clear above');

  // 2 wide, 3 tall, 0.2 thick, turned 90°: it runs along z at x = 5
  const wall = { position: [5, 1.5, 0], size: [2, 3, 0.2], yaw: 90 };
  close(capsuleBoxPush(cap(4.7, 0, 0), wall), -0.1, 0, 0);
  close(capsuleBoxPush(cap(5.3, 0, 0), wall), 0.1, 0, 0);
  assert.equal(capsuleBoxPush(cap(4.5, 0, 0), wall), null);
  assert.equal(capsuleBoxPush(cap(4.7, 0, 1.4), wall), null, 'past its end');

  // the wrapper adds boxes to the scan's own collision and passes the rest through
  const scan = { intersectsCapsule: () => ({ hit: false }), hasCollision: () => false, root: 'root', getBounds() { return this.root; } };
  let boxes = [];
  const r = withColliders(scan, () => boxes);
  assert.equal(r.hasCollision(), false);
  assert.equal(r.getBounds(), 'root');
  boxes = [wall];
  assert.equal(r.hasCollision(), true);
  const h = r.intersectsCapsule(cap(4.7, 0, 0));
  assert.ok(h.hit);
  close(h.delta, -0.1, 0, 0);
});

test('a hotspot lands on the surface in the middle of the view, not in the air', async () => {
  const { surfaceDistance } = await import('../src/features/scene/collision.ts');
  // a wall across the view at z = -5: a ball touches it once its front reaches the wall
  const wall = { intersectsCapsule: ({ start, radius }) => ({ hit: start.z - radius <= -5 }) };
  const d = surfaceDistance(wall, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: -1 }, 30, 0.04);
  assert.ok(Math.abs(d - 4.96) < 0.01, `stops at the wall: ${d}`);
  assert.equal(surfaceDistance(wall, { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 1 }, 30, 0.04), null, 'nothing that way');
  assert.equal(surfaceDistance(null, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, 30, 0.04), null, 'no scene: no answer');
});

test('a collision box lands where the middle of the view meets the scan, not 2 m ahead in mid-air', async () => {
  const { withColliders, boxSpotInView } = await import('../src/features/scene/collision.ts');
  // the scan: a wall across the view at z = -5; the boxes are added on top, as useSceneManager does
  const scan = { intersectsCapsule: ({ start, radius }) => ({ hit: start.z - radius <= -5 }) };
  let boxes = [];
  const r = withColliders(scan, () => boxes);
  const ahead = { x: 0, y: 0, z: -1 };

  const at = boxSpotInView(r, { x: 0, y: 1.6, z: 0 }, ahead, 1);
  assert.ok(Math.abs(at.z + 5) < 0.1 && Math.abs(at.x) < 1e-6, `at the wall: ${JSON.stringify(at)}`);
  assert.equal(Math.abs(at.yaw), 180, 'faces the camera');

  // the box being moved sits in the way: it must not land on its own front
  boxes = [{ position: [0, 1.25, -2], size: [4, 2.5, 0.2], yaw: 180 }];
  const past = boxSpotInView(r, { x: 1, y: 1.6, z: 0 }, ahead, 1);
  assert.ok(Math.abs(past.z + 5) < 0.1 && Math.abs(past.x - 1) < 1e-6, `past itself, to the wall: ${JSON.stringify(past)}`);

  const blind = boxSpotInView(null, { x: 0, y: 1.6, z: 0 }, ahead, 1); // nothing to measure: 2 ahead, as before
  assert.ok(Math.abs(blind.z + 2) < 1e-6, JSON.stringify(blind));

  // the studio's camera walks through the boxes it is placing; a visitor's (and Preview's) can't
  const { scanOf } = await import('../src/features/scene/collision.ts');
  const capAt = (z) => ({ start: { x: 0, y: 0.3, z }, end: { x: 0, y: 1.35, z }, radius: 0.3 });
  assert.ok(r.intersectsCapsule(capAt(-2)).hit, 'the tour bumps into the box');
  assert.equal(scanOf(r).intersectsCapsule(capAt(-2)).hit, false, 'the studio walks through it');
  assert.equal(scanOf(scan), scan, 'an unwrapped scan is itself');
  assert.equal(scanOf(null), null);
});

test('a table hotspot books its own dining place, never another one that happens to take bookings', async () => {
  const { livePlaces, bookableTable } = await import('../src/features/booking/booking.ts');
  const tables = (...ids) => ids.map((id) => ({ id }));
  const site = {
    booking: { on: true, plan: 'plan.png', tables: tables('T1', 'T2') },
    dining: [
      { id: 'cafe', name: 'The Café', booking: { on: false, plan: 'cafe.png', tables: tables('T1') } },
      { id: 'bar', name: 'The Bar', booking: { on: true, plan: 'bar.png', tables: tables('T1', 'B9') } },
      { id: 'roof', name: 'Roof', booking: { on: true, plan: '', tables: tables('R1') } }
    ]
  };
  // the studio preview lists what visitors get: places taking bookings, each with its own id and name
  const places = livePlaces(site);
  assert.deepEqual(places.map((p) => [p.outlet ?? '', p.name ?? '']), [['', ''], ['bar', 'The Bar']]);

  assert.deepEqual(bookableTable(places, '', 'T2'), { outlet: '', tableId: 'T2' }, 'main restaurant');
  assert.deepEqual(bookableTable(places, 'bar', 'T1'), { outlet: 'bar', tableId: 'T1' }, 'the bar’s T1, not the main T1');
  assert.equal(bookableTable(places, 'cafe', 'T1'), null, 'café booking is off: the hotspot’s own Book now, not the main restaurant');
  assert.equal(bookableTable(places, 'roof', 'R1'), null, 'no floor plan yet: not taking bookings');
  assert.equal(bookableTable(places, 'bar', 'T2'), null, 'a table the place no longer has');
  assert.equal(bookableTable(places, '', ''), null, 'a hotspot not linked to a table');
  assert.equal(bookableTable(undefined, '', 'T1'), null, 'project takes no table bookings');
});
