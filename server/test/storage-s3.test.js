/**
 * The S3 storage driver on its own, against the fake bucket (fakeS3.js):
 * every storage.js operation, and a floor plan drawn from a scan mesh that
 * lives only in the bucket.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createReadStream, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { startFakeS3 } from './fakeS3.js';

const S3 = { bucket: 'unit-bucket', accessKeyId: 'unit-key', secretAccessKey: 'unit-secret' };
let s3;
let storage;
let buildFloorPlan;
const TMP = mkdtempSync(path.join(tmpdir(), 'tv-s3-'));

before(async () => {
  s3 = await startFakeS3(S3);
  Object.assign(process.env, {
    ASSET_DRIVER: 's3', S3_ENDPOINT: s3.url, S3_BUCKET: S3.bucket, S3_REGION: 'auto',
    S3_ACCESS_KEY_ID: S3.accessKeyId, S3_SECRET_ACCESS_KEY: S3.secretAccessKey, ASSET_DIR: path.join(TMP, 'never-used')
  });
  storage = await import('../src/storage.js');
  ({ buildFloorPlan } = await import('../src/floorplan.js'));
});
after(async () => {
  await s3.close();
  rmSync(TMP, { recursive: true, force: true });
});

const text = async (stream) => { let s = ''; for await (const c of stream) s += c; return s; };

test('put, stat, read (whole and a byte range), list across pages, and remove', async () => {
  assert.equal(storage.DRIVER, 's3');
  // a file on disk (sent with its size) and an in-memory stream (spooled first)
  const file = path.join(TMP, 'meta.lcc2');
  writeFileSync(file, 'LCC2-HEADER-0123456789');
  await storage.put('ast_one', 'meta.lcc2', createReadStream(file));
  await storage.put('ast_one', 'data/tile 1.bin', Readable.from([Buffer.from('tile-one')]));
  for (let i = 2; i <= 6; i++) await storage.put('ast_one', `data/tile ${i}.bin`, Readable.from([Buffer.from(`tile-${i}`)]));
  await storage.put('ast_two', 'meta.lcc2', Readable.from([Buffer.from('other asset')]));

  assert.deepEqual(await storage.stat('ast_one', 'meta.lcc2'), { bytes: 22, contentType: 'application/octet-stream' });
  assert.equal(await text(storage.get('ast_one', 'meta.lcc2')), 'LCC2-HEADER-0123456789');
  assert.equal(await text(storage.get('ast_one', 'meta.lcc2', { range: { start: 5, end: 10 } })), 'HEADER');
  assert.equal((await storage.readAll('ast_one', 'data/tile 3.bin')).toString(), 'tile-3', 'spaces in keys survive signing');

  const files = await storage.list('ast_one');
  assert.equal(files.length, 7, 'all seven, across three pages of three');
  assert.ok(files.includes('data/tile 6.bin') && files.includes('meta.lcc2'));
  assert.deepEqual(await storage.list('ast_one', 'data/'), files.filter((f) => f.startsWith('data/')));
  assert.equal(await storage.exists('ast_two'), true);
  assert.equal(await storage.exists('ast_none'), false);

  await storage.remove('ast_one', 'data/tile 1.bin');
  assert.equal((await storage.list('ast_one')).length, 6);
  await storage.remove('ast_one');
  assert.equal(await storage.exists('ast_one'), false);
  assert.equal(await storage.exists('ast_two'), true, 'another asset is untouched');
  assert.equal(s3.stats.badSignatures, 0);
});

test('a missing file is ENOENT, and paths cannot climb out of their asset', async () => {
  await assert.rejects(storage.stat('ast_two', 'nope.bin'), { code: 'ENOENT' });
  await assert.rejects(storage.readAll('ast_two', 'nope.bin'), { code: 'ENOENT' });
  assert.throws(() => storage.get('ast_two', '../ast_one/meta.lcc2'), { status: 400 });
  assert.throws(() => storage.get('../x', 'meta.lcc2'), { status: 400 });
  await assert.rejects(storage.put('ast_two', '/etc/passwd', Readable.from(['x'])), { status: 400 });
});

/** A binary little-endian PLY of triangles (9 numbers each), like a Lixel export's collision mesh. */
function ply(tris) {
  const nv = tris.length / 3, nf = nv / 3;
  const head = Buffer.from(`ply\nformat binary_little_endian 1.0\nelement vertex ${nv}\nproperty float x\nproperty float y\nproperty float z\nelement face ${nf}\nproperty list uchar int vertex_indices\nend_header\n`);
  const body = Buffer.alloc(nv * 12 + nf * 13);
  tris.forEach((v, i) => body.writeFloatLE(v, i * 4));
  for (let f = 0, o = nv * 12; f < nf; f++, o += 13) {
    body[o] = 3;
    for (let k = 0; k < 3; k++) body.writeInt32LE(f * 3 + k, o + 1 + k * 4);
  }
  return Buffer.concat([head, body]);
}

test('a floor plan is drawn from a scan that lives only in the bucket', async () => {
  const quad = (a, b, c, d) => [...a, ...b, ...c, ...a, ...c, ...d];
  const wall = (x0, y0, x1, y1) => quad([x0, y0, 0], [x1, y1, 0], [x1, y1, 2.5], [x0, y0, 2.5]);
  const floor = quad([0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]);
  const room = [...floor, ...wall(0, 0, 4, 0), ...wall(4, 0, 4, 3), ...wall(4, 3, 0, 3), ...wall(0, 3, 0, 0)];
  const poses = { poses: Array.from({ length: 30 }, (_, i) => ({ T: [1 + (i % 15) * 0.15, 1.5, 1] })) };
  await storage.put('ast_scan', 'lcc2-result/data/mesh/mesh.ply', Readable.from([ply(room)]));
  await storage.put('ast_scan', 'lcc2-result/info/poses.json', Readable.from([Buffer.from(JSON.stringify(poses))]));

  const plan = await buildFloorPlan('ast_scan', 'Bucket room');
  assert.ok(plan, 'a plan was drawn');
  assert.deepEqual(plan.size, [4, 3]);
  assert.equal(plan.walls, 4);
  const stored = await storage.list('ast_scan', 'floorplan/');
  assert.deepEqual(stored.sort(), ['floorplan/3d-print.svg', 'floorplan/3d.svg', 'floorplan/plan-print.svg', 'floorplan/plan.json', 'floorplan/plan.svg']);
  assert.match((await storage.readAll('ast_scan', 'floorplan/plan.svg')).toString(), /Bucket room/);
  assert.equal(await buildFloorPlan('ast_two'), null, 'no mesh, no plan');
  assert.equal(s3.stats.badSignatures, 0);
});

test('npm run assets:push copies this PC’s uploads into the bucket, and skips what is already there', async () => {
  // not spawnSync: the fake bucket runs in this process and must keep answering
  const { execFile } = await import('node:child_process');
  const { mkdirSync } = await import('node:fs');
  const local = path.join(TMP, 'pc-assets');
  mkdirSync(path.join(local, 'ast_pc', 'data'), { recursive: true });
  writeFileSync(path.join(local, 'ast_pc', 'meta.lcc2'), 'on this PC only');
  writeFileSync(path.join(local, 'ast_pc', 'data', 'tile.bin'), 'tile bytes');
  const run = (...args) => new Promise((resolve) => {
    execFile(process.execPath, ['scripts/push-assets.js', ...args], {
      cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8',
      env: { ...process.env, ASSET_DIR: local, ASSET_DRIVER: '' }
    }, (err, stdout, stderr) => resolve({ status: err ? err.code ?? 1 : 0, stdout, stderr }));
  });
  const dry = await run('--dry-run');
  assert.match(dry.stdout, /Would send 2 file\(s\)/);
  assert.equal(await storage.exists('ast_pc'), false, 'a dry run sends nothing');
  const first = await run();
  assert.equal(first.status, 0, first.stderr);
  assert.match(first.stdout, /Sent 2 file\(s\)/);
  assert.equal((await storage.readAll('ast_pc', 'meta.lcc2')).toString(), 'on this PC only');
  assert.match((await run()).stdout, /Sent 0 file\(s\).*2 already there/s, 'a second run only sends what is new');
  assert.equal(s3.stats.badSignatures, 0);
});
