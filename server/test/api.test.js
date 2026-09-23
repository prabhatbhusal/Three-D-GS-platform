/**
 * Integration test for the API: starts the real server against a throwaway
 * data folder (DATA_DIR / ASSET_DIR), so it never touches real scenes.
 *
 *   cd server && npm test
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';

const PORT = 4900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = mkdtempSync(path.join(tmpdir(), 'tv-api-'));
let server;
let cookie = '';
let signedIn = '';

before(async () => {
  server = spawn(process.execPath, ['src/index.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: DATA,
      ASSET_DIR: path.join(DATA, 'assets'),
      SESSION_SECRET: 'test-secret',
      EDITOR_PASSWORD: 'test-pass',
      CLIENT_ORIGIN: 'http://localhost:3000'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server did not start')), 10000);
    server.stdout.on('data', (d) => { if (/listening/.test(d)) { clearTimeout(t); resolve(); } });
    server.on('exit', (c) => reject(new Error(`server exited ${c}`)));
  });
  // Once: the login route is rate-limited per IP, as it should be.
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-pass' })
  });
  assert.equal(res.status, 200);
  signedIn = res.headers.get('set-cookie').split(';')[0];
});

after(() => {
  server?.kill();
  rmSync(DATA, { recursive: true, force: true });
});

const api = async (method, url, body, headers = {}) => {
  const raw = body instanceof Uint8Array;
  const res = await fetch(BASE + url, {
    method,
    headers: { ...(body !== undefined && !raw ? { 'Content-Type': 'application/json' } : {}), cookie, ...headers },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, headers: res.headers };
};

const signIn = () => { cookie = signedIn; };

const sceneDoc = (id, extra = {}) => ({
  id, version: 2, propertyId: null, title: id,
  splat: { format: 'lcc2', variants: { high: { assetId: 'ast_test', meta: 'meta.lcc2' } } },
  spawn: { position: [1, 1.6, 2], yaw: 0, eyeHeight: 1.65 },
  hotspots: [], tracks: [],
  ...extra
});

/* ---------------------------------------------------------------- */
/* Properties                                                        */
/* ---------------------------------------------------------------- */

test('properties need a session', async () => {
  assert.equal((await api('GET', '/api/properties')).status, 401);
  assert.equal((await api('POST', '/api/properties', { title: 'Basera' })).status, 401);
});

test('create and list properties', async () => {
  signIn();
  const made = await api('POST', '/api/properties', { title: 'Basera Boutique Hotel' });
  assert.equal(made.status, 201);
  assert.equal(made.json.id, 'basera-boutique-hotel');

  assert.equal((await api('POST', '/api/properties', { title: 'Basera Boutique Hotel' })).status, 409, 'duplicate name');
  assert.equal((await api('POST', '/api/properties', { title: '   ' })).status, 400, 'blank name');
  assert.equal((await api('POST', '/api/properties', { title: '!!!' })).status, 400, 'no letters');
  assert.equal((await api('POST', '/api/properties', { title: 'x'.repeat(81) })).status, 400, 'too long');
  assert.equal((await api('POST', '/api/properties', { title: 'Nepathya College' })).status, 201);

  const list = await api('GET', '/api/properties');
  assert.deepEqual(list.json.map((p) => [p.id, p.spaceCount]), [['basera-boutique-hotel', 0], ['nepathya-college', 0]]);
});

test('move a space into a property and back out', async () => {
  signIn();
  assert.equal((await api('PUT', '/api/scenes/lobby', sceneDoc('lobby'))).status, 200);
  const listed = await api('GET', '/api/scenes');
  assert.equal(listed.json.find((s) => s.id === 'lobby').propertyId, null);

  const moved = await api('POST', '/api/scenes/lobby/property', { propertyId: 'basera-boutique-hotel' });
  assert.equal(moved.status, 200);
  assert.equal((await api('GET', '/api/scenes')).json.find((s) => s.id === 'lobby').propertyId, 'basera-boutique-hotel');
  assert.equal((await api('GET', '/api/properties')).json.find((p) => p.id === 'basera-boutique-hotel').spaceCount, 1);

  assert.equal((await api('POST', '/api/scenes/lobby/property', { propertyId: 'no-such-place' })).status, 400);
  assert.equal((await api('POST', '/api/scenes/lobby/property', { propertyId: 42 })).status, 400);
  assert.equal((await api('POST', '/api/scenes/nowhere/property', { propertyId: null })).status, 404);

  // Moving must not touch anything else in the draft.
  const doc = (await api('GET', '/api/scenes/lobby')).json;
  assert.deepEqual(doc.spawn.position, [1, 1.6, 2]);

  assert.equal((await api('POST', '/api/scenes/lobby/property', { propertyId: null })).status, 200);
  assert.equal((await api('GET', '/api/scenes')).json.find((s) => s.id === 'lobby').propertyId, null);
});

test('rename a property keeps its id and its spaces', async () => {
  signIn();
  await api('PUT', '/api/scenes/hall', sceneDoc('hall'));
  await api('POST', '/api/scenes/hall/property', { propertyId: 'nepathya-college' });
  const r = await api('PATCH', '/api/properties/nepathya-college', { title: '  Nepathya College, Kathmandu ' });
  assert.equal(r.status, 200);
  assert.deepEqual([r.json.id, r.json.title], ['nepathya-college', 'Nepathya College, Kathmandu']);
  const p = (await api('GET', '/api/properties')).json.find((x) => x.id === 'nepathya-college');
  assert.equal(p.spaceCount, 1, 'space still filed under it');
  assert.equal((await api('PATCH', '/api/properties/nepathya-college', { title: ' ' })).status, 400);
  assert.equal((await api('PATCH', '/api/properties/no-such', { title: 'X' })).status, 404);
  cookie = '';
  assert.equal((await api('PATCH', '/api/properties/nepathya-college', { title: 'X' })).status, 401);
});

test('delete a property releases its spaces and deletes none', async () => {
  signIn();
  const r = await api('DELETE', '/api/properties/nepathya-college');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { id: 'nepathya-college', released: 1 });
  assert.ok(!(await api('GET', '/api/properties')).json.some((x) => x.id === 'nepathya-college'));
  const hall = (await api('GET', '/api/scenes')).json.find((s) => s.id === 'hall');
  assert.ok(hall, 'the space still exists');
  assert.equal(hall.propertyId, null);
  assert.equal((await api('DELETE', '/api/properties/nepathya-college')).status, 404);
  // the name is free again
  assert.equal((await api('POST', '/api/properties', { title: 'Nepathya College' })).status, 201);
});

/* ---------------------------------------------------------------- */
/* Book now + publish checks                                         */
/* ---------------------------------------------------------------- */

test('booking defaults to off on docs that predate it', async () => {
  signIn();
  await api('PUT', '/api/scenes/old-doc', sceneDoc('old-doc'));
  assert.equal((await api('GET', '/api/scenes/old-doc')).json.booking, null);
});

test('publish blocks a Book now link that is not a web address', async () => {
  signIn();
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', '', 'basera.com/book']) {
    await api('PUT', '/api/scenes/bookme', sceneDoc('bookme', { booking: { enabled: true, label: 'Book now', url } }));
    const r = await api('POST', '/api/scenes/bookme/publish');
    assert.equal(r.status, 422, `should block ${JSON.stringify(url)}`);
    assert.match(r.json.blockers.join(' '), /Book now/);
  }
  await api('PUT', '/api/scenes/bookme', sceneDoc('bookme', { booking: { enabled: true, label: 'Book now', url: 'https://basera.com/book' } }));
  assert.equal((await api('POST', '/api/scenes/bookme/publish')).status, 200);
  // Switched off, a bad link doesn't matter: it is never shown.
  await api('PUT', '/api/scenes/bookme', sceneDoc('bookme', { booking: { enabled: false, label: 'Book now', url: 'javascript:x' } }));
  assert.equal((await api('POST', '/api/scenes/bookme/publish')).status, 200);
});

test('publish warns when hotspot audio has no transcript', async () => {
  signIn();
  const hs = (transcript) => ({
    id: 'hs1', type: 'text', position: [0, 1, 0], radius: 0.4, label: 'Bar', occludedBy: 'none',
    payload: { text: 'Hi', audio: 'asset://ast_a/voice.m4a', ...(transcript === undefined ? {} : { transcript }) }
  });
  await api('PUT', '/api/scenes/talky', sceneDoc('talky', { hotspots: [hs()] }));
  let r = await api('GET', '/api/scenes/talky/publish');
  assert.match(r.json.warnings.join(' '), /"Bar" has audio but no transcript/);
  await api('PUT', '/api/scenes/talky', sceneDoc('talky', { hotspots: [hs('Welcome to the bar.')] }));
  r = await api('GET', '/api/scenes/talky/publish');
  assert.doesNotMatch(r.json.warnings.join(' '), /transcript/);
});

/* ---------------------------------------------------------------- */
/* Audio upload (§6.3)                                               */
/* ---------------------------------------------------------------- */

/** A minimal MP4 header: box size, "ftyp", brand "M4A ", then padding. */
const m4a = (bytes = 64) => {
  const b = new Uint8Array(bytes);
  b.set([0, 0, 0, 24], 0);
  b.set(new TextEncoder().encode('ftypM4A '), 4);
  return b;
};

const EIGHT_MB = 8 * 1024 * 1024;

async function uploadAudio(name, bytes) {
  const { json: { assetId } } = await api('POST', '/api/assets');
  await api('POST', `/api/assets/${assetId}/files`, { relPath: name });
  for (let off = 0; off < bytes.length; off += EIGHT_MB) {
    const r = await api('PUT', `/api/assets/${assetId}/files/chunk?relPath=${encodeURIComponent(name)}&offset=${off}`,
      bytes.subarray(off, off + EIGHT_MB), { 'Content-Type': 'application/octet-stream' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  return { assetId, fin: await api('POST', `/api/assets/${assetId}/finalize?kind=audio`) };
}

const stagingGone = (assetId) => !existsSync(path.join(DATA, 'uploads-staging', assetId));

test('a real .m4a uploads and streams back with ranges', async () => {
  signIn();
  const { assetId, fin } = await uploadAudio('voice.m4a', m4a(4000));
  assert.equal(fin.status, 200, JSON.stringify(fin.json));
  assert.deepEqual(fin.json, { assetId, bytes: 4000, file: 'voice.m4a' });
  assert.ok(stagingGone(assetId), 'staging cleaned up');

  const whole = await fetch(`${BASE}/api/assets/${assetId}/voice.m4a`);
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get('content-type'), 'audio/mp4');
  assert.equal((await whole.arrayBuffer()).byteLength, 4000);

  const part = await fetch(`${BASE}/api/assets/${assetId}/voice.m4a`, { headers: { Range: 'bytes=0-11' } });
  assert.equal(part.status, 206);
  assert.equal(new TextDecoder().decode((await part.arrayBuffer()).slice(4, 8)), 'ftyp');
});

test('audio in the wrong format, renamed, or over 2 MB is refused and not stored', async () => {
  signIn();
  const huge = new Uint8Array(2 * 1024 * 1024 + 1);
  huge.set(m4a(12));
  const cases = [
    ['song.mp3', m4a(), /\.m4a file/],
    ['renamed.m4a', new Uint8Array(64).fill(7), /isn't really an \.m4a/],
    ['huge.m4a', huge, /capped at 2 MB/]
  ];
  for (const [name, bytes, msg] of cases) {
    const { assetId, fin } = await uploadAudio(name, bytes);
    assert.equal(fin.status, 400, name);
    assert.match(fin.json.error, msg, name);
    assert.ok(stagingGone(assetId), `${name}: staging cleaned up after refusal`);
    assert.equal((await fetch(`${BASE}/api/assets/${assetId}/${name}`)).status, 404, `${name}: nothing stored`);
  }
});

test('exactly 2 MB of audio is allowed', async () => {
  signIn();
  const b = new Uint8Array(2 * 1024 * 1024);
  b.set(m4a(12));
  assert.equal((await uploadAudio('edge.m4a', b)).fin.status, 200);
});

test('two audio files in one upload are refused', async () => {
  signIn();
  const { json: { assetId } } = await api('POST', '/api/assets');
  for (const n of ['a.m4a', 'b.m4a']) {
    await api('PUT', `/api/assets/${assetId}/files/chunk?relPath=${n}&offset=0`, m4a(), { 'Content-Type': 'application/octet-stream' });
  }
  const fin = await api('POST', `/api/assets/${assetId}/finalize?kind=audio`);
  assert.equal(fin.status, 400);
  assert.match(fin.json.error, /one audio file/);
});

test('a splat finalize still demands an .lcc2 index', async () => {
  signIn();
  const { json: { assetId } } = await api('POST', '/api/assets');
  await api('PUT', `/api/assets/${assetId}/files/chunk?relPath=voice.m4a&offset=0`, m4a(), { 'Content-Type': 'application/octet-stream' });
  const fin = await api('POST', `/api/assets/${assetId}/finalize`);
  assert.equal(fin.status, 400);
  assert.match(fin.json.error, /\.lcc2/);
});

/* ---- 3D models: the studio converts them, the server gets one .glb ---- */

const text = (s) => new TextEncoder().encode(s);

/** Stages each [relPath, bytes] in one asset, then finalizes it. */
async function uploadModel(files) {
  const { json: { assetId } } = await api('POST', '/api/assets');
  for (const [name, bytes] of files) {
    const r = await api('PUT', `/api/assets/${assetId}/files/chunk?relPath=${encodeURIComponent(name)}&offset=0`,
      bytes, { 'Content-Type': 'application/octet-stream' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  }
  return { assetId, fin: await api('POST', `/api/assets/${assetId}/finalize`) };
}

/** A minimal GLB: header, a JSON chunk, and a BIN chunk of repetitive
 *  bytes (so gzip visibly shrinks it). Only the JSON matters to the server. */
function glb(gltf, binBytes = 4096) {
  const pad4 = (n) => (n + 3) & ~3;
  const json = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, ...gltf }));
  const jsonLen = pad4(json.length);
  const out = Buffer.alloc(12 + 8 + jsonLen + 8 + binBytes, 0x20);
  out.write('glTF', 0, 'latin1');
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonLen, 12);
  out.write('JSON', 16, 'latin1');
  json.copy(out, 20);
  out.writeUInt32LE(binBytes, 20 + jsonLen);
  out.write('BIN\0', 24 + jsonLen, 'latin1');
  out.fill(7, 28 + jsonLen);
  return new Uint8Array(out);
}
const mesh = (mode) => ({ primitives: [{ attributes: { POSITION: 0 }, mode }] });

test('a converted .glb uploads, says mesh or point cloud, and is sent gzipped', async () => {
  signIn();
  let { assetId, fin } = await uploadModel([['lobby.glb', glb({ meshes: [mesh(4)], nodes: [{ mesh: 0 }] }, 200000)]]);
  assert.equal(fin.status, 200, JSON.stringify(fin.json));
  assert.deepEqual([fin.json.format, fin.json.kind, fin.json.meta], ['glb', 'mesh', 'lobby.glb']);
  assert.ok(stagingGone(assetId));

  const gz = await fetch(`${BASE}/api/assets/${assetId}/lobby.glb`, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(gz.headers.get('content-encoding'), 'gzip');
  assert.ok(Number(gz.headers.get('content-length')) < fin.json.bytes / 10, 'the gzipped copy is what goes out');
  assert.equal((await gz.arrayBuffer()).byteLength, fin.json.bytes, 'and it unpacks to the same file');
  const ranged = await fetch(`${BASE}/api/assets/${assetId}/lobby.glb`, { headers: { 'Accept-Encoding': 'gzip', Range: 'bytes=0-3' } });
  assert.equal(ranged.status, 206, 'a byte range still gets the raw file');
  assert.equal(ranged.headers.get('content-encoding'), null);

  // A point cloud: drawn as points, plus the hidden walkable floor.
  ({ fin } = await uploadModel([['scan.glb', glb({
    meshes: [mesh(0), mesh(4)], nodes: [{ mesh: 0 }, { mesh: 1, name: 'rcaas-collision' }]
  })]]));
  assert.equal(fin.json.kind, 'points');
});

test('a file that isn\'t a GLB, or a model that skipped conversion, is refused', async () => {
  signIn();
  let { assetId, fin } = await uploadModel([['fake.glb', text('not really a glb at all, just words')]]);
  assert.equal(fin.status, 400);
  assert.match(fin.json.error, /isn't a GLB/);
  assert.ok(stagingGone(assetId));

  ({ fin } = await uploadModel([['empty.glb', glb({ meshes: [] })]]));
  assert.match(fin.json.error, /no geometry/);

  ({ fin } = await uploadModel([['hall/hall.fbx', text('Kaydara FBX Binary')], ['hall/wood.jpg', text('jpeg')]]));
  assert.equal(fin.status, 400);
  assert.match(fin.json.error, /converted in the studio/);
});

test('the scene list carries the format, and a large model gets a publish warning', async () => {
  signIn();
  const doc = (bytes) => sceneDoc('meshy', {
    splat: { format: 'glb', variants: { high: { assetId: 'ast_mesh', meta: 'scan.glb', bytes } } }
  });
  await api('PUT', '/api/scenes/meshy', doc(80e6));
  const listed = (await api('GET', '/api/scenes')).json.find((s) => s.id === 'meshy');
  assert.equal(listed.format, 'glb');
  const warn = (await api('GET', '/api/scenes/meshy/publish')).json.warnings.join(' ');
  assert.match(warn, /GLB model is 80 MB and loads whole/);
  assert.doesNotMatch(warn, /medium or low variant/); // variants are an LCC thing

  await api('PUT', '/api/scenes/meshy', doc(5e6));
  assert.doesNotMatch((await api('GET', '/api/scenes/meshy/publish')).json.warnings.join(' '), /loads whole/);
});


test('an asset id can never climb out of the data folder', async () => {
  signIn();
  // Raw path: fetch() and a URL string both normalise the %2E%2E segment away
  // before sending, which would test nothing.
  const status = await new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: PORT, method: 'POST', headers: { cookie },
      path: '/api/assets/%2E%2E/finalize?kind=audio'
    }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 400);
  assert.ok(readdirSync(path.join(DATA, 'scenes')).length > 0, 'data folder untouched');
});
