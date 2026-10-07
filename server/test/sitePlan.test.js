import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSite } from '../src/routes/sites.js';

test('a booking plan is an uploaded photo or a space’s floor plan file, nothing else', () => {
  const plan = (p) => cleanSite({ booking: { plan: p }, stays: { plan: p } }, 'demo');
  for (const ok of ['site_demo/img-1-800x600.png', 'ast_1a0dff89ca06/floorplan/plan.svg', 'ast_1a0dff89ca06/floorplan/plan-print.svg', 'ast_1a0dff89ca06/floorplan/uploaded.webp']) {
    assert.equal(plan(ok).booking.plan, ok, ok);
    assert.equal(plan(ok).stays.plan, ok, ok);
  }
  for (const bad of ['site_other/img-1.png', 'ast_x/floorplan/plan.json', 'ast_x/floorplan/../../secret.svg', '../ast_x/floorplan/plan.svg', 'ast_x/hero.lcc2', 'https://x.test/plan.svg']) {
    assert.equal(plan(bad).booking.plan, '', bad);
    assert.equal(plan(bad).stays.plan, '', bad);
  }
});
