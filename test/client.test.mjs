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
