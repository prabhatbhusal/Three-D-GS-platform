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
import { siteAllowed, siteOf } from '../src/routes/embed.js';
import { phoneOf } from '../src/notify.js';
import { startFakeS3 } from './fakeS3.js';

// api-s3.test.js runs this whole suite again with uploads stored in a (fake) S3 bucket.
const USE_S3 = process.env.API_TEST_STORAGE === 's3';
const S3 = { bucket: 'test-bucket', accessKeyId: 'test-key', secretAccessKey: 'test-s3-secret' };
let s3 = null;
// A port the OS says is free: two suites run side by side, and the server stops
// a copy of itself it finds on its port (index.js), so they must never share one.
const freePort = () => new Promise((resolve) => {
  const probe = http.createServer().listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
let PORT;
let BASE;
const DATA = mkdtempSync(path.join(tmpdir(), 'tv-api-'));
let server;
let cookie = '';
let signedIn = '';

// A stand-in for the email service (mailer.js): records what it's sent.
const mailbox = [];
const mailServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    mailbox.push({ auth: req.headers.authorization, ...JSON.parse(body) });
    res.writeHead(200, { 'Content-Type': 'application/json' }).end('{"id":"m1"}');
  });
});

// And for SMS (Sparrow) and WhatsApp (Meta): records each message's path, headers and body.
const texts = [];
// ...and Anthropic's Messages API for the concierge: answers with `modelReply`.
let modelReply = { answer: '' };
const textServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    texts.push({ url: req.url, auth: req.headers.authorization, key: req.headers['x-api-key'], body: req.headers['content-type']?.includes('json') ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body)) });
    const reply = req.url === '/anthropic' ? { content: [{ type: 'tool_use', name: 'reply', input: modelReply }] } : {};
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(reply));
  });
});

before(async () => {
  await new Promise((r) => mailServer.listen(0, '127.0.0.1', r));
  await new Promise((r) => textServer.listen(0, '127.0.0.1', r));
  const textUrl = `http://127.0.0.1:${textServer.address().port}`;
  PORT = await freePort();
  BASE = `http://127.0.0.1:${PORT}`;
  if (USE_S3) s3 = await startFakeS3(S3);
  server = spawn(process.execPath, ['src/index.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      DATA_DIR: DATA,
      ASSET_DIR: path.join(DATA, 'assets'),
      SESSION_SECRET: 'test-secret',
      EDITOR_PASSWORD: 'test-pass',
      EMBED_TOKEN_SECRET: 'test-embed-secret',
      AUTH_RATE_MAX: '100', // the suite signs up many accounts from one IP
      LEADS_RATE_MAX: '100',
      STATS_RATE_MAX: '1000',
      RESERVE_RATE_MAX: '100',
      SCHEDULE_TICK_MS: '200', // scheduled websites go live within a fifth of a second
      RESEND_API_KEY: 'test-mail-key',
      RESEND_API_URL: `http://127.0.0.1:${mailServer.address().port}/emails`,
      LEADS_TO: '',
      CLIENT_ORIGIN: 'http://localhost:3000',
      SMS_TOKEN: 'test-sms-token', SMS_FROM: 'TestHotel', SMS_API_URL: `${textUrl}/sms/`,
      WHATSAPP_TOKEN: 'test-wa-token', WHATSAPP_PHONE_ID: '1234', WHATSAPP_API_URL: `${textUrl}/wa`, WHATSAPP_TEMPLATE: '',
      ANTHROPIC_API_KEY: 'test-anthropic-key', ANTHROPIC_API_URL: `${textUrl}/anthropic`, CONCIERGE_MODEL: 'test-model',
      ...(s3 ? {
        ASSET_DRIVER: 's3', S3_ENDPOINT: s3.url, S3_BUCKET: S3.bucket, S3_REGION: 'auto',
        S3_ACCESS_KEY_ID: S3.accessKeyId, S3_SECRET_ACCESS_KEY: S3.secretAccessKey
      } : {})
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
  mailServer.close();
  textServer.close();
  s3?.close();
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

test('embed sites reject dangerous protocol strings and spoofed hostnames', () => {
  assert.equal(siteOf('javascript:alert(1)'), '');
  assert.equal(siteOf('data:text/html;base64,abc'), '');
  assert.equal(siteOf('https://sub.example.com'), 'sub.example.com');
  assert.equal(siteAllowed('javascript:alert(1)', ['example.com']), false);
  assert.equal(siteAllowed('https://sub.example.com', ['example.com']), true);
  assert.equal(siteAllowed('https://example.com.evil.test', ['example.com']), false);
});

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
/* Accounts and project ownership (2026-09-24)                       */
/* ---------------------------------------------------------------- */

/** Signs up a named account and returns its own session cookie — separate
 *  from the shared `cookie`/`signIn()` used by the legacy-password tests
 *  above, so switching between two people's sessions in one test is just
 *  swapping which cookie string `cookie` holds. */
async function signUpUser(name, email) {
  const res = await api('POST', '/api/auth/signup', { name, email, password: 'plenty-long-8', accessCode: 'test-pass' });
  assert.equal(res.status, 201, `signup for ${email}`);
  return { user: res.json.user, cookie: res.headers.get('set-cookie').split(';')[0] };
}

test('the first account ever created becomes admin; later ones are editors', async () => {
  // A fresh DATA_DIR (no users yet) would make this deterministic, but the
  // suite shares one across the whole file — so this only holds if no
  // account exists yet at this point in the run. It's the first signup test.
  const first = await signUpUser('First Admin', 'first@geonova.com.np');
  assert.equal(first.user.role, 'admin');

  const second = await signUpUser('Second Person', 'second@geonova.com.np');
  assert.equal(second.user.role, 'editor');

  cookie = second.cookie;
  assert.equal((await api('GET', '/api/team')).status, 403, 'an editor cannot see the team');
});

test('a project belongs to whoever created it; only the owner, an admin, or a shared member can see it', async () => {
  const owner = await signUpUser('Gwarko Owner', 'owner@geonova.com.np');
  const stranger = await signUpUser('Stranger', 'stranger@geonova.com.np');

  cookie = owner.cookie;
  const made = await api('POST', '/api/properties', { title: 'Gwarko Overpass' });
  assert.equal(made.status, 201);
  assert.equal(made.json.ownerId, owner.user.id);
  const id = made.json.id;

  // the owner sees it in their list and can open it directly
  assert.ok((await api('GET', '/api/properties')).json.some((p) => p.id === id));
  assert.equal((await api('GET', `/api/properties/${id}`)).status, 200);

  // a stranger sees neither
  cookie = stranger.cookie;
  assert.ok(!(await api('GET', '/api/properties')).json.some((p) => p.id === id), 'not in their list');
  assert.equal((await api('GET', `/api/properties/${id}`)).status, 404, 'not by id either — no existence leak');
  // invisible to them entirely, so every action reads as "not found", not
  // "forbidden" — same reasoning as the GET above
  assert.equal((await api('PATCH', `/api/properties/${id}`, { title: 'Renamed' })).status, 404, 'cannot rename');
  assert.equal((await api('DELETE', `/api/properties/${id}`)).status, 404, 'cannot delete');
  assert.equal((await api('POST', `/api/properties/${id}/members`, { email: 'stranger@geonova.com.np' })).status, 404, 'cannot share it either');

  // the legacy shared-password session is still full-access (old behaviour)
  signIn();
  assert.equal((await api('PATCH', `/api/properties/${id}`, { title: 'Gwarko Overpass, Lalitpur' })).status, 200);

  // being an admin doesn't show you other people's work (2026-09-27)
  const admin = 'first@geonova.com.np'; // created in the previous test, still the only admin
  const adminLogin = await api('POST', '/api/auth/login', { email: admin, password: 'plenty-long-8' });
  cookie = adminLogin.headers.get('set-cookie').split(';')[0];
  assert.ok(!(await api('GET', '/api/properties')).json.some((p) => p.id === id), 'not in the admin’s list');
  assert.equal((await api('GET', `/api/properties/${id}`)).status, 404, 'nor by id');
});

test('a project from before accounts shows only as a name to claim; the claimer then has it alone', async () => {
  signIn(); // the shared team password makes projects with no owner, like the old ones
  const id = (await api('POST', '/api/properties', { title: 'Old Unowned Hotel' })).json.id;
  await api('PUT', '/api/scenes/unowned-lobby', sceneDoc('unowned-lobby', { propertyId: id, title: 'Lobby' }));
  await api('PUT', `/api/properties/${id}/theme`, { brand: 'Private brand' });

  const me = await signUpUser('Claimer', 'claimer@geonova.com.np');
  const friend = await signUpUser('Friend', 'friend@geonova.com.np');
  cookie = me.cookie;
  const listed = (await api('GET', '/api/properties')).json.find((p) => p.id === id);
  assert.deepEqual([listed.claimable, listed.title, listed.theme], [true, 'Old Unowned Hotel', undefined], 'a name, nothing more');
  assert.equal((await api('GET', `/api/properties/${id}`)).status, 404, 'unclaimed: not openable');
  assert.equal((await api('GET', '/api/scenes/unowned-lobby')).status, 403, 'nor its spaces');

  const claimed = await api('POST', `/api/properties/${id}/claim`);
  assert.equal(claimed.status, 200);
  assert.equal(claimed.json.ownerId, me.user.id);
  assert.equal((await api('GET', `/api/properties/${id}`)).status, 200);
  assert.equal((await api('GET', '/api/scenes/unowned-lobby')).status, 200, 'its spaces come with it');

  cookie = friend.cookie;
  assert.ok(!(await api('GET', '/api/properties')).json.some((p) => p.id === id), 'gone from the friend’s list');
  assert.equal((await api('POST', `/api/properties/${id}/claim`)).status, 409, 'and not claimable twice');
  assert.equal((await api('GET', '/api/scenes/unowned-lobby')).status, 403);
});

test('sharing a project adds a member who can then see and manage it, until removed', async () => {
  const owner = await signUpUser('Chilancho Owner', 'chilancho-owner@geonova.com.np');
  const teammate = await signUpUser('Teammate', 'teammate@geonova.com.np');

  cookie = owner.cookie;
  const made = await api('POST', '/api/properties', { title: 'Chilancho Stupa' });
  const id = made.json.id;

  assert.equal((await api('POST', `/api/properties/${id}/members`, { email: 'no-such-person@geonova.com.np' })).status, 404, 'no account with that email');
  const shared = await api('POST', `/api/properties/${id}/members`, { email: teammate.user.email });
  assert.equal(shared.status, 200);
  assert.deepEqual(shared.json.members, [teammate.user.id]);

  cookie = teammate.cookie;
  assert.ok((await api('GET', '/api/properties')).json.some((p) => p.id === id), 'now in their list');
  const detail = await api('GET', `/api/properties/${id}`);
  assert.equal(detail.json.ownerName, 'Chilancho Owner');
  assert.deepEqual(detail.json.memberDetails, [{ id: teammate.user.id, name: 'Teammate', email: teammate.user.email }]);
  // a member isn't the owner, so can rename it (owner or admin, and null owners
  // don't apply here) — actually only the owner/admin can manage it:
  assert.equal((await api('PATCH', `/api/properties/${id}`, { title: 'X' })).status, 403, 'a member can see it but not manage it');

  cookie = owner.cookie;
  const removed = await api('DELETE', `/api/properties/${id}/members/${teammate.user.id}`);
  assert.equal(removed.status, 200);
  assert.deepEqual(removed.json.members, []);

  cookie = teammate.cookie;
  assert.equal((await api('GET', `/api/properties/${id}`)).status, 404, 'access revoked');
});

test('a client\'s staff answer enquiries and bookings and read the report, and reach nothing else', async () => {
  const owner = await signUpUser('Staff Owner', 'staffowner@geonova.com.np');

  cookie = owner.cookie;
  const pid = (await api('POST', '/api/properties', { title: 'Himal Staff Cafe' })).json.id;
  await api('PUT', '/api/scenes/himal-hall', sceneDoc('himal-hall', { propertyId: pid }));
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 3)]);
  const plan = (await api('POST', `/api/sites/${pid}/images`, new Uint8Array(png), { 'Content-Type': 'application/octet-stream' })).json.path;
  await api('PUT', `/api/sites/${pid}/draft`, {
    booking: { on: true, plan, timezone: 'UTC', first: '18:00', last: '20:00', tables: [{ id: 't1', label: 'T1', seats: 4, x: 0.5, y: 0.5 }] }
  });
  await api('POST', `/api/sites/${pid}/publish`);
  // invited, not signed up: the team's code is never given to a client. A new email gets a
  // staff account and a one-time link to set its password.
  const added = await api('POST', `/api/properties/${pid}/members`, { email: 'host@himalcafe.test', as: 'staff', name: 'Restaurant Host' });
  assert.equal(added.status, 200);
  assert.match(added.json.invite.path, /^\/login\?reset=[\w-]{20,}$/);
  const token = added.json.invite.path.split('reset=')[1];
  const again = await api('POST', `/api/properties/${pid}/members`, { email: 'host@himalcafe.test', as: 'staff' });
  assert.equal(again.json.invite, undefined, 'a link only when the account is made');
  assert.equal((await api('POST', `/api/properties/${pid}/members`, { email: 'host@himalcafe.test' })).status, 400, 'a staff account is never a full member');
  assert.equal((await api('POST', `/api/properties/${pid}/members`, { email: 'nobody@nowhere.test' })).status, 404, 'full members still need an account');
  cookie = '';
  const set = await api('POST', '/api/auth/reset', { token, password: 'host-password-9' });
  assert.equal(set.status, 200);
  const host = { user: set.json.user, cookie: set.headers.get('set-cookie').split(';')[0] };
  assert.equal(host.user.role, 'staff');
  cookie = owner.cookie;
  assert.deepEqual([added.json.staff, added.json.members], [[host.user.id], []]);
  assert.deepEqual((await api('GET', `/api/properties/${pid}`)).json.staffDetails.map((u) => u.email), ['host@himalcafe.test']);

  // a guest books a table and sends an enquiry
  cookie = '';
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const booked = await api('POST', `/api/sites/${pid}/reservations`, {
    table: 't1', date: tomorrow, time: '19:00', party: 2, name: 'Guest', phone: '9800000003', formRenderedAt: Date.now() - 5000
  });
  assert.equal(booked.status, 201);
  const asked = await api('POST', '/api/leads', { sceneId: 'himal-hall', name: 'Asker', phone: '9800000004', message: 'Parking?', formRenderedAt: Date.now() - 5000 });
  assert.ok(asked.json.id, 'the enquiry is stored');

  cookie = host.cookie;
  const list = (await api('GET', '/api/properties')).json;
  const mine = list.find((p) => p.id === pid);
  assert.equal(mine.access, 'staff');
  assert.deepEqual([mine.members, mine.staff, mine.spaceCount], [[], [], 0], 'no one’s details, no spaces');
  assert.deepEqual(Object.keys((await api('GET', `/api/properties/${pid}`)).json).sort(), ['access', 'id', 'members', 'ownerId', 'spaceCount', 'staff', 'theme', 'title']);
  // what they're there for
  const inbox = await api('GET', `/api/sites/${pid}/reservations`);
  assert.equal(inbox.status, 200);
  assert.equal((await api('PATCH', `/api/sites/${pid}/reservations/${inbox.json.reservations[0].id}`, { status: 'confirmed' })).json.status, 'confirmed');
  assert.equal((await api('GET', `/api/properties/${pid}/leads`)).json.leads.length, 1);
  assert.equal((await api('GET', `/api/properties/${pid}/leads.csv`)).status, 200);
  assert.equal((await api('GET', `/api/properties/${pid}/report`)).status, 200);
  // and nothing else: the spaces, the website, the settings, the log
  assert.ok(!(await api('GET', '/api/scenes')).json.some((s) => s.id === 'himal-hall'), 'no spaces in their list');
  for (const [method, url, body] of [
    ['GET', '/api/scenes/himal-hall'], ['PUT', '/api/scenes/himal-hall', sceneDoc('himal-hall', { propertyId: pid })],
    ['GET', `/api/sites/${pid}/draft`], ['PUT', `/api/sites/${pid}/draft`, {}], ['POST', `/api/sites/${pid}/publish`],
    ['GET', `/api/sites/${pid}/preview`], ['GET', `/api/properties/${pid}/activity`],
    ['PATCH', `/api/properties/${pid}`, { title: 'Mine now' }], ['PUT', `/api/properties/${pid}/theme`, { accent: '#000000' }],
    ['POST', `/api/properties/${pid}/members`, { email: 'host@himalcafe.test' }], ['DELETE', `/api/properties/${pid}`],
    // nothing of their own either: no projects, no spaces, no uploads, no claiming
    ['POST', '/api/properties', { title: 'Host Side Project' }], ['PUT', '/api/scenes/host-space', sceneDoc('host-space')],
    ['POST', '/api/assets'], ['GET', '/api/team']
  ]) {
    const r = await api(method, url, body);
    assert.ok([403, 404].includes(r.status), `${method} ${url} answered ${r.status}`);
  }
  assert.ok(!(await api('GET', '/api/properties')).json.some((p) => p.claimable), 'no projects from before accounts to claim');

  signIn(); // the team's admin can't make a client's staff account a team account
  assert.equal((await api('PATCH', `/api/team/${host.user.id}/role`, { role: 'admin' })).status, 400);

  // removed: back to nothing
  cookie = owner.cookie;
  await api('DELETE', `/api/properties/${pid}/members/${host.user.id}`);
  cookie = host.cookie;
  assert.equal((await api('GET', `/api/sites/${pid}/reservations`)).status, 404);
  assert.ok(!(await api('GET', '/api/properties')).json.some((p) => p.id === pid));
});

test('a project\'s spaces and their files are only for people who can see the project', async () => {
  const owner = await signUpUser('Space Owner', 'space-owner@geonova.com.np');
  const outsider = await signUpUser('Outsider', 'outsider@geonova.com.np');
  const helper = await signUpUser('Helper', 'helper@geonova.com.np');

  cookie = owner.cookie;
  const pid = (await api('POST', '/api/properties', { title: 'Private Hotel' })).json.id;
  const { assetId } = await uploadModel([['private-lobby.glb', glb({ meshes: [mesh(4)], nodes: [{ mesh: 0 }] })]]);
  const doc = sceneDoc('private-lobby', { propertyId: pid, splat: { format: 'glb', variants: { high: { assetId, meta: 'private-lobby.glb' } } } });
  assert.equal((await api('PUT', '/api/scenes/private-lobby', doc)).status, 200);
  assert.ok((await api('GET', '/api/scenes')).json.some((s) => s.id === 'private-lobby'), 'the owner lists it');

  cookie = outsider.cookie;
  assert.ok(!(await api('GET', '/api/scenes')).json.some((s) => s.id === 'private-lobby'), 'not in an outsider\'s list');
  assert.equal((await api('PUT', '/api/scenes/private-lobby', { ...doc, title: 'Mine now' })).status, 403, 'cannot save over it');
  assert.equal((await api('POST', '/api/scenes/private-lobby/publish')).status, 403, 'cannot publish it');
  assert.equal((await api('POST', '/api/scenes/private-lobby/unpublish')).status, 403);
  assert.equal((await api('POST', '/api/scenes/private-lobby/property', { propertyId: null })).status, 403, 'cannot pull it out of the project');
  assert.equal((await api('PUT', '/api/scenes/outsider-room', sceneDoc('outsider-room', { propertyId: pid }))).status, 403, 'cannot file a space into it');
  assert.equal((await api('POST', `/api/assets/${assetId}/floorplan`)).status, 403, 'cannot redraw its plan');
  assert.equal((await api('DELETE', `/api/assets/${assetId}/floorplan/upload`)).status, 403, 'cannot remove its plan');
  assert.equal((await api('PATCH', `/api/assets/${assetId}/floorplan/rooms`, { names: { r1: 'Mine' } })).status, 403, 'cannot rename its rooms');
  assert.equal((await api('DELETE', `/api/assets/${assetId}`)).status, 403, 'cannot delete its model');
  assert.equal((await fetch(`${BASE}/api/assets/${assetId}/private-lobby.glb`)).status, 200, 'the model itself still streams to visitors');

  cookie = owner.cookie; // naming rooms: a checked body, and only once there's a plan drawn from a scan
  assert.equal((await api('PATCH', `/api/assets/${assetId}/floorplan/rooms`, { names: ['Lobby'] })).status, 400);
  assert.equal((await api('PATCH', `/api/assets/${assetId}/floorplan/rooms`, { names: { lobby: 'Lobby' } })).status, 400, 'room ids only');
  assert.equal((await api('PATCH', `/api/assets/${assetId}/floorplan/rooms`, { names: { r1: 'Lobby' } })).status, 404, 'a 3D model has no drawn plan');

  // added to the project, a teammate can work on it
  cookie = owner.cookie;
  await api('POST', `/api/properties/${pid}/members`, { email: helper.user.email });
  cookie = helper.cookie;
  assert.equal((await api('PUT', '/api/scenes/private-lobby', { ...doc, title: 'Lobby, retouched' })).status, 200);
  assert.ok((await api('GET', '/api/scenes')).json.some((s) => s.id === 'private-lobby'));

  // a space in no project is its creator's alone (2026-09-27)
  cookie = outsider.cookie;
  assert.equal((await api('PUT', '/api/scenes/outsider-room', sceneDoc('outsider-room'))).status, 200);
  assert.equal((await api('GET', '/api/scenes/outsider-room')).status, 200, 'its creator opens it');
  cookie = helper.cookie;
  assert.equal((await api('GET', '/api/scenes/outsider-room')).status, 403, 'nobody else does');
  assert.ok(!(await api('GET', '/api/scenes')).json.some((s) => s.id === 'outsider-room'), 'or lists it');
  assert.equal((await api('PUT', '/api/scenes/outsider-room', { ...sceneDoc('outsider-room'), ownerId: helper.user.id })).status, 403, 'or takes it over');
  // and drafts aren't public: no session, no list and no draft (visitors read /published)
  cookie = '';
  assert.equal((await api('GET', '/api/scenes')).status, 401);
  assert.equal((await api('GET', '/api/scenes/private-lobby')).status, 401);
});

test('deleting a project keeps its spaces, private to the one who deleted it', async () => {
  const owner = await signUpUser('Deleter', 'deleter@geonova.com.np');
  const other = await signUpUser('Bystander', 'bystander@geonova.com.np');
  cookie = owner.cookie;
  const pid = (await api('POST', '/api/properties', { title: 'Closing Hotel' })).json.id;
  await api('PUT', '/api/scenes/closing-hall', sceneDoc('closing-hall', { propertyId: pid }));
  assert.equal((await api('DELETE', `/api/properties/${pid}`)).status, 200);
  const kept = (await api('GET', '/api/scenes')).json.find((s) => s.id === 'closing-hall');
  assert.deepEqual([kept?.propertyId, kept?.ownerId], [null, owner.user.id]);
  cookie = other.cookie;
  assert.ok(!(await api('GET', '/api/scenes')).json.some((s) => s.id === 'closing-hall'));
});

test('an embed needs its space\'s key, a retired key stops working, and a site list is honoured', async () => {
  signIn();
  assert.equal((await api('PUT', '/api/scenes/embed-room', sceneDoc('embed-room'))).status, 200);
  const check = (key, from = '') => api('GET', `/api/embed/check?space=embed-room&key=${encodeURIComponent(key)}&from=${encodeURIComponent(from)}`);

  const first = (await api('GET', '/api/embed/embed-room')).json;
  assert.ok(first.key && first.version === 0 && first.sites.length === 0);
  assert.deepEqual((await check(first.key, 'https://anywhere.example')).json, { ok: true }, 'no list: any site');
  assert.equal((await check('made-up-key-000000000000')).json.reason, 'key');
  assert.equal((await check('')).json.reason, 'key', 'no key, no embed');

  // a studio save can't touch the embed settings
  await api('PUT', '/api/scenes/embed-room', { ...sceneDoc('embed-room'), embed: { version: 99, sites: [] } });
  assert.equal((await api('GET', '/api/embed/embed-room')).json.version, 0);

  const rotated = (await api('POST', '/api/embed/embed-room', { rotate: true })).json;
  assert.equal(rotated.version, 1);
  assert.equal((await check(first.key)).json.reason, 'key', 'old snippets retired');
  assert.equal((await check(rotated.key)).json.ok, true);

  const listed = (await api('POST', '/api/embed/embed-room', { sites: ['https://www.Basera.com/rooms', 'basera.com', 'not a site!'] })).json;
  assert.deepEqual(listed.sites, ['basera.com']);
  assert.equal((await check(rotated.key, 'https://www.basera.com')).json.ok, true);
  assert.equal((await check(rotated.key, 'https://book.basera.com')).json.ok, true, 'a subdomain');
  assert.equal((await check(rotated.key, 'https://evil-basera.com')).json.reason, 'site');
  assert.equal((await check(rotated.key, '')).json.reason, 'site', 'a hidden origin is refused once there is a list');
  assert.equal((await check(rotated.key, 'http://localhost:3000')).json.ok, true, 'our own site, for previews');

  // the key is studio-only, and only for people who can see the space
  cookie = '';
  assert.equal((await api('GET', '/api/embed/embed-room')).status, 401);
  assert.equal((await api('POST', '/api/embed/token', { sceneId: 'embed-room' })).status, 401, 'the old open token route is gone');
});

test('a project keeps a log of who did what, readable by those who can see it', async () => {
  const owner = await signUpUser('Log Owner', 'log-owner@geonova.com.np');
  const other = await signUpUser('Log Outsider', 'log-outsider@geonova.com.np');
  cookie = owner.cookie;
  const pid = (await api('POST', '/api/properties', { title: 'Logged Hotel' })).json.id;
  await api('PUT', '/api/scenes/logged-room', sceneDoc('logged-room', { propertyId: pid, title: 'Logged room' }));
  await api('PUT', '/api/scenes/logged-room', sceneDoc('logged-room', { propertyId: pid, title: 'Logged room' }));
  await api('PATCH', `/api/properties/${pid}`, { title: 'Logged Hotel & Spa' });

  const log = await api('GET', `/api/properties/${pid}/activity`);
  assert.equal(log.status, 200);
  assert.deepEqual(log.json.map((e) => e.action), ['renamed the project', 'saved changes', 'added a space', 'created the project'], 'newest first');
  assert.ok(log.json.every((e) => e.who.name === 'Log Owner' && e.at));
  assert.equal(log.json[0].detail, 'was “Logged Hotel”');

  cookie = other.cookie;
  assert.equal((await api('GET', `/api/properties/${pid}/activity`)).status, 404, 'not for outsiders');
});

test('a project carries its own branding: name, accent, font and logo', async () => {
  signIn();
  const pid = (await api('POST', '/api/properties', { title: 'Branded Hotel' })).json.id;
  const set = await api('PUT', `/api/properties/${pid}/theme`, { brand: '  Branded Hotel & Spa ', accent: '#1F6FEB', font: 'classic' });
  assert.equal(set.status, 200);
  assert.deepEqual(set.json.theme, { brand: 'Branded Hotel & Spa', accent: '#1f6feb', font: 'classic' });
  assert.equal((await api('PUT', `/api/properties/${pid}/theme`, { accent: 'red' })).status, 400);
  assert.equal((await api('PUT', `/api/properties/${pid}/theme`, { font: 'comic' })).status, 400);

  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 3)]);
  const logo = await api('PUT', `/api/properties/${pid}/logo`, new Uint8Array(png), { 'Content-Type': 'application/octet-stream' });
  assert.equal(logo.status, 200);
  assert.match(logo.json.theme.logo, new RegExp(`^brand_${pid}/logo\\.png\\?v=\\d+$`));
  assert.equal((await fetch(`${BASE}/api/assets/brand_${pid}/logo.png`)).headers.get('content-type'), 'image/png');
  assert.equal((await api('PUT', `/api/properties/${pid}/logo`, new Uint8Array(Buffer.from('<svg/>')), { 'Content-Type': 'application/octet-stream' })).status, 415);

  // public, for the tour: just the branding, and the WhatsApp number visitors are shown anyway
  cookie = '';
  const pub = await api('GET', `/api/properties/${pid}/theme`);
  assert.deepEqual(Object.keys(pub.json).sort(), ['theme', 'title', 'whatsapp']);
  assert.equal(pub.json.theme.accent, '#1f6feb');
  assert.equal((await api('PUT', `/api/properties/${pid}/theme`, { accent: '#000000' })).status, 401);

  signIn();
  assert.equal((await api('DELETE', `/api/properties/${pid}/logo`)).json.theme.logo, undefined);
  assert.equal((await fetch(`${BASE}/api/assets/brand_${pid}/logo.png`)).status, 404);
});

test('an enquiry is filed to its project, emailed to its people, and exports to CSV', async () => {
  const owner = await signUpUser('Enquiry Owner', 'enquiry-owner@geonova.com.np');
  cookie = owner.cookie;
  const pid = (await api('POST', '/api/properties', { title: 'Enquiry Hotel' })).json.id;
  await api('PUT', '/api/scenes/enquiry-suite', sceneDoc('enquiry-suite', { propertyId: pid, title: 'Deluxe suite' }));
  assert.equal((await api('PUT', `/api/properties/${pid}/lead-emails`, { emails: ['not an email'] })).status, 400);
  assert.deepEqual((await api('PUT', `/api/properties/${pid}/lead-emails`, { emails: [' Sales@Hotel.com ', 'sales@hotel.com'] })).json.emails, ['sales@hotel.com']);

  const send = (fields) => fetch(`${BASE}/api/leads`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Asha', phone: '9841000000', formRenderedAt: Date.now() - 5000, ...fields })
  });
  mailbox.length = 0;
  // a space's own project wins over whatever the form claims
  assert.equal((await send({
    sceneId: 'enquiry-suite', sceneName: 'Deluxe suite', propertyId: 'someone-else', message: '=HYPERLINK("http://x")', email: 'asha@mail.com',
    requirement: 'This space: Deluxe suite', hotspotId: 'hs-balcony', hotspotLabel: 'Balcony <view>'
  })).status, 200);
  // from the project's page
  assert.equal((await send({ sceneId: 'hub', sceneName: 'Enquiry Hotel (project page)', propertyId: pid })).status, 200);
  // a made-up project from the page files nowhere
  assert.equal((await send({ sceneId: 'hub', propertyId: 'no-such-project' })).status, 200);

  // emails go out after the reply; give them a moment
  for (let i = 0; i < 50 && mailbox.length < 2; i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal(mailbox.length, 2, 'the made-up project has no one to email');
  const mail = mailbox.find((m) => m.subject.includes('Deluxe suite'));
  assert.equal(mail.auth, 'Bearer test-mail-key');
  assert.deepEqual(mail.to, ['sales@hotel.com']);
  assert.equal(mail.reply_to, 'asha@mail.com', 'replying answers the guest');
  assert.match(mail.text, /Phone:\s+9841000000/);
  assert.match(mail.text, /Was looking at: Balcony view/, 'the hotspot, with no HTML');
  assert.match(mail.text, /Looking for:\s+This space: Deluxe suite/);
  assert.ok(!('html' in mail), 'plain text only: the fields are a stranger\'s');

  const list = await api('GET', `/api/properties/${pid}/leads`);
  assert.equal(list.json.leads.length, 2);
  assert.ok(list.json.leads.every((l) => l.delivery?.sent === true), 'the send is recorded');

  const csv = await fetch(`${BASE}/api/properties/${pid}/leads.csv`, { headers: { cookie } });
  assert.match(csv.headers.get('content-disposition'), /attachment; filename="enquiry-hotel-enquiries-/);
  const bytes = Buffer.from(await csv.arrayBuffer()); // .text() would strip the BOM
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'BOM, so Excel reads UTF-8');
  const text = bytes.toString('utf8');
  assert.match(text, /"'=HYPERLINK\(""http:\/\/x""\)"/, 'a formula a stranger typed is shown, not run');

  // every project's enquiries: admins only
  const editor = await signUpUser('Enquiry Editor', 'enquiry-editor@geonova.com.np');
  cookie = editor.cookie;
  assert.equal((await api('GET', '/api/leads')).status, 403);
  assert.equal((await api('GET', `/api/properties/${pid}/leads`)).status, 404, 'not their project');
});

test('tour visits and time are counted per space, and the monthly report adds enquiries', async () => {
  signIn();
  const pid = (await api('POST', '/api/properties', { title: 'Report Hotel' })).json.id;
  const hs = (id, label) => ({ id, type: 'text', label, position: [0, 1, 0] });
  await api('PUT', '/api/scenes/report-lobby', sceneDoc('report-lobby', { propertyId: pid, title: 'Lobby', hotspots: [hs('hs-bar', 'The bar'), hs('hs-pool', 'Pool view')] }));
  await api('PUT', '/api/scenes/report-draft', sceneDoc('report-draft', { propertyId: pid, title: 'Not published' }));
  assert.equal((await api('POST', '/api/scenes/report-lobby/publish')).status, 200);

  const beacon = (body) => fetch(`${BASE}/api/stats`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) });
  const all = await Promise.all([
    beacon({ space: 'report-lobby', visit: true }),
    beacon({ space: 'report-lobby', visit: true }),
    beacon({ space: 'report-lobby', seconds: 95 }),
    beacon({ space: 'report-lobby', seconds: 99999 }), // capped at 30 min
    beacon({ space: 'report-draft', visit: true }), // not published: not counted
    beacon({ space: '../etc', visit: true }),
    // the path to a booking
    beacon({ space: 'report-lobby', hotspot: 'hs-pool', first: true }),
    beacon({ space: 'report-lobby', hotspot: 'hs-pool' }),
    beacon({ space: 'report-lobby', hotspot: 'hs-bar' }),
    beacon({ space: 'report-lobby', hotspot: 'made-up', first: true }), // not in the space: not counted
    beacon({ space: 'report-lobby', intent: 'enquire' }),
    beacon({ space: 'report-lobby', intent: 'room' }),
    beacon({ space: 'report-lobby', intent: 'teleport' })
  ]);
  assert.ok(all.every((r) => r.status === 204));
  await fetch(`${BASE}/api/leads`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Ravi', phone: '9800000000', sceneId: 'report-lobby', hotspotId: 'hs-pool', hotspotLabel: 'Pool view', formRenderedAt: Date.now() - 5000 })
  });
  await new Promise((r) => setTimeout(r, 150)); // beacons are counted after the reply

  const r = (await api('GET', `/api/properties/${pid}/report`)).json;
  assert.equal(r.visits, 2, 'two visits, even sent at the same moment');
  assert.equal(r.seconds, 95 + 1800);
  const lobby = r.spaces.find((s) => s.id === 'report-lobby');
  assert.deepEqual([lobby.title, lobby.visits, lobby.enquiries], ['Lobby', 2, 1]);
  assert.equal(r.spaces.find((s) => s.id === 'report-draft').visits, 0);
  assert.equal(Object.values(r.days).reduce((a, b) => a + b, 0), 2);
  assert.deepEqual(r.funnel, {
    visits: 2, engaged: 1, intent: { enquire: 1, room: 1 }, intents: 2, enquiries: 1,
    requests: { tables: 0, rooms: 0, events: 0 }, confirmed: { tables: 0, rooms: 0, events: 0 }
  });
  assert.deepEqual(r.hotspots.map((h) => [h.label, h.spaceTitle, h.opens, h.enquiries]), [['Pool view', 'Lobby', 2, 1], ['The bar', 'Lobby', 1, 0]]);
  assert.equal((await api('GET', `/api/properties/${pid}/report?month=2026-13`)).status, 400);
  cookie = '';
  assert.equal((await api('GET', `/api/properties/${pid}/report`)).status, 401);
});

test('every published version is listed, and any one can be put live again', async () => {
  signIn();
  await api('PUT', '/api/scenes/history-room', sceneDoc('history-room', { title: 'First take' }));
  assert.equal((await api('POST', '/api/scenes/history-room/publish')).json.version, 1);
  await api('PUT', '/api/scenes/history-room', sceneDoc('history-room', { title: 'Second take' }));
  assert.equal((await api('POST', '/api/scenes/history-room/publish')).json.version, 2);
  const embedV = (await api('POST', '/api/embed/history-room', { rotate: true })).json.version;

  const list = await api('GET', '/api/scenes/history-room/versions');
  assert.deepEqual(list.json.map((v) => [v.version, v.title]), [[2, 'Second take'], [1, 'First take']]);

  const r = await api('POST', '/api/scenes/history-room/restore', { version: 1, publish: true });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.publish.version, 3, 'a new version, so the history keeps every step');
  assert.equal((await api('GET', '/api/scenes/history-room/published')).json.title, 'First take');
  assert.equal((await api('GET', '/api/embed/history-room')).json.version, embedV, 'restoring never un-retires embed codes');

  // revert, too, keeps the embed key and publish state
  await api('PUT', '/api/scenes/history-room', sceneDoc('history-room', { title: 'Scratch' }));
  assert.equal((await api('POST', '/api/scenes/history-room/revert')).status, 200);
  assert.equal((await api('GET', '/api/scenes/history-room')).json.title, 'First take');
  assert.equal((await api('GET', '/api/embed/history-room')).json.version, embedV);
  assert.equal((await api('GET', '/api/scenes/history-room/publish')).json.publishedVersion, 3);

  assert.equal((await api('POST', '/api/scenes/history-room/restore', { version: 9 })).status, 404);
});

test('an admin promotes and demotes from the team list, but never down to zero admins', async () => {
  const meLogin = await api('POST', '/api/auth/login', { email: 'first@geonova.com.np', password: 'plenty-long-8' });
  cookie = meLogin.headers.get('set-cookie').split(';')[0];

  const team = await api('GET', '/api/team');
  assert.equal(team.status, 200);
  const me = team.json.find((u) => u.email === 'first@geonova.com.np');
  const other = team.json.find((u) => u.email === 'second@geonova.com.np');
  assert.equal(me.role, 'admin');
  assert.equal(other.role, 'editor');

  // promoting someone else is fine, while signed in as the (still admin) me
  assert.equal((await api('PATCH', `/api/team/${other.id}/role`, { role: 'admin' })).status, 200);

  // switch to the now-admin "other" before demoting "me" — the caller's own
  // session must stay admin-capable for the rest of this test
  const otherLogin = await api('POST', '/api/auth/login', { email: 'second@geonova.com.np', password: 'plenty-long-8' });
  cookie = otherLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await api('PATCH', `/api/team/${me.id}/role`, { role: 'editor' })).status, 200);

  // "other" is now the one remaining admin — refused, even demoting themself
  assert.equal((await api('PATCH', `/api/team/${other.id}/role`, { role: 'editor' })).status, 409);

  assert.equal((await api('PATCH', `/api/team/${other.id}/role`, { role: 'not-a-role' })).status, 400);
  assert.equal((await api('PATCH', '/api/team/no-such-id/role', { role: 'admin' })).status, 404);

  // "me" (now an editor) has lost admin rights at once, not after 12h
  cookie = meLogin.headers.get('set-cookie').split(';')[0];
  assert.equal((await api('GET', '/api/team')).status, 403);
});

test('an admin can reset a password by link, and remove an account; both sign the person out', async () => {
  // second@ is the only admin by now (the test above)
  const adminLogin = await api('POST', '/api/auth/login', { email: 'second@geonova.com.np', password: 'plenty-long-8' });
  const admin = adminLogin.headers.get('set-cookie').split(';')[0];
  const leaver = await signUpUser('Leaver', 'leaver@geonova.com.np');
  const forgetful = await signUpUser('Forgetful', 'forgetful@geonova.com.np');

  // the leaver owns a project
  cookie = leaver.cookie;
  const pid = (await api('POST', '/api/properties', { title: 'Leaver Lodge' })).json.id;

  // reset: a one-time link; the old session dies, the new password works, the link can't be reused
  cookie = admin;
  const link = await api('POST', `/api/team/${forgetful.user.id}/reset`);
  assert.equal(link.status, 200);
  const token = new URLSearchParams(link.json.path.split('?')[1]).get('reset');
  assert.ok(token && token.length > 20);
  cookie = '';
  assert.equal((await api('POST', '/api/auth/reset', { token, password: 'short' })).status, 400);
  const reset = await api('POST', '/api/auth/reset', { token, password: 'brand-new-pass' });
  assert.equal(reset.status, 200);
  assert.equal((await api('POST', '/api/auth/reset', { token, password: 'another-one-9' })).status, 400, 'once only');
  cookie = forgetful.cookie;
  assert.equal((await api('GET', '/api/properties')).status, 401, 'signed in before the reset: signed out');
  assert.equal((await api('GET', '/api/auth/session')).json.authenticated, false);
  assert.equal((await api('POST', '/api/auth/login', { email: 'forgetful@geonova.com.np', password: 'brand-new-pass' })).status, 200);

  // remove: signed out at once, and the project passes to the admin
  cookie = admin;
  assert.equal((await api('DELETE', `/api/team/${(await api('GET', '/api/auth/session')).json.user.id}`)).status, 400, 'not yourself');
  const removed = await api('DELETE', `/api/team/${leaver.user.id}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.json.projectsReassigned, 1);
  assert.equal((await api('GET', `/api/properties/${pid}`)).json.ownerName, 'Second Person');
  cookie = leaver.cookie;
  assert.equal((await api('GET', '/api/properties')).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { email: 'leaver@geonova.com.np', password: 'plenty-long-8' })).status, 401);
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

  // narration on a camera track: the same, and it's kept through a save
  const track = (transcript) => ({ id: 'walk', label: 'Walk in', keyframes: [{ t: 0, position: [0, 1.6, 0], target: [0, 1.6, -1], easing: 'easeInOutCubic' }],
    cues: [], audio: 'asset://ast_n/walk.m4a', seconds: 4, ...(transcript === undefined ? {} : { transcript }) });
  await api('PUT', '/api/scenes/talky', sceneDoc('talky', { hotspots: [hs('Welcome to the bar.')], tracks: [track()] }));
  r = await api('GET', '/api/scenes/talky/publish');
  assert.match(r.json.warnings.join(' '), /"Walk in" has narration but no transcript/);
  await api('PUT', '/api/scenes/talky', sceneDoc('talky', { hotspots: [hs('Welcome to the bar.')], tracks: [track('This is the entrance.')] }));
  const saved = (await api('GET', '/api/scenes/talky')).json.tracks[0];
  assert.deepEqual([saved.audio, saved.transcript], ['asset://ast_n/walk.m4a', 'This is the entrance.']);
  assert.doesNotMatch((await api('GET', '/api/scenes/talky/publish')).json.warnings.join(' '), /transcript/);
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


test('a space can carry its own floor plan image: PNG, JPEG or WebP, one at a time', async () => {
  signIn();
  const { assetId } = await uploadModel([['plan-room.glb', glb({ meshes: [mesh(4)], nodes: [{ mesh: 0 }] })]]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
  const up = (body) => api('PUT', `/api/assets/${assetId}/floorplan/upload`, new Uint8Array(body), { 'Content-Type': 'application/octet-stream' });

  const r = await up(png);
  assert.equal(r.status, 201, JSON.stringify(r.json));
  assert.equal(r.json.path, 'floorplan/uploaded.png');
  const served = await fetch(`${BASE}/api/assets/${assetId}/floorplan/uploaded.png`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/png');

  // a new one replaces it, whatever its format
  assert.equal((await up(jpg)).json.path, 'floorplan/uploaded.jpg');
  assert.equal((await fetch(`${BASE}/api/assets/${assetId}/floorplan/uploaded.png`)).status, 404);

  // refused: SVG (can carry script), a PDF, a renamed text file, nothing
  assert.equal((await up(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).status, 415);
  assert.equal((await up(Buffer.from('%PDF-1.7 ...'))).status, 415);
  assert.equal((await up(Buffer.alloc(0))).status, 400);
  assert.equal((await fetch(`${BASE}/api/assets/${assetId}/floorplan/uploaded.jpg`)).status, 200, 'a refused upload keeps the one there');

  assert.equal((await api('PUT', '/api/assets/ast_nothere/floorplan/upload', new Uint8Array(png), { 'Content-Type': 'application/octet-stream' })).status, 404);

  assert.equal((await api('DELETE', `/api/assets/${assetId}/floorplan/upload`)).status, 204);
  assert.equal((await fetch(`${BASE}/api/assets/${assetId}/floorplan/uploaded.jpg`)).status, 404);

  cookie = '';
  assert.equal((await up(png)).status, 401);
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

test('a space keeps its night version through save and publish, and the lists report it', async () => {
  signIn();
  await api('PUT', '/api/scenes/dn-lobby', sceneDoc('dn-lobby', { title: 'Lobby', night: 'dn-lobby-night' }));
  await api('PUT', '/api/scenes/dn-lobby-night', sceneDoc('dn-lobby-night', { title: 'Lobby at night' }));
  assert.equal((await api('POST', '/api/scenes/dn-lobby/publish')).status, 200);
  const listed = (await api('GET', '/api/scenes')).json.find((s) => s.id === 'dn-lobby');
  assert.equal(listed.night, 'dn-lobby-night');
  const gallery = (await api('GET', '/api/gallery')).json.find((g) => g.id === 'dn-lobby');
  assert.equal(gallery.night, 'dn-lobby-night');
});

test('a published space’s picture is a real image link, for lists and link previews', async () => {
  signIn();
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  await api('PUT', '/api/scenes/og-lobby', sceneDoc('og-lobby', {
    tracks: [{ id: 'vp-a', label: 'A', keyframes: [], thumb: null }, { id: 'vp-b', label: 'B', keyframes: [], thumb: `data:image/jpeg;base64,${jpeg.toString('base64')}` }]
  }));
  await api('PUT', '/api/scenes/og-bare', sceneDoc('og-bare'));
  for (const s of ['og-lobby', 'og-bare']) assert.equal((await api('POST', `/api/scenes/${s}/publish`)).status, 200);
  cookie = '';
  const list = (await api('GET', '/api/gallery')).json;
  const thumb = list.find((g) => g.id === 'og-lobby').thumb;
  assert.match(thumb, /^\/api\/gallery\/og-lobby\/thumb\.jpg\?v=\d+$/, 'a link, not a data URL');
  assert.equal(list.find((g) => g.id === 'og-bare').thumb, null);
  const img = await fetch(BASE + thumb);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), jpeg);
  assert.equal((await fetch(`${BASE}/api/gallery/og-bare/thumb.jpg`)).status, 404);

  // the tour's copy of the space carries its view pictures as links, not inline
  const pub = (await api('GET', '/api/scenes/og-lobby/published')).json;
  assert.equal(pub.tracks[0].thumb, null);
  assert.match(pub.tracks[1].thumb, /^\/api\/scenes\/og-lobby\/published\/thumbs\/vp-b\.jpg\?v=\d+$/);
  assert.deepEqual(Buffer.from(await (await fetch(BASE + pub.tracks[1].thumb)).arrayBuffer()), jpeg);
  assert.equal((await fetch(`${BASE}/api/scenes/og-lobby/published/thumbs/nope.jpg`)).status, 404);
});

test('a project website: draft, photos, publish, and a public page that only shows its own spaces', async () => {
  signIn();
  const pid = (await api('POST', '/api/properties', { title: 'Site Hotel' })).json.id;
  const other = (await api('POST', '/api/properties', { title: 'Someone Else' })).json.id;
  await api('PUT', '/api/scenes/site-lobby', sceneDoc('site-lobby', { propertyId: pid, title: 'Lobby', tracks: [{ id: 'vp-door', label: 'The door', keyframes: [] }] }));
  await api('PUT', '/api/scenes/site-theirs', sceneDoc('site-theirs', { propertyId: other, title: 'Not yours' }));
  for (const s of ['site-lobby', 'site-theirs']) assert.equal((await api('POST', `/api/scenes/${s}/publish`)).status, 200);

  assert.equal((await api('GET', `/api/sites/${pid}`)).status, 404, 'nothing public before the first publish');
  const draft = (await api('GET', `/api/sites/${pid}/draft`)).json;
  assert.deepEqual(draft.spaces.map((s) => [s.id, s.views.map((v) => v.id)]), [['site-lobby', ['vp-door']]]);

  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 3)]);
  const photo = (await api('POST', `/api/sites/${pid}/images`, new Uint8Array(png), { 'Content-Type': 'application/octet-stream' })).json.path;
  assert.ok(photo.startsWith(`site_${pid}/img-`) && /^img-\d+\.png$/.test(photo.split('/')[1]), photo);
  assert.equal((await api('POST', `/api/sites/${pid}/images`, new Uint8Array([1, 2, 3]), { 'Content-Type': 'application/octet-stream' })).status, 415);
  const ihdr = Buffer.alloc(33);
  ihdr.writeUInt32BE(0x89504e47, 0); ihdr.writeUInt32BE(0x0d0a1a0a, 4); ihdr.write('IHDR', 12, 'latin1');
  ihdr.writeUInt32BE(2400, 16); ihdr.writeUInt32BE(1600, 20);
  const wide = (await api('POST', `/api/sites/${pid}/images`, new Uint8Array(ihdr), { 'Content-Type': 'application/octet-stream' })).json.path;
  assert.match(wide, /\/img-\d+-2400x1600\.png$/, 'its size in the name, for the page to hold its place');
  assert.equal(draft.draft.style, 'heritage', 'the default look');

  const saved = await api('PUT', `/api/sites/${pid}/draft`, {
    style: 'night',
    hero: { title: '  Site Hotel  ', space: 'site-lobby', image: wide, junk: 'dropped' },
    rooms: [
      { title: 'Lobby', image: photo, space: 'site-lobby', view: 'vp-door' },
      { title: 'Borrowed', space: 'site-theirs', view: 'x' },
      { title: 'Bad photo', image: '../../etc/passwd' }
    ],
    menu: { items: [{ name: 'Momo', price: 'Rs 350' }, { price: 'no name' }] },
    gallery: [photo, 'brand_x/logo.png'],
    reviews: { link: 'javascript:alert(1)', items: [{ quote: ' Lovely stay ', name: 'Asha', from: 'Pokhara' }, { name: 'no words' }] },
    offers: [{ title: 'Honeymoon', price: 'Rs 18,000', image: '../x.png' }, { body: 'no title' }],
    faq: [{ q: 'Parking?', a: 'Free, on site.' }, { q: 'No answer?' }]
  });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.json.draft.reviews, { link: '', items: [{ quote: 'Lovely stay', name: 'Asha', from: 'Pokhara' }] }, 'only https links, only quotes with words');
  assert.deepEqual(saved.json.draft.offers, [{ title: 'Honeymoon', body: '', price: 'Rs 18,000', image: '' }]);
  assert.deepEqual(saved.json.draft.faq, [{ q: 'Parking?', a: 'Free, on site.' }]);
  assert.equal(saved.json.draft.hero.title, 'Site Hotel');
  assert.equal(saved.json.draft.hero.junk, undefined);
  assert.equal(saved.json.draft.hero.image, wide);
  assert.equal(saved.json.draft.style, 'night');
  assert.equal((await api('PUT', `/api/sites/${pid}/draft`, { ...saved.json.draft, style: 'neon' })).json.draft.style, 'heritage', 'an unknown look falls back');
  await api('PUT', `/api/sites/${pid}/draft`, saved.json.draft);
  assert.equal(saved.json.draft.rooms[2].image, '', 'only this site’s own photos');
  assert.deepEqual(saved.json.draft.gallery, [photo]);
  assert.equal(saved.json.draft.menu.items.length, 1);

  assert.equal((await api('POST', `/api/sites/${pid}/publish`)).status, 200);
  cookie = '';
  const pub = (await api('GET', `/api/sites/${pid}`)).json;
  assert.equal(pub.site.hero.title, 'Site Hotel');
  assert.equal(pub.site.faq.length, 1);
  assert.equal(pub.tour.space, 'site-lobby');
  assert.match(pub.tour.key, /^[\w-]{24}$/);
  assert.deepEqual(pub.site.rooms.map((r) => [r.title, r.space, r.view]),
    [['Lobby', 'site-lobby', 'vp-door'], ['Borrowed', '', ''], ['Bad photo', '', '']], 'another project’s space is dropped');
  assert.equal((await api('PUT', `/api/sites/${pid}/draft`, {})).status, 401);
});

test('table booking: availability, one table per time, any table, the studio confirms or declines', async () => {
  signIn();
  const pid = (await api('POST', '/api/properties', { title: 'Table Hotel' })).json.id;
  await api('PUT', `/api/properties/${pid}/lead-emails`, { emails: ['host@tablehotel.test'] });
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 3)]);
  const plan = (await api('POST', `/api/sites/${pid}/images`, new Uint8Array(png), { 'Content-Type': 'application/octet-stream' })).json.path;
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const [tomorrow, closedDay] = [day(1), day(2)];
  const booking = {
    on: true, plan, timezone: 'UTC', first: '18:00', last: '20:00', slot: 30, stay: 90, days: 14, maxParty: 8,
    closed: [new Date(`${closedDay}T12:00:00Z`).getUTCDay()],
    tables: [
      { id: 't2', label: 'Window 2', seats: 2, x: 0.2, y: 0.3, shape: 'round' },
      { id: 't4', label: 'Table 4', seats: 4, x: 0.6, y: 0.5, shape: 'square' },
      { id: 't6', label: 'Long table', seats: 6, x: 0.8, y: 0.8, shape: 'long' },
      { id: 'bad id!', label: 'dropped' }
    ]
  };
  const saved = await api('PUT', `/api/sites/${pid}/draft`, { booking });
  assert.deepEqual(saved.json.draft.booking.tables.map((t) => t.id), ['t2', 't4', 't6']);
  assert.equal((await api('GET', `/api/sites/${pid}/availability`)).status, 404, 'nothing until published');
  assert.deepEqual((await api('GET', `/api/sites/${pid}/booking`)).json, { booking: null, places: [] }, 'the tour just hears "no"');
  await api('POST', `/api/sites/${pid}/publish`);

  cookie = ''; // everything a guest does is public
  assert.equal((await api('GET', `/api/sites/${pid}/booking`)).json.booking.tables.length, 3, 'published: the tour gets the setup');
  const avail = (date) => api('GET', `/api/sites/${pid}/availability?date=${date}`).then((r) => r.json);
  const a = await avail(tomorrow);
  assert.deepEqual(a.slots.map((s) => s.time), ['18:00', '18:30', '19:00', '19:30', '20:00']);
  assert.deepEqual(a.slots[0].free, ['t2', 't4', 't6']);
  assert.equal(a.dates.find((d) => d.date === closedDay).closed, true);
  assert.deepEqual((await avail(closedDay)).slots, []);

  const guest = { name: 'Sita', phone: '9800000001', email: 'sita@guest.test', formRenderedAt: Date.now() - 5000 };
  const book = (b) => api('POST', `/api/sites/${pid}/reservations`, { ...guest, date: tomorrow, ...b });
  const first = await book({ table: 't4', time: '19:00', party: 3, notes: 'Anniversary' });
  assert.equal(first.status, 201);
  assert.equal(first.json.tableLabel, 'Table 4');
  // held 90 minutes: every start from 18:00 to 20:00 is within 90 minutes of 19:00
  const after = await avail(tomorrow);
  assert.deepEqual(after.slots.map((s) => s.free.includes('t4')), [false, false, false, false, false]);
  assert.ok(after.slots.every((s) => s.free.includes('t2')), 'other tables stay free');
  assert.equal((await book({ table: 't4', time: '19:30', party: 2 })).status, 409, 'the same table, overlapping');
  assert.equal((await book({ table: 't2', time: '19:00', party: 3 })).status, 400, 'three at a table for two');
  assert.equal((await book({ table: 't4', time: '19:15', party: 2 })).status, 400, 'not a start time');
  assert.equal((await book({ table: 't4', time: '19:00', party: 2, date: closedDay })).status, 400, 'closed that day');
  assert.equal((await book({ table: 't4', time: '19:00', party: 9 })).status, 400, 'over the largest party');
  const any = await book({ table: 'any', time: '19:00', party: 4 });
  assert.equal(any.status, 201);
  assert.equal(any.json.table, 't6', 'the smallest free table that seats four');
  assert.equal((await book({ table: 'any', time: '19:00', party: 3 })).status, 409, 'nothing left for three at 19:00');
  const trap = await book({ table: 't2', time: '18:00', party: 2, website: 'http://spam' });
  assert.equal(trap.json.id, undefined, 'the honeypot answers like it worked, stores nothing');
  assert.equal((await api('GET', `/api/sites/${pid}/reservations`)).status, 401);

  await new Promise((r) => setTimeout(r, 200)); // the restaurant's email goes after the reply
  const toHost = mailbox.filter((m) => m.to.includes('host@tablehotel.test') && /Table request/.test(m.subject));
  assert.equal(toHost.length, 2);
  assert.match(toHost[0].text, /Anniversary/);
  assert.equal(toHost[0].reply_to, 'sita@guest.test');

  signIn();
  const inbox = (await api('GET', `/api/sites/${pid}/reservations`)).json;
  assert.equal(inbox.reservations.length, 2);
  assert.equal(inbox.reservations[0].ip, undefined, 'no IPs in the studio');
  const id = inbox.reservations.find((r) => r.table === 't4').id;
  assert.equal((await api('PATCH', `/api/sites/${pid}/reservations/${id}`, { status: 'confirmed' })).json.status, 'confirmed');
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(mailbox.some((m) => m.to.includes('sita@guest.test') && /confirmed/.test(m.subject)), 'the guest hears it is confirmed');

  // Declined frees the table; taking it back is refused once someone else has it.
  await api('PATCH', `/api/sites/${pid}/reservations/${id}`, { status: 'declined' });
  cookie = '';
  assert.equal((await book({ table: 't4', time: '19:30', party: 2 })).status, 201);
  signIn();
  assert.equal((await api('PATCH', `/api/sites/${pid}/reservations/${id}`, { status: 'confirmed' })).status, 409);
  assert.equal((await api('PATCH', `/api/sites/${pid}/reservations/${id}`, { status: 'eaten' })).status, 400);
});

test('room booking: rooms left per night, check-out day free, big parties take more rooms, the studio confirms or declines', async () => {
  signIn();
  const pid = (await api('POST', '/api/properties', { title: 'Stay Resort' })).json.id;
  await api('PUT', `/api/properties/${pid}/lead-emails`, { emails: ['desk@stayresort.test'] });
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const stays = {
    on: true, timezone: 'UTC', checkin: '14:00', checkout: '11:00', days: 60, minNights: 1, maxNights: 7, maxGuests: 8,
    rooms: [
      { id: 'dlx', label: 'Deluxe Room', units: 2, sleeps: 2, price: 'Rs 9,000', per: '/ night' },
      { id: 'villa', label: 'Pool Villa', units: 1, sleeps: 4, pin: true, x: 0.4, y: 0.6, space: 'not-in-this-project' },
      { id: 'nameless' },
      { id: 'bad id!', label: 'dropped' }
    ]
  };
  const saved = await api('PUT', `/api/sites/${pid}/draft`, { stays });
  assert.deepEqual(saved.json.draft.stays.rooms.map((r) => r.id), ['dlx', 'villa']);
  assert.equal(saved.json.draft.stays.checkout, '11:00');
  assert.equal((await api('GET', `/api/sites/${pid}/stays/availability`)).status, 404, 'nothing until published');
  assert.deepEqual((await api('GET', `/api/sites/${pid}/stays`)).json, { stays: null }, 'the tour just hears "no"');
  assert.equal((await api('GET', `/api/sites/${pid}/preview/stays/availability`)).status, 200, 'the team can preview it');
  await api('POST', `/api/sites/${pid}/publish`);

  cookie = ''; // everything a guest does is public
  const live = (await api('GET', `/api/sites/${pid}/stays`)).json.stays;
  assert.equal(live.rooms.length, 2);
  assert.equal(live.rooms[1].space, '', 'a space outside the project is dropped from the public copy');
  let c = (await api('GET', `/api/sites/${pid}/stays/availability`)).json;
  const at = (d) => c.dates.indexOf(d);
  const free = (id, ...days) => days.map((d) => c.free[id][at(d)]);
  assert.equal(c.dates[0], c.today);
  assert.equal(c.dates.length, 60 + 7 + 1, 'today to the last check-in plus the longest stay');
  assert.deepEqual(free('dlx', day(1), day(2), day(3)), [2, 2, 2]);

  const guest = { name: 'Maya', phone: '9800000002', email: 'maya@guest.test', formRenderedAt: Date.now() - 5000 };
  const stay = (b) => api('POST', `/api/sites/${pid}/stays`, { ...guest, room: 'dlx', checkin: day(2), checkout: day(4), guests: 2, ...b });
  const first = await stay({ notes: 'Honeymoon' });
  assert.equal(first.status, 201);
  assert.deepEqual([first.json.nights, first.json.rooms, first.json.roomLabel], [2, 1, 'Deluxe Room']);
  c = (await api('GET', `/api/sites/${pid}/stays/availability`)).json;
  assert.deepEqual(free('dlx', day(1), day(2), day(3), day(4)), [2, 1, 1, 2], 'two nights held; the check-out day is free');

  // Four guests in rooms for two take both Deluxe rooms, so only nights where both are free.
  assert.equal((await stay({ guests: 4, checkin: day(3), checkout: day(5) })).status, 409, 'one Deluxe left on the 3rd');
  const both = await stay({ guests: 4, checkin: day(4), checkout: day(6) });
  assert.equal(both.status, 201);
  assert.equal(both.json.rooms, 2);
  c = (await api('GET', `/api/sites/${pid}/stays/availability`)).json;
  assert.deepEqual(free('dlx', day(4), day(5), day(6)), [0, 0, 2]);
  assert.deepEqual(free('villa', day(4), day(5)), [1, 1], 'other rooms untouched');

  assert.equal((await stay({ checkin: day(-1), checkout: day(1) })).status, 400, 'in the past');
  assert.equal((await stay({ checkin: day(8), checkout: day(8) })).status, 400, 'no nights');
  assert.equal((await stay({ checkin: day(8), checkout: day(17) })).status, 400, 'over the longest stay');
  assert.equal((await stay({ checkin: day(61), checkout: day(62) })).status, 400, 'too far ahead');
  assert.equal((await stay({ guests: 9 })).status, 400, 'over the largest party');
  assert.equal((await stay({ room: 'villa', guests: 5, checkin: day(8), checkout: day(9) })).status, 400, 'the one villa sleeps four');
  assert.equal((await stay({ room: 'nope' })).status, 400);
  const trap = await stay({ website: 'http://spam', checkin: day(9), checkout: day(10) });
  assert.equal(trap.json.id, undefined, 'the honeypot answers like it worked, stores nothing');
  assert.equal((await api('GET', `/api/sites/${pid}/availability`)).status, 404, 'rooms on, tables still off');

  await new Promise((r) => setTimeout(r, 200)); // the desk's email goes after the reply
  const toDesk = mailbox.filter((m) => m.to.includes('desk@stayresort.test') && /Room request/.test(m.subject));
  assert.equal(toDesk.length, 2);
  assert.match(toDesk[0].text, /Honeymoon/);
  assert.match(toDesk[1].text, /Deluxe Room × 2/);
  assert.equal(toDesk[0].reply_to, 'maya@guest.test');

  signIn();
  const inbox = (await api('GET', `/api/sites/${pid}/reservations`)).json;
  assert.equal(inbox.stays.rooms.length, 2);
  assert.deepEqual(inbox.reservations.map((r) => [r.kind, r.date, r.rooms, r.ip]), [['stay', day(2), 1, undefined], ['stay', day(4), 2, undefined]]);
  const id = inbox.reservations[0].id;
  assert.equal((await api('PATCH', `/api/sites/${pid}/reservations/${id}`, { status: 'confirmed' })).json.status, 'confirmed');
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(mailbox.some((m) => m.to.includes('maya@guest.test') && /stay at .* is confirmed/.test(m.subject)), 'the guest hears it is confirmed');

  // Declined frees the rooms; taking it back is refused once someone else has them.
  await api('PATCH', `/api/sites/${pid}/reservations/${id}`, { status: 'declined' });
  cookie = '';
  assert.equal((await stay({ guests: 4, checkin: day(3), checkout: day(4) })).status, 201, 'its nights are free again');
  signIn();
  const again = await api('PATCH', `/api/sites/${pid}/reservations/${id}`, { status: 'confirmed' });
  assert.equal(again.status, 409);
  assert.match(again.json.error, /room/);
});

test('events: a hall for the daytime, the evening or the whole day; the venue confirms or declines; the report counts them', async () => {
  signIn();
  const pid = (await api('POST', '/api/properties', { title: 'Banquet House' })).json.id;
  await api('PUT', `/api/properties/${pid}/lead-emails`, { emails: ['events@banquet.test'] });
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const saved = await api('PUT', `/api/sites/${pid}/draft`, { events: {
    on: true, timezone: 'UTC', days: 90, kinds: ['Wedding', 'Conference', ' '],
    halls: [
      { id: 'grand', label: 'Grand Hall', seated: 300, standing: 500, space: 'not-in-this-project' },
      { id: 'garden', label: 'Garden', standing: 80 },
      { id: 'empty', label: 'Holds no one' },
      { id: 'bad id!', label: 'dropped' }
    ]
  } });
  assert.deepEqual(saved.json.draft.events.halls.map((h) => h.id), ['grand', 'garden', 'empty']);
  assert.deepEqual(saved.json.draft.events.kinds, ['Wedding', 'Conference']);
  assert.deepEqual((await api('GET', `/api/sites/${pid}/events`)).json, { events: null }, 'nothing until published');
  await api('POST', `/api/sites/${pid}/publish`);

  cookie = '';
  const live = (await api('GET', `/api/sites/${pid}/events`)).json.events;
  assert.deepEqual(live.halls.map((h) => [h.id, h.space]), [['grand', ''], ['garden', '']], 'a hall that holds no one isn’t offered; a foreign space is dropped');
  const guest = { name: 'Sita', phone: '9800000003', email: 'sita@guest.test', formRenderedAt: Date.now() - 5000 };
  const ask = (b) => api('POST', `/api/sites/${pid}/events`, { ...guest, hall: 'grand', date: day(10), session: 'evening', guests: 250, occasion: 'Wedding', ...b });

  const first = await ask({ notes: 'Mehendi the day before' });
  assert.equal(first.status, 201);
  assert.deepEqual([first.json.hallLabel, first.json.session, first.json.guests], ['Grand Hall', 'evening', 250]);
  assert.equal((await ask({ session: 'full' })).status, 409, 'the whole day clashes with the evening');
  assert.equal((await ask({ session: 'day' })).status, 201, 'the daytime is still free');
  assert.equal((await ask({ session: 'day', hall: 'garden', guests: 60 })).status, 201, 'another hall that day');
  assert.deepEqual((await api('GET', `/api/sites/${pid}/events/availability`)).json.taken,
    { grand: { [day(10)]: ['evening', 'day'] }, garden: { [day(10)]: ['day'] } }, 'what is taken, nothing personal');

  assert.equal((await ask({ date: day(0) })).status, 400, 'not today');
  assert.equal((await ask({ date: day(91) })).status, 400, 'too far ahead');
  assert.equal((await ask({ hall: 'garden', guests: 81, date: day(11) })).status, 400, 'over what the hall holds');
  assert.equal((await ask({ occasion: 'Rave', date: day(11) })).status, 400, 'only the kinds the venue hosts');
  assert.equal((await ask({ session: 'night', date: day(11) })).status, 400);
  assert.equal((await ask({ hall: 'empty', date: day(11) })).status, 400, 'not offered');

  await new Promise((r) => setTimeout(r, 200));
  const toDesk = mailbox.filter((m) => m.to.includes('events@banquet.test') && /Event request/.test(m.subject));
  assert.equal(toDesk.length, 3);
  assert.match(toDesk[0].text, /Mehendi/);

  signIn();
  const inbox = (await api('GET', `/api/sites/${pid}/reservations`)).json;
  assert.equal(inbox.events.halls.length, 3, 'the inbox has the published setup');
  const id = inbox.reservations.find((r) => r.session === 'evening').id;
  assert.equal((await api('PATCH', `/api/sites/${pid}/reservations/${id}`, { status: 'confirmed' })).json.status, 'confirmed');
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(mailbox.some((m) => m.to.includes('sita@guest.test') && /event at .* is confirmed/.test(m.subject)), 'the guest hears it is confirmed');

  // Declined frees the evening; taking it back is refused once someone else has it.
  await api('PATCH', `/api/sites/${pid}/reservations/${id}`, { status: 'declined' });
  cookie = '';
  assert.equal((await ask({ guests: 120 })).status, 201, 'the evening is free again');
  signIn();
  const again = await api('PATCH', `/api/sites/${pid}/reservations/${id}`, { status: 'confirmed' });
  assert.equal(again.status, 409);
  assert.match(again.json.error, /hall/);

  const month = new Date().toISOString().slice(0, 7);
  const funnel = (await api('GET', `/api/properties/${pid}/report?month=${month}`)).json.funnel;
  assert.deepEqual([funnel.requests.events, funnel.confirmed.events, funnel.requests.tables], [4, 0, 0], 'event requests are counted as events');
});

test('Book now on a room, hall or table hotspot works with nothing else set up; the team confirms it in Reservations', async () => {
  signIn();
  const pid = (await api('POST', '/api/properties', { title: 'Hotspot Hotel' })).json.id;
  await api('PUT', `/api/properties/${pid}/lead-emails`, { emails: ['desk@hotspothotel.test'] });
  const hs = (id, type, label, payload = {}) => ({ id, type, label, position: [0, 1, 0], radius: 0.4, payload, occludedBy: 'none' });
  await api('PUT', '/api/scenes/hh-lobby', sceneDoc('hh-lobby', { propertyId: pid, title: 'Lobby', hotspots: [
    hs('h-room', 'room', 'Deluxe Room', { price: 'Rs 9,500 / night', deposit: 'Rs 2,000' }),
    hs('h-hall', 'hall', 'Grand Hall', { price: 'Rs 1,500 per plate' }),
    hs('h-table', 'table', 'Window table'),
    hs('h-text', 'text', 'Just words', { text: 'hi' })
  ] }));
  await api('POST', '/api/scenes/hh-lobby/publish');

  cookie = '';
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const guest = { name: 'Ram', phone: '9800000005', email: 'ram@guest.test', formRenderedAt: Date.now() - 5000, space: 'hh-lobby' };
  const ask = (b) => api('POST', `/api/sites/${pid}/requests`, { ...guest, ...b });
  // no website, no booking setup: it still books, and the item comes from the hotspot, not the request
  const room = await ask({ hotspot: 'h-room', date: day(5), checkout: day(7), guests: 2, item: 'Presidential Suite', price: 'Rs 1' });
  assert.equal(room.status, 201);
  assert.equal((await ask({ hotspot: 'h-hall', date: day(20), session: 'evening', guests: 300, occasion: 'Wedding' })).status, 201);
  assert.equal((await ask({ hotspot: 'h-table', date: day(2), time: '19:30', guests: 4 })).status, 201);

  assert.equal((await ask({ hotspot: 'h-text', date: day(1), time: '19:30', guests: 4 })).status, 404, 'only rooms, halls and tables');
  assert.equal((await ask({ hotspot: 'h-room', date: day(5), checkout: day(5), guests: 2 })).status, 400, 'no nights');
  assert.equal((await ask({ hotspot: 'h-room', date: day(-2), checkout: day(1), guests: 2 })).status, 400, 'in the past');
  assert.equal((await ask({ hotspot: 'h-hall', date: day(0), session: 'day', guests: 50 })).status, 400, 'a hall not today');
  assert.equal((await ask({ hotspot: 'h-hall', date: day(9), session: 'night', guests: 50 })).status, 400);
  assert.equal((await ask({ hotspot: 'h-table', date: day(1), time: '7pm', guests: 4 })).status, 400);
  assert.equal((await ask({ hotspot: 'h-table', date: day(1), time: '19:30', guests: 0 })).status, 400);
  const other = (await (signIn(), api('POST', '/api/properties', { title: 'Not this one' }))).json.id;
  cookie = '';
  assert.equal((await api('POST', `/api/sites/${other}/requests`, { ...guest, hotspot: 'h-room', date: day(5), checkout: day(7), guests: 2 })).status, 404, 'another project’s space');

  await new Promise((r) => setTimeout(r, 200));
  const desk = mailbox.filter((m) => m.to.includes('desk@hotspothotel.test') && /Booking request/.test(m.subject));
  assert.equal(desk.length, 3);
  assert.match(desk.find((m) => /Deluxe Room/.test(m.subject)).text, /Rs 2,000/);

  signIn();
  const inbox = (await api('GET', `/api/sites/${pid}/reservations`)).json.reservations;
  const mine = inbox.find((r) => r.of === 'room');
  assert.deepEqual([mine.kind, mine.item, mine.price, mine.nights, mine.spaceTitle], ['request', 'Deluxe Room', 'Rs 9,500 / night', 2, 'Lobby']);
  assert.equal((await api('PATCH', `/api/sites/${pid}/reservations/${mine.id}`, { status: 'confirmed' })).json.status, 'confirmed');
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(mailbox.some((m) => m.to.includes('ram@guest.test') && /is confirmed/.test(m.subject) && /Deposit: Rs 2,000/.test(m.text)), 'the guest hears it, deposit and all');

  const month = new Date().toISOString().slice(0, 7);
  const f = (await api('GET', `/api/properties/${pid}/report?month=${month}`)).json.funnel;
  assert.deepEqual([f.requests.rooms, f.requests.events, f.requests.tables, f.confirmed.rooms], [1, 1, 1, 1], 'counted with their kind of booking');
});

test('a dining room in 3D: every table is its own hotspot, booked by the sitting, never twice at one time', async () => {
  signIn();
  const pid = (await api('POST', '/api/properties', { title: 'Table Room Hotel' })).json.id;
  const hs = (id, label, capacity) => ({ id, type: 'table', label, position: [0, 1, 0], radius: 0.4, payload: { capacity }, occludedBy: 'none' });
  await api('PUT', '/api/scenes/tr-dining', sceneDoc('tr-dining', { propertyId: pid, title: 'Dining', hotspots: [hs('t-1', 'Table 1', 2), hs('t-2', 'Table 2', 6)] }));
  await api('POST', '/api/scenes/tr-dining/publish');

  cookie = '';
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const guest = { name: 'Sita', phone: '9800000006', formRenderedAt: Date.now() - 5000, space: 'tr-dining' };
  const ask = (b) => api('POST', `/api/sites/${pid}/requests`, { ...guest, ...b });
  const times = async (date) => (await api('GET', `/api/sites/${pid}/requests/tables?space=tr-dining&date=${date}`)).json;
  const d = day(3);
  const at = (a, time) => a.slots.find((s) => s.time === time)?.free;

  // no website setup: the default hours, 09:00 to 21:30 every half hour, a table held 90 minutes
  const open = await times(d);
  assert.equal(open.date, d);
  assert.deepEqual([open.slots[0].time, open.slots.at(-1).time], ['09:00', '21:30']);
  assert.deepEqual(at(open, '19:30'), ['t-1', 't-2']);

  assert.equal((await ask({ hotspot: 't-1', date: d, time: '19:30', guests: 2 })).status, 201);
  assert.equal((await ask({ hotspot: 't-1', date: d, time: '20:00', guests: 2 })).status, 409, 'the same table, the same sitting');
  assert.equal((await ask({ hotspot: 't-2', date: d, time: '20:00', guests: 5 })).status, 201, 'another table is free');
  assert.equal((await ask({ hotspot: 't-1', date: d, time: '21:00', guests: 2 })).status, 201, 'after the sitting');
  assert.equal((await ask({ hotspot: 't-1', date: d, time: '08:30', guests: 2 })).status, 400, 'before opening');
  assert.equal((await ask({ hotspot: 't-1', date: d, time: '19:45', guests: 2 })).status, 400, 'not a slot');
  assert.equal((await ask({ hotspot: 't-1', date: day(4), time: '19:30', guests: 3 })).status, 400, 'more than it seats');

  const later = await times(d);
  assert.deepEqual([at(later, '19:30'), at(later, '21:30'), at(later, '22:00')], [[], ['t-2'], undefined]);
  assert.equal((await api('GET', `/api/sites/${pid}/requests/tables?space=hh-lobby`)).status, 404, 'another project’s space');
  assert.deepEqual(open.tables, ['t-1', 't-2']);
  // a space not published yet (the studio trying its draft): the times still come, no tables known
  const draft = (await api('GET', `/api/sites/${pid}/requests/tables?space=tr-not-yet&date=${d}`)).json;
  assert.deepEqual([draft.tables, draft.slots.length, draft.slots[0].time], [[], 26, '09:00']);

  // declined, the table is free again
  signIn();
  const first = (await api('GET', `/api/sites/${pid}/reservations`)).json.reservations.find((r) => r.hotspot === 't-1' && r.time === '19:30');
  await api('PATCH', `/api/sites/${pid}/reservations/${first.id}`, { status: 'declined' });
  cookie = '';
  assert.deepEqual(at(await times(d), '19:30'), ['t-1']);
});

test('more dining places: a café beside the restaurant, its own menu, hours and tables, booked apart', async () => {
  signIn();
  const pid = (await api('POST', '/api/properties', { title: 'Two Kitchens' })).json.id;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 3)]);
  const plan = (await api('POST', `/api/sites/${pid}/images`, new Uint8Array(png), { 'Content-Type': 'application/octet-stream' })).json.path;
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const tables = (first, last) => ({ on: true, plan, timezone: 'UTC', first, last, slot: 60, stay: 60, days: 14, maxParty: 6, tables: [{ id: 't1', label: 'T1', seats: 4, x: 0.5, y: 0.5 }] });
  const saved = await api('PUT', `/api/sites/${pid}/draft`, {
    booking: { ...tables('18:00', '20:00'), name: 'The Restaurant' },
    dining: [
      { id: 'cafe', name: 'Courtyard Café', menu: { title: 'Café', items: [{ name: 'Masala chiya', price: 'Rs 80' }] }, booking: tables('08:00', '10:00') },
      { id: 'cafe', name: 'Duplicate id, dropped' },
      { id: 'bar', name: '' }
    ]
  });
  assert.deepEqual(saved.json.draft.dining.map((o) => o.id), ['cafe']);
  assert.equal(saved.json.draft.booking.name, 'The Restaurant');
  await api('POST', `/api/sites/${pid}/publish`);

  cookie = '';
  const site = (await api('GET', `/api/sites/${pid}`)).json.site;
  assert.equal(site.dining[0].menu.items[0].name, 'Masala chiya');
  assert.equal(site.dining[0].booking.first, '08:00', 'its own hours');
  const slots = (outlet) => api('GET', `/api/sites/${pid}/availability?date=${day(1)}${outlet ? `&outlet=${outlet}` : ''}`).then((r) => r.json.slots);
  assert.deepEqual((await slots('cafe')).map((s) => s.time), ['08:00', '09:00', '10:00']);
  assert.deepEqual((await slots('')).map((s) => s.time), ['18:00', '19:00', '20:00']);
  assert.equal((await api('GET', `/api/sites/${pid}/booking?outlet=nope`)).json.booking, null);
  assert.deepEqual((await api('GET', `/api/sites/${pid}/booking`)).json.places.map((b) => [b.name, b.outlet]), [['The Restaurant', undefined], ['Courtyard Café', 'cafe']], 'the tour hears every place');

  const guest = { name: 'Asha', phone: '9800000004', formRenderedAt: Date.now() - 5000, date: day(1), party: 2, table: 't1' };
  const cafe = await api('POST', `/api/sites/${pid}/reservations`, { ...guest, outlet: 'cafe', time: '09:00' });
  assert.equal(cafe.status, 201);
  // the same table id at the restaurant is another table
  assert.deepEqual((await slots('')).find((s) => s.time === '19:00').free, ['t1'], 'the café booking holds nothing at the restaurant');
  assert.deepEqual((await slots('cafe')).find((s) => s.time === '09:00').free, []);
  assert.equal((await api('POST', `/api/sites/${pid}/reservations`, { ...guest, outlet: 'cafe', time: '09:00' })).status, 409);
  assert.equal((await api('POST', `/api/sites/${pid}/reservations`, { ...guest, time: '19:00' })).status, 201, 'the restaurant’s T1 is free');

  signIn();
  const inbox = (await api('GET', `/api/sites/${pid}/reservations`)).json;
  assert.deepEqual(inbox.dining.map((o) => o.name), ['Courtyard Café']);
  const mine = inbox.reservations.find((r) => r.outlet === 'cafe');
  assert.equal(mine.outletName, 'Courtyard Café');
  await api('PATCH', `/api/sites/${pid}/reservations/${mine.id}`, { status: 'declined' });
  cookie = '';
  assert.deepEqual((await slots('cafe')).find((s) => s.time === '09:00').free, ['t1'], 'declined: free again');
});

test('a website scheduled to go live does, as it was when scheduled; a cancelled one doesn\'t', async () => {
  signIn();
  const pid = (await api('POST', '/api/properties', { title: 'Midnight Menu' })).json.id;
  await api('PUT', `/api/sites/${pid}/draft`, { menu: { title: 'Summer menu', items: [{ name: 'Mango lassi', price: 'Rs 250' }] } });
  await api('POST', `/api/sites/${pid}/publish`);
  await api('PUT', `/api/sites/${pid}/draft`, { menu: { title: 'Winter menu', items: [{ name: 'Masala chiya', price: 'Rs 80' }] } });

  assert.equal((await api('POST', `/api/sites/${pid}/schedule`, { at: new Date(Date.now() - 60000).toISOString() })).status, 400, 'not in the past');
  assert.equal((await api('POST', `/api/sites/${pid}/schedule`, { at: 'midnight' })).status, 400);
  const at = new Date(Date.now() + 1200).toISOString();
  assert.equal((await api('POST', `/api/sites/${pid}/schedule`, { at })).json.scheduledAt, at);
  assert.equal((await api('GET', `/api/sites/${pid}/draft`)).json.scheduledAt, at);
  // edited after scheduling: that waits for the next publish
  await api('PUT', `/api/sites/${pid}/draft`, { menu: { title: 'Not yet', items: [] } });
  assert.equal((await api('GET', `/api/sites/${pid}`)).json.site.menu.title, 'Summer menu', 'not before its time');

  await new Promise((r) => setTimeout(r, 2000));
  assert.equal((await api('GET', `/api/sites/${pid}`)).json.site.menu.title, 'Winter menu', 'live, as it was when scheduled');
  const after = (await api('GET', `/api/sites/${pid}/draft`)).json;
  assert.deepEqual([after.scheduledAt, after.draft.menu.title], [null, 'Not yet']);
  assert.ok((await api('GET', `/api/properties/${pid}/activity`)).json.some((e) => e.action === 'published the website on schedule'));

  // scheduled, then cancelled
  await api('POST', `/api/sites/${pid}/schedule`, { at: new Date(Date.now() + 800).toISOString() });
  assert.equal((await api('DELETE', `/api/sites/${pid}/schedule`)).json.scheduledAt, null);
  await new Promise((r) => setTimeout(r, 1300));
  assert.equal((await api('GET', `/api/sites/${pid}`)).json.site.menu.title, 'Winter menu');
  cookie = '';
  assert.equal((await api('POST', `/api/sites/${pid}/schedule`, { at })).status, 401);
});

test('a client reviews the draft by a private link: comments pinned to sections, an approval tied to that draft', async () => {
  signIn();
  const pid = (await api('POST', '/api/properties', { title: 'Review Lodge' })).json.id;
  await api('PUT', `/api/sites/${pid}/draft`, { hero: { title: 'First draft' } });
  const key = (await api('POST', `/api/sites/${pid}/review`)).json.key;
  assert.match(key, /^[0-9a-f]{48}$/);
  assert.equal((await api('POST', `/api/sites/${pid}/review`)).json.key, key, 'the same link each time');

  cookie = ''; // the client has no account: the key is the pass
  assert.equal((await api('GET', `/api/sites/${pid}/review?key=${'0'.repeat(48)}`)).status, 404);
  assert.equal((await api('GET', `/api/sites/${pid}/review`)).status, 404);
  const draft = (await api('GET', `/api/sites/${pid}/review?key=${key}`)).json;
  assert.equal(draft.site.hero.title, 'First draft');
  assert.equal(draft.preview, true);
  assert.equal((await api('GET', `/api/sites/${pid}`)).status, 404, 'still nothing public');

  const comment = (b) => api('POST', `/api/sites/${pid}/review/comments?key=${key}`, { name: 'Mr Thapa', text: 'Bigger logo, please', sec: 2, x: 0.25, y: 0.5, where: 'First draft', ...b });
  const c = await comment();
  assert.equal(c.status, 201);
  assert.deepEqual([c.json.sec, c.json.x, c.json.y, c.json.resolved], [2, 0.25, 0.5, false]);
  assert.equal((await comment({ text: '' })).status, 400);
  assert.equal((await comment({ name: '' })).status, 400);
  assert.equal((await comment({ text: '<script>x</script>ok' })).json.text, 'scriptx/scriptok', 'no HTML');
  assert.equal((await api('POST', `/api/sites/${pid}/review/approve?key=${key}`, { name: 'Mr Thapa' })).json.name, 'Mr Thapa');

  // the draft's table booking shows its free times on the review page too, with the key
  signIn();
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 3)]);
  const plan = (await api('POST', `/api/sites/${pid}/images`, new Uint8Array(png), { 'Content-Type': 'application/octet-stream' })).json.path;
  await api('PUT', `/api/sites/${pid}/draft`, { hero: { title: 'First draft' }, booking: { on: true, plan, timezone: 'UTC', first: '12:00', last: '12:30', tables: [{ id: 't1', label: 'T1', seats: 2, x: 0.5, y: 0.5 }] } });
  cookie = '';
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  assert.deepEqual((await api('GET', `/api/sites/${pid}/preview/availability?date=${tomorrow}&key=${key}`)).json.slots.map((s) => s.time), ['12:00', '12:30']);
  assert.equal((await api('GET', `/api/sites/${pid}/preview/availability?key=${'f'.repeat(48)}`)).status, 404);
  assert.equal((await api('GET', `/api/sites/${pid}/preview/availability`)).status, 401, 'without a key, the studio’s session');
  assert.equal((await api('PUT', `/api/sites/${pid}/draft?key=${key}`, {})).status, 401, 'the key never edits');
  signIn();
  await api('PUT', `/api/sites/${pid}/draft`, { hero: { title: 'First draft' } }); // back as the client approved it

  signIn();
  let fb = (await api('GET', `/api/sites/${pid}/review/feedback`)).json;
  assert.equal(fb.comments.length, 2);
  assert.deepEqual([fb.approval.name, fb.approvedThisDraft], ['Mr Thapa', true]);
  assert.ok((await api('GET', `/api/properties/${pid}/activity`)).json.some((e) => e.action === 'approved the website draft' && e.who.name === 'Mr Thapa'));
  assert.equal((await api('PATCH', `/api/sites/${pid}/review/comments/${c.json.id}`, { resolved: true })).json.resolved, true);
  // a change after the approval: it's an earlier draft that was approved
  await api('PUT', `/api/sites/${pid}/draft`, { hero: { title: 'Second draft' } });
  fb = (await api('GET', `/api/sites/${pid}/review/feedback`)).json;
  assert.equal(fb.approvedThisDraft, false);

  // the link stopped: the client can't get in, the comments stay
  await api('DELETE', `/api/sites/${pid}/review`);
  cookie = '';
  assert.equal((await api('GET', `/api/sites/${pid}/review?key=${key}`)).status, 404);
  assert.equal((await comment()).status, 404);
  signIn();
  assert.equal((await api('GET', `/api/sites/${pid}/review/feedback`)).json.comments.length, 2);
  assert.notEqual((await api('POST', `/api/sites/${pid}/review`)).json.key, key, 'a new link, not the old one');
});

test('the concierge answers from what the project published, and only sends visitors to real published places', async () => {
  signIn();
  const pid = (await api('POST', '/api/properties', { title: 'Ask Hotel' })).json.id;
  await api('PUT', `/api/properties/${pid}/info`, { phone: '01-5551234', about: 'A garden hotel in Patan.' });
  const tr = { id: 'to-pool', label: 'The pool', keyframes: [{ t: 0, position: [0, 1.6, 0], target: [0, 1.6, -1], easing: 'easeInOutCubic' }], cues: [], audio: null, seconds: 4 };
  const hs = { id: 'hs-spa', type: 'text', label: 'Spa', position: [0, 1, 0], radius: 0.4, payload: { text: 'Open 9 to 6.' }, occludedBy: 'none' };
  await api('PUT', '/api/scenes/ask-garden', sceneDoc('ask-garden', { propertyId: pid, title: 'Garden', tracks: [tr], hotspots: [hs] }));
  await api('POST', '/api/scenes/ask-garden/publish');
  await api('PUT', '/api/scenes/ask-draft', sceneDoc('ask-draft', { propertyId: pid, title: 'Secret draft room' }));
  await api('PUT', `/api/sites/${pid}/draft`, { menu: { title: 'Menu', items: [{ name: 'Dal bhat', price: 'Rs 450' }] } });
  await api('POST', `/api/sites/${pid}/publish`);

  cookie = ''; // visitors: public
  assert.deepEqual((await api('GET', `/api/concierge/${pid}`)).json, { on: true });
  texts.length = 0;
  modelReply = { answer: 'The spa is open 9 to 6. Here it is.', space: 'ask-garden', view: 'to-pool', hotspot: 'hs-spa' };
  const r = await api('POST', `/api/concierge/${pid}`, { question: 'When is the spa open?', space: 'ask-garden', lang: 'ne', history: [{ role: 'assistant', text: 'Hi!' }] });
  assert.deepEqual(r.json, { answer: 'The spa is open 9 to 6. Here it is.', show: { space: 'ask-garden', view: 'to-pool', hotspot: 'hs-spa' } });
  const sent = texts.find((t) => t.url === '/anthropic');
  assert.equal(sent.key, 'test-anthropic-key');
  assert.equal(sent.body.model, 'test-model');
  assert.deepEqual(sent.body.tool_choice, { type: 'tool', name: 'reply' });
  assert.match(sent.body.system, /A garden hotel in Patan/);
  assert.ok(sent.body.system.includes('Dal bhat (Rs 450)'));
  assert.ok(sent.body.system.includes('Hotspot "Spa" [hotspot: hs-spa]: Open 9 to 6'));
  assert.match(sent.body.system, /Reply in Nepali/);
  assert.doesNotMatch(sent.body.system, /Secret draft room/, 'nothing unpublished goes in');
  assert.deepEqual(sent.body.messages, [{ role: 'user', content: 'When is the spa open?' }], 'history starts with the visitor');

  // a made-up or unpublished place is dropped; a made-up view in a real space too
  modelReply = { answer: 'Somewhere.', space: 'ask-draft' };
  assert.equal((await api('POST', `/api/concierge/${pid}`, { question: 'Secret room?' })).json.show, null);
  modelReply = { answer: 'The garden.', space: 'ask-garden', view: 'nope' };
  assert.deepEqual((await api('POST', `/api/concierge/${pid}`, { question: 'Garden?' })).json.show, { space: 'ask-garden' });
  assert.equal((await api('POST', `/api/concierge/${pid}`, { question: '  ' })).status, 400);
  assert.equal((await api('POST', '/api/concierge/no-such-place', { question: 'Hi' })).status, 404);
});

test('phone numbers as guests type them become what SMS and WhatsApp want', () => {
  assert.deepEqual(phoneOf('9812345678'), { intl: '9779812345678', local: '9812345678' });
  assert.deepEqual(phoneOf('+977 981-234-5678'), { intl: '9779812345678', local: '9812345678' });
  assert.deepEqual(phoneOf('00977 9812345678'), { intl: '9779812345678', local: '9812345678' });
  assert.deepEqual(phoneOf('9779812345678'), { intl: '9779812345678', local: '9812345678' });
  assert.deepEqual(phoneOf('+44 7700 900123'), { intl: '447700900123', local: null }, 'abroad: WhatsApp only');
  assert.deepEqual(phoneOf('01-4412345'), { intl: '97714412345', local: null }, 'a landline: no SMS');
  assert.equal(phoneOf('call me'), null);
});

test('a full day goes to a waitlist; a place let go tells them by SMS, WhatsApp and email; guests get texts', async () => {
  signIn();
  const pid = (await api('POST', '/api/properties', { title: 'Wait Bistro' })).json.id;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 3)]);
  const plan = (await api('POST', `/api/sites/${pid}/images`, new Uint8Array(png), { 'Content-Type': 'application/octet-stream' })).json.path;
  await api('PUT', `/api/sites/${pid}/draft`, {
    booking: { on: true, plan, timezone: 'UTC', first: '19:00', last: '19:00', tables: [{ id: 't1', label: 'Only table', seats: 2, x: 0.5, y: 0.5 }] }
  });
  await api('POST', `/api/sites/${pid}/publish`);
  cookie = '';
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const guest = { formRenderedAt: Date.now() - 5000 };
  const booked = await api('POST', `/api/sites/${pid}/reservations`, { ...guest, table: 't1', date: tomorrow, time: '19:00', party: 2, name: 'First', phone: '9811111111' });
  assert.equal(booked.status, 201);
  assert.equal((await api('POST', `/api/sites/${pid}/reservations`, { ...guest, table: 'any', date: tomorrow, time: '19:00', party: 2, name: 'Late', phone: '9812345678' })).status, 409, 'full');

  const wait = (b) => api('POST', `/api/sites/${pid}/waitlist`, { ...guest, of: 'table', date: tomorrow, party: 2, name: 'Late', phone: '9812345678', email: 'late@guest.test', ...b });
  assert.equal((await wait()).status, 201);
  assert.equal((await wait({ party: 3, name: 'Too many', phone: '9813333333', email: '' })).status, 201, 'three can wait, a table for two won’t fit them');
  assert.equal((await wait({ time: '20:00' })).status, 400, 'not a time they serve');
  assert.equal((await wait({ of: 'room', checkin: tomorrow, checkout: tomorrow })).status, 404, 'no room booking here');

  signIn();
  let inbox = (await api('GET', `/api/sites/${pid}/reservations`)).json.reservations;
  const waits = inbox.filter((r) => r.kind === 'wait');
  assert.deepEqual(waits.map((w) => [w.name, w.status, w.of, w.party]), [['Late', 'waiting', 'table', 2], ['Too many', 'waiting', 'table', 3]]);

  texts.length = 0;
  const declined = await api('PATCH', `/api/sites/${pid}/reservations/${booked.json.id}`, { status: 'declined' });
  assert.equal(declined.json.waitlistTold, 1, 'the party of two is told; the three still wait');
  await new Promise((r) => setTimeout(r, 300));
  inbox = (await api('GET', `/api/sites/${pid}/reservations`)).json.reservations;
  assert.deepEqual(inbox.filter((r) => r.kind === 'wait').map((w) => w.status), ['notified', 'waiting']);

  const sms = texts.filter((t) => t.url === '/sms/');
  const wa = texts.filter((t) => t.url === '/wa/1234/messages');
  assert.ok(sms.some((t) => t.body.to === '9812345678' && /may now be free/.test(t.body.text) && t.body.token === 'test-sms-token' && t.body.from === 'TestHotel'), 'the waiting guest, by SMS');
  assert.ok(wa.some((t) => t.body.to === '9779812345678' && /may now be free/.test(t.body.text.body) && t.auth === 'Bearer test-wa-token'), 'and WhatsApp');
  assert.ok(mailbox.some((m) => m.to.includes('late@guest.test') && /may be free/.test(m.subject)), 'and email');
  assert.ok(sms.some((t) => t.body.to === '9811111111' && /can’t seat you/.test(t.body.text)), 'the declined guest hears by text, with no email given');

  // by hand: remove a waiting guest; a booking can't be "notified"
  const three = inbox.find((r) => r.name === 'Too many');
  assert.equal((await api('PATCH', `/api/sites/${pid}/reservations/${three.id}`, { status: 'removed' })).json.status, 'removed');
  assert.equal((await api('PATCH', `/api/sites/${pid}/reservations/${booked.json.id}`, { status: 'notified' })).status, 400);
  assert.equal((await api('PATCH', `/api/sites/${pid}/reservations/${three.id}`, { status: 'confirmed' })).status, 400);
});

test('the website preview shows the saved draft to the team, before and apart from publishing', async () => {
  signIn();
  const pid = (await api('POST', '/api/properties', { title: 'Preview Cafe' })).json.id;
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 3)]);
  const plan = (await api('POST', `/api/sites/${pid}/images`, new Uint8Array(png), { 'Content-Type': 'application/octet-stream' })).json.path;
  await api('PUT', `/api/sites/${pid}/draft`, {
    hero: { title: 'Draft title' },
    booking: { on: true, plan, timezone: 'UTC', first: '12:00', last: '13:00', tables: [{ id: 't1', label: 'T1', seats: 2, x: 0.5, y: 0.5 }] }
  });
  const pre = await api('GET', `/api/sites/${pid}/preview`);
  assert.equal(pre.status, 200);
  assert.equal(pre.json.preview, true);
  assert.equal(pre.json.site.hero.title, 'Draft title');
  assert.equal(pre.json.site.booking.tables[0].id, 't1');
  assert.equal(pre.json.publishedAt, null);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const av = await api('GET', `/api/sites/${pid}/preview/availability?date=${tomorrow}`);
  assert.deepEqual(av.json.slots.map((s) => s.time), ['12:00', '12:30', '13:00']);
  assert.equal((await api('GET', `/api/sites/${pid}`)).status, 404, 'still nothing public');
  assert.equal((await api('GET', `/api/sites/${pid}/availability`)).status, 404, 'and no public booking');

  await api('POST', `/api/sites/${pid}/publish`);
  await api('PUT', `/api/sites/${pid}/draft`, { hero: { title: 'Newer draft' } });
  assert.equal((await api('GET', `/api/sites/${pid}/preview`)).json.site.hero.title, 'Newer draft');
  assert.equal((await api('GET', `/api/sites/${pid}`)).json.site.hero.title, 'Draft title', 'the public site waits for Publish');

  cookie = '';
  assert.equal((await api('GET', `/api/sites/${pid}/preview`)).status, 401);
  assert.equal((await api('GET', `/api/sites/${pid}/preview/availability`)).status, 401);
});

test('a project carries its brand information, checked, and its website shows it', async () => {
  const owner = await signUpUser('Brand Owner', 'brand-owner@geonova.com.np');
  const other = await signUpUser('Brand Other', 'brand-other@geonova.com.np');
  cookie = owner.cookie;
  const pid = (await api('POST', '/api/properties', { title: 'Himal Cafe' })).json.id;
  const set = await api('PUT', `/api/properties/${pid}/info`, {
    tagline: 'Coffee with a view <b>', about: 'Since 2009.', phone: '+977 1 5550000', email: 'hello@himal.cafe',
    website: 'himal.cafe', instagram: 'https://instagram.com/himalcafe', address: 'Jhamsikhel, Lalitpur'
  });
  assert.equal(set.status, 200);
  assert.equal(set.json.info.tagline, 'Coffee with a view b', 'no HTML');
  assert.equal(set.json.info.website, 'https://himal.cafe', 'a bare domain becomes a link');
  assert.equal((await api('PUT', `/api/properties/${pid}/info`, { email: 'not-an-email' })).status, 400);
  assert.equal((await api('PUT', `/api/properties/${pid}/info`, { facebook: 'javascript:alert(1)' })).status, 400);
  assert.equal((await api('PUT', `/api/properties/${pid}/info`, { about: '' })).json.info.about, undefined, 'empty removes it');
  assert.equal((await api('PUT', `/api/properties/${pid}/info`, { whatsapp: '980-1234567' })).json.info.whatsapp, '9779801234567', 'as wa.me wants it');
  assert.equal((await api('PUT', `/api/properties/${pid}/info`, { whatsapp: 'call us' })).status, 400);

  await api('PUT', `/api/sites/${pid}/draft`, { hero: { title: 'Himal Cafe' } });
  await api('POST', `/api/sites/${pid}/publish`);
  cookie = '';
  assert.equal((await api('GET', `/api/sites/${pid}`)).json.project.info.phone, '+977 1 5550000');
  assert.equal((await api('GET', `/api/properties/${pid}/theme`)).json.whatsapp, '9779801234567', 'the tour’s WhatsApp button reads it');
  cookie = other.cookie;
  assert.equal((await api('PUT', `/api/properties/${pid}/info`, { phone: '1' })).status, 404, 'not someone else’s');
});

test('with the cloud driver, uploads really live in the bucket, not on this PC', { skip: !USE_S3 && 'runs in api-s3.test.js' }, () => {
  assert.equal(s3.stats.badSignatures, 0, 'every request was signed correctly');
  const keys = [...s3.objects.keys()];
  assert.ok(keys.length > 10, `the bucket holds the suite's uploads (${keys.length} files)`);
  assert.ok(keys.every((k) => k.startsWith('assets/')), 'all under the assets/ prefix');
  assert.ok(!existsSync(path.join(DATA, 'assets')), 'nothing written to the local asset folder');
});

test('a 360 camera video is a space: an MP4 in, streamed by byte range; raw INSV and fakes refused', async () => {
  signIn();
  const send = async (name, bytes) => {
    const { json: { assetId } } = await api('POST', '/api/assets');
    const r = await api('PUT', `/api/assets/${assetId}/files/chunk?relPath=${encodeURIComponent(name)}&offset=0`, bytes, { 'Content-Type': 'application/octet-stream' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    return { assetId, fin: await api('POST', `/api/assets/${assetId}/finalize?kind=video360`) };
  };
  const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(4000, 7)]);

  const ok = await send('lobby-360.mp4', mp4);
  assert.equal(ok.fin.status, 200, JSON.stringify(ok.fin.json));
  assert.deepEqual([ok.fin.json.format, ok.fin.json.meta, ok.fin.json.bytes], ['video360', 'lobby-360.mp4', mp4.length]);
  const part = await fetch(`${BASE}/api/assets/${ok.assetId}/lobby-360.mp4`, { headers: { Range: 'bytes=0-99' } });
  assert.equal(part.status, 206, 'streams by byte range, like the scans');
  assert.equal((await part.arrayBuffer()).byteLength, 100);

  const insv = await send('VID_2026.insv', mp4);
  assert.equal(insv.fin.status, 400);
  assert.match(insv.fin.json.error, /Insta360 Studio/, 'says how to get a 360 MP4');
  const fake = await send('not-a-video.mp4', Buffer.from('hello, this is text and not a video file at all'));
  assert.equal(fake.fin.status, 400);

  // a space made from it publishes without the "loads whole" warning a big 3D model gets
  const doc = sceneDoc('lobby-360', { splat: { format: 'video360', variants: { high: { assetId: ok.assetId, meta: 'lobby-360.mp4', bytes: 900e6 } } } });
  assert.equal((await api('PUT', '/api/scenes/lobby-360', doc)).status, 200);
  const pub = await api('GET', '/api/scenes/lobby-360/publish');
  assert.ok(!JSON.stringify(pub.json).includes('loads whole'), JSON.stringify(pub.json));
});
