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

before(async () => {
  await new Promise((r) => mailServer.listen(0, '127.0.0.1', r));
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
      RESEND_API_KEY: 'test-mail-key',
      RESEND_API_URL: `http://127.0.0.1:${mailServer.address().port}/emails`,
      LEADS_TO: '',
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
  mailServer.close();
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

  // an admin sees and manages everything without being added
  const admin = 'first@geonova.com.np'; // created in the previous test, still the only admin
  const adminLogin = await api('POST', '/api/auth/login', { email: admin, password: 'plenty-long-8' });
  cookie = adminLogin.headers.get('set-cookie').split(';')[0];
  assert.ok((await api('GET', '/api/properties')).json.some((p) => p.id === id));
  assert.equal((await api('GET', `/api/properties/${id}`)).status, 200);
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
  assert.equal((await api('DELETE', `/api/assets/${assetId}`)).status, 403, 'cannot delete its model');
  assert.equal((await fetch(`${BASE}/api/assets/${assetId}/private-lobby.glb`)).status, 200, 'the model itself still streams to visitors');

  // added to the project, a teammate can work on it
  cookie = owner.cookie;
  await api('POST', `/api/properties/${pid}/members`, { email: helper.user.email });
  cookie = helper.cookie;
  assert.equal((await api('PUT', '/api/scenes/private-lobby', { ...doc, title: 'Lobby, retouched' })).status, 200);
  assert.ok((await api('GET', '/api/scenes')).json.some((s) => s.id === 'private-lobby'));

  // unfiled spaces stay open to everyone, as before
  cookie = outsider.cookie;
  assert.equal((await api('PUT', '/api/scenes/outsider-room', sceneDoc('outsider-room'))).status, 200);
  // and the public list, with no session, is unchanged
  cookie = '';
  assert.ok((await api('GET', '/api/scenes')).json.some((s) => s.id === 'private-lobby'));
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

  // public, for the tour: just the branding
  cookie = '';
  const pub = await api('GET', `/api/properties/${pid}/theme`);
  assert.deepEqual(Object.keys(pub.json).sort(), ['theme', 'title']);
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
  assert.equal((await send({ sceneId: 'enquiry-suite', sceneName: 'Deluxe suite', propertyId: 'someone-else', message: '=HYPERLINK("http://x")', email: 'asha@mail.com' })).status, 200);
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
