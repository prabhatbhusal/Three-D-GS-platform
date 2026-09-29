/**
 * Project websites (/s/<project>): an editorial page around the project's
 * live tour — its story, its rooms, photos, floor plan, a menu, and the
 * enquiry form. The tour itself is the published one, embedded as-is. The
 * studio edits a draft; publishing copies it to what the public page reads.
 * Stored as data/sites/<project>.json: { draft, published, publishedAt, scheduled? }.
 * Photos are the asset `site_<project>`.
 *
 *   GET  /api/sites/:id           public: the published site, ready to render
 *   GET  /api/sites/:id/draft     studio: the draft, and the project's spaces and viewpoints
 *   PUT  /api/sites/:id/draft     studio: save the draft
 *   POST /api/sites/:id/publish   studio: put the draft live
 *   POST /api/sites/:id/schedule  studio: { at } put the draft, as it is now, live then
 *   DELETE /api/sites/:id/schedule  studio: cancel that
 *
 * Client review (2026-09-28): a private link to the draft for the client,
 * who pins comments on it and approves it; no account needed, the link's key
 * is the pass.
 *   POST   /api/sites/:id/review                      studio: the review link's key (made once, kept)
 *   DELETE /api/sites/:id/review                      studio: the link stops working (comments are kept)
 *   GET    /api/sites/:id/review/feedback             studio: comments, the approval, and whether it's this draft
 *   PATCH  /api/sites/:id/review/comments/:cid        studio: { resolved }
 *   GET    /api/sites/:id/review?key=                 the client: the draft, shaped like the public site, and its comments
 *   POST   /api/sites/:id/review/comments?key=        the client: { name, text, sec, x, y, where }
 *   POST   /api/sites/:id/review/approve?key=         the client: { name }
 *   POST /api/sites/:id/images    studio: a photo (PNG, JPEG or WebP body) -> { path }
 */
import { Router } from 'express';
import express from 'express';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { DATA_DIR } from '../dataDir.js';
import * as storage from '../storage.js';
import { getProperty, getPublishedScene, getEmbed, listScenes, listPublished } from '../store.js';
import { requireEditorSession } from '../middleware/auth.js';
import { visibleProject } from './properties.js';
import { imageKind, imageSize } from './assets.js';
import { embedKey } from './embed.js';
import { record } from '../activity.js';
import { removeReservations } from '../reservations.js';

export const sitesRouter = Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

const SITES_DIR = path.join(DATA_DIR, 'sites');
const fileOf = (pid) => path.join(SITES_DIR, `${pid}.json`);
export async function readSite(pid) {
  try { return JSON.parse(await fs.readFile(fileOf(pid), 'utf8')); } catch { return null; }
}
async function write(pid, data) {
  await fs.mkdir(SITES_DIR, { recursive: true });
  await fs.writeFile(fileOf(pid), JSON.stringify(data, null, 2));
}
export const removeSite = async (pid) => {
  await fs.rm(fileOf(pid), { force: true });
  await removeReservations(pid);
  await storage.remove(`site_${pid}`);
};

/** The website's looks (website.css [data-style]); the first is the default. */
const STYLES = ['heritage', 'modern', 'night'];

/** Only the fields the page knows, trimmed and capped: the draft is whatever the studio sent. */
export function cleanSite(d, pid) {
  const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const list = (a, n, f) => (Array.isArray(a) ? a : []).slice(0, n).map(f);
  const img = (v) => (typeof v === 'string' && new RegExp(`^site_${pid}/img-\\d+(-\\d+x\\d+)?\\.(png|jpg|webp)$`).test(v) ? v : '');
  const id = (v) => (typeof v === 'string' && /^[\w-]{1,80}$/.test(v) ? v : '');
  d = d && typeof d === 'object' ? d : {};
  return {
    style: STYLES.includes(d.style) ? d.style : STYLES[0],
    hero: { eyebrow: s(d.hero?.eyebrow, 80), title: s(d.hero?.title, 120), lede: s(d.hero?.lede, 400), space: id(d.hero?.space), image: img(d.hero?.image) },
    facts: list(d.facts, 6, (f) => ({ n: s(f?.n, 20), k: s(f?.k, 60) })).filter((f) => f.n || f.k),
    story: { title: s(d.story?.title, 120), body: s(d.story?.body, 2000) },
    rooms: list(d.rooms, 12, (r) => ({
      title: s(r?.title, 80), body: s(r?.body, 600), features: s(r?.features, 200),
      image: img(r?.image), space: id(r?.space), view: id(r?.view)
    })).filter((r) => r.title || r.body || r.image),
    plan: d.plan === true,
    gallery: list(d.gallery, 24, img).filter(Boolean),
    menu: {
      title: s(d.menu?.title, 80), note: s(d.menu?.note, 300),
      items: list(d.menu?.items, 40, (m) => ({ name: s(m?.name, 80), desc: s(m?.desc, 200), price: s(m?.price, 30), tag: s(m?.tag, 30) }))
        .filter((m) => m.name)
    },
    contact: { title: s(d.contact?.title, 120), body: s(d.contact?.body, 400) },
    booking: cleanBooking(d.booking, { s, img, id }),
    stays: cleanStays(d.stays, { s, img, id })
  };
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const validTimezone = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } };

/** Table booking (reservations.js): the floor plan the restaurant gave, its
 *  tables placed on it (x, y as fractions of the plan), and its hours. */
function cleanBooking(b, { s, img, id }) {
  b = b && typeof b === 'object' ? b : {};
  const int = (v, lo, hi, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
  const oneOf = (v, ok, dflt) => (ok.includes(v) ? v : dflt);
  const frac = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 10000) / 10000)) : 0.5; };
  const first = TIME.test(b.first) ? b.first : '12:00';
  const last = TIME.test(b.last) && b.last >= first ? b.last : first > '21:30' ? first : '21:30';
  const seen = new Set();
  const tables = (Array.isArray(b.tables) ? b.tables : []).slice(0, 60).map((t) => ({
    id: typeof t?.id === 'string' && /^[a-z0-9-]{1,24}$/i.test(t.id) ? t.id : '',
    label: s(t?.label, 24), seats: int(t?.seats, 1, 30, 4), x: frac(t?.x), y: frac(t?.y),
    shape: oneOf(t?.shape, ['round', 'square', 'long'], 'round'), area: s(t?.area, 40), view: id(t?.view)
  })).filter((t) => t.id && !seen.has(t.id) && seen.add(t.id));
  return {
    on: b.on === true, plan: img(b.plan), tables, first, last,
    slot: oneOf(Number(b.slot), [15, 30, 60], 30), stay: oneOf(Number(b.stay), [60, 90, 120, 150, 180], 90),
    days: int(b.days, 1, 90, 30), maxParty: int(b.maxParty, 1, 30, 8),
    closed: [...new Set((Array.isArray(b.closed) ? b.closed : []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort(),
    timezone: typeof b.timezone === 'string' && validTimezone(b.timezone) ? b.timezone : 'Asia/Kathmandu',
    note: s(b.note, 300)
  };
}

/** The booking setup the public page may use: switched on, with a plan and tables. */
export const liveBooking = (site) => {
  const b = site?.booking;
  return b?.on && b.plan && b.tables.length ? b : null;
};

/** Room booking (stays.js): the hotel's room types, how many of each and
 *  how many each sleeps, check-in and check-out times, how long a stay may
 *  be. A site plan is optional; a room with `pin` sits on it at x, y. */
function cleanStays(b, { s, img, id }) {
  b = b && typeof b === 'object' ? b : {};
  const int = (v, lo, hi, dflt) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
  const frac = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 10000) / 10000)) : 0.5; };
  const seen = new Set();
  const rooms = (Array.isArray(b.rooms) ? b.rooms : []).slice(0, 40).map((r) => ({
    id: typeof r?.id === 'string' && /^[a-z0-9-]{1,24}$/i.test(r.id) ? r.id : '',
    label: s(r?.label, 60), units: int(r?.units, 1, 200, 1), sleeps: int(r?.sleeps, 1, 20, 2),
    price: s(r?.price, 30), per: s(r?.per, 20), features: s(r?.features, 200), image: img(r?.image), area: s(r?.area, 40),
    pin: r?.pin === true, x: frac(r?.x), y: frac(r?.y), space: id(r?.space), view: id(r?.view)
  })).filter((r) => r.id && r.label && !seen.has(r.id) && seen.add(r.id));
  const minNights = int(b.minNights, 1, 30, 1);
  return {
    on: b.on === true, plan: img(b.plan), rooms,
    checkin: TIME.test(b.checkin) ? b.checkin : '14:00', checkout: TIME.test(b.checkout) ? b.checkout : '12:00',
    days: int(b.days, 1, 365, 180), minNights, maxNights: int(b.maxNights, minNights, 60, Math.max(14, minNights)),
    maxGuests: int(b.maxGuests, 1, 40, 10),
    timezone: typeof b.timezone === 'string' && validTimezone(b.timezone) ? b.timezone : 'Asia/Kathmandu',
    note: s(b.note, 300)
  };
}

/** The room booking the public page may use: switched on, with at least one room. */
export const liveStays = (site) => {
  const b = site?.stays;
  return b?.on && b.rooms.length ? b : null;
};

/** A space the public page may show: published, and in this project. */
async function ownPublished(pid, space) {
  if (!space) return null;
  const snap = await getPublishedScene(space).catch(() => null);
  return snap && snap.propertyId === pid ? snap : null;
}

/** The live room booking, its rooms only pointing at this project's published spaces. */
export async function publicStays(pid, site) {
  const cfg = liveStays(site);
  if (!cfg) return null;
  const rooms = [];
  for (const r of cfg.rooms) rooms.push((await ownPublished(pid, r.space)) ? r : { ...r, space: '', view: '' });
  return { ...cfg, rooms };
}

sitesRouter.get('/:id', wrap(async (req, res) => {
  const p = await getProperty(req.params.id);
  const saved = p && (await readSite(p.id));
  if (!saved?.published) return res.status(404).json({ error: 'This project has no website yet.' });
  res.json(await renderSite(p, saved.published, saved.publishedAt));
}));

/** Studio: the saved draft, shaped exactly like the public site, to see it before publishing. */
sitesRouter.get('/:id/preview', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const saved = await readSite(p.id);
  res.json({ ...(await renderSite(p, cleanSite(saved?.draft, p.id), saved?.publishedAt ?? null)), preview: true });
}));

/** What the public page gets: the site, the tour to embed, the floor plan, and only this project's spaces. */
async function renderSite(p, site, publishedAt) {

  // The tour: the space the studio picked, else the project's newest published one.
  let tour = await ownPublished(p.id, site.hero.space);
  if (!tour) {
    const first = (await listPublished()).find((g) => g.propertyId === p.id);
    tour = first ? await getPublishedScene(first.id) : null;
  }
  const embed = tour ? await getEmbed(tour.id) : null;

  // Rooms may only point the tour at this project's published spaces.
  const rooms = [];
  for (const r of site.rooms) rooms.push((await ownPublished(p.id, r.space)) ? r : { ...r, space: '', view: '' });

  // The floor plan of the tour's space: the one the studio uploaded, else the drawn one.
  let plan = null;
  const assetId = tour?.splat?.variants?.high?.assetId;
  if (site.plan && assetId) {
    for (const rel of ['floorplan/uploaded.png', 'floorplan/uploaded.jpg', 'floorplan/uploaded.webp', 'floorplan/plan.svg']) {
      if (await storage.stat(assetId, rel).then(() => true, () => false)) { plan = `${assetId}/${rel}`; break; }
    }
  }

  return {
    project: { id: p.id, title: p.title, theme: p.theme ?? {}, info: p.info ?? {} },
    site: { ...site, rooms, booking: liveBooking(site), stays: await publicStays(p.id, site) },
    tour: tour && embed ? { space: tour.id, title: tour.title, key: embedKey(tour.id, embed.version) } : null,
    plan,
    publishedAt
  };
}

sitesRouter.get('/:id/draft', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const saved = await readSite(p.id);
  // What the editor's pickers offer: this project's spaces, and the viewpoints visitors see in each.
  const spaces = [];
  for (const s of (await listScenes()).filter((x) => x.propertyId === p.id)) {
    const snap = await getPublishedScene(s.id).catch(() => null);
    spaces.push({ id: s.id, title: s.title ?? s.id, published: !!snap, views: (snap?.tracks ?? []).map((t) => ({ id: t.id, label: t.label })) });
  }
  // cleanSite fills in anything added to the site since this draft was saved
  res.json({ draft: cleanSite(saved?.draft, p.id), publishedAt: saved?.publishedAt ?? null, scheduledAt: saved?.scheduled?.at ?? null, spaces });
}));

sitesRouter.put('/:id/draft', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const saved = (await readSite(p.id)) ?? {};
  const draft = cleanSite(req.body, p.id);
  await write(p.id, { ...saved, draft });
  await record(req, p.id, 'saved the website', p.title);
  res.json({ draft, publishedAt: saved.publishedAt ?? null });
}));

sitesRouter.post('/:id/publish', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const saved = await readSite(p.id);
  if (!saved?.draft) return res.status(409).json({ error: 'Save the website before publishing it.' });
  const publishedAt = new Date().toISOString();
  await write(p.id, { ...saved, published: saved.draft, publishedAt });
  await record(req, p.id, 'published the website', p.title);
  res.json({ publishedAt });
}));

/**
 * Scheduled publishing (2026-09-28), e.g. a new menu at midnight: the draft
 * as it is when scheduled goes live at `at` (publishDue, checked every
 * SCHEDULE_TICK_MS by index.js). Edits after scheduling wait for the next
 * publish; scheduling again replaces the time and the snapshot.
 */
sitesRouter.post('/:id/schedule', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const at = Date.parse(req.body?.at);
  if (!Number.isFinite(at) || at <= Date.now()) return res.status(400).json({ error: 'Pick a time in the future.' });
  if (at > Date.now() + 366 * 86400000) return res.status(400).json({ error: 'Schedule it within a year.' });
  const saved = await readSite(p.id);
  if (!saved?.draft) return res.status(409).json({ error: 'Save the website before scheduling it.' });
  const scheduled = { at: new Date(at).toISOString(), site: saved.draft, by: { id: req.session.sub ?? null, name: req.session.name ?? null } };
  await write(p.id, { ...saved, scheduled });
  await record(req, p.id, 'scheduled the website', p.title, `live at ${scheduled.at}`);
  res.json({ scheduledAt: scheduled.at });
}));

sitesRouter.delete('/:id/schedule', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const { scheduled, ...saved } = (await readSite(p.id)) ?? {};
  if (scheduled) {
    await write(p.id, saved);
    await record(req, p.id, 'cancelled the scheduled website', p.title);
  }
  res.json({ scheduledAt: null });
}));

/** Put every website whose time has come live. Returns how many.
 *  ponytail: a studio save in the same millisecond could write back the old
 *  file; add a per-project write queue (like reservations.js) if that ever bites. */
export async function publishDue(now = Date.now()) {
  let files;
  try { files = await fs.readdir(SITES_DIR); } catch { return 0; }
  let done = 0;
  for (const f of files.filter((x) => x.endsWith('.json'))) {
    const pid = f.slice(0, -5);
    const saved = await readSite(pid);
    if (!saved?.scheduled || Date.parse(saved.scheduled.at) > now) continue;
    const { scheduled, ...rest } = saved;
    await write(pid, { ...rest, published: scheduled.site, publishedAt: new Date(now).toISOString() });
    const by = scheduled.by?.id ? { session: { sub: scheduled.by.id, name: scheduled.by.name } } : { session: null };
    await record(by, pid, 'published the website on schedule', (await getProperty(pid))?.title ?? pid, `set for ${scheduled.at}`);
    done += 1;
  }
  return done;
}

/* ---------------------------------------------------------------- client review */

const draftHash = (draft) => createHash('sha1').update(JSON.stringify(draft ?? null)).digest('hex').slice(0, 16);
const emptyReview = () => ({ key: null, comments: [], approval: null });

/** The site file and its review, if `key` is its link's key (compared in constant time). */
export async function reviewed(pid, key) {
  const saved = await readSite(pid);
  const real = saved?.review?.key;
  if (!real || typeof key !== 'string' || key.length !== real.length) return null;
  return timingSafeEqual(Buffer.from(key), Buffer.from(real)) ? saved : null;
}

sitesRouter.post('/:id/review', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const saved = (await readSite(p.id)) ?? {};
  const review = { ...emptyReview(), ...saved.review };
  if (!review.key) {
    review.key = randomBytes(24).toString('hex');
    await write(p.id, { ...saved, review });
    await record(req, p.id, 'shared the website draft for review', p.title);
  }
  res.json({ key: review.key });
}));

sitesRouter.delete('/:id/review', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const saved = await readSite(p.id);
  if (saved?.review?.key) {
    await write(p.id, { ...saved, review: { ...saved.review, key: null } });
    await record(req, p.id, 'stopped the review link', p.title);
  }
  res.json({ key: null });
}));

sitesRouter.get('/:id/review/feedback', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const saved = await readSite(p.id);
  const review = { ...emptyReview(), ...saved?.review };
  res.json({
    key: review.key, comments: review.comments, approval: review.approval,
    approvedThisDraft: !!review.approval && review.approval.draft === draftHash(cleanSite(saved?.draft, p.id))
  });
}));

sitesRouter.patch('/:id/review/comments/:cid', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const saved = await readSite(p.id);
  const c = saved?.review?.comments?.find((x) => x.id === req.params.cid);
  if (!c) return res.status(404).json({ error: 'That comment does not exist.' });
  c.resolved = req.body?.resolved === true;
  await write(p.id, saved);
  res.json(c);
}));

sitesRouter.get('/:id/review', wrap(async (req, res) => {
  const p = await getProperty(req.params.id);
  const saved = p && (await reviewed(p.id, req.query.key));
  if (!saved) return res.status(404).json({ error: 'This review link doesn’t work any more. Ask for a new one.' });
  const draft = cleanSite(saved.draft, p.id);
  res.json({
    ...(await renderSite(p, draft, saved.publishedAt ?? null)), preview: true,
    review: { comments: saved.review.comments, approval: saved.review.approval, approvedThisDraft: saved.review.approval?.draft === draftHash(draft) }
  });
}));

const REVIEW_RATE = new Map();
const reviewLimited = (ip) => {
  const now = Date.now();
  const list = (REVIEW_RATE.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  REVIEW_RATE.set(ip, list);
  return list.length > (Number(process.env.REVIEW_RATE_MAX) || 60);
};
const plain = (v, max) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, max);
const frac = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, Math.round(n * 10000) / 10000)) : 0.5; };

sitesRouter.post('/:id/review/comments', wrap(async (req, res) => {
  if (reviewLimited(req.ip || 'unknown')) return res.status(429).json({ error: 'That’s a lot of comments at once. Try again in a few minutes.' });
  const p = await getProperty(req.params.id);
  const saved = p && (await reviewed(p.id, req.query.key));
  if (!saved) return res.status(404).json({ error: 'This review link doesn’t work any more. Ask for a new one.' });
  const text = plain(req.body?.text, 1000), name = plain(req.body?.name, 60);
  if (!text) return res.status(400).json({ error: 'Write your comment first.' });
  if (!name) return res.status(400).json({ error: 'Add your name, so the team knows who it’s from.' });
  const review = { ...emptyReview(), ...saved.review };
  if (review.comments.length >= 500) return res.status(409).json({ error: 'This draft has 500 comments. Ask the team to resolve some first.' });
  const c = {
    id: randomUUID(), name, text, where: plain(req.body?.where, 80),
    sec: Math.max(0, Math.min(99, Math.round(Number(req.body?.sec)) || 0)), x: frac(req.body?.x), y: frac(req.body?.y),
    at: new Date().toISOString(), resolved: false
  };
  review.comments.push(c);
  await write(p.id, { ...saved, review });
  res.status(201).json(c);
}));

sitesRouter.post('/:id/review/approve', wrap(async (req, res) => {
  if (reviewLimited(req.ip || 'unknown')) return res.status(429).json({ error: 'Try again in a few minutes.' });
  const p = await getProperty(req.params.id);
  const saved = p && (await reviewed(p.id, req.query.key));
  if (!saved) return res.status(404).json({ error: 'This review link doesn’t work any more. Ask for a new one.' });
  const name = plain(req.body?.name, 60);
  if (!name) return res.status(400).json({ error: 'Add your name to approve it.' });
  const approval = { name, at: new Date().toISOString(), draft: draftHash(cleanSite(saved.draft, p.id)) };
  await write(p.id, { ...saved, review: { ...emptyReview(), ...saved.review, approval } });
  await record({ session: { sub: null, name } }, p.id, 'approved the website draft', p.title, 'from the review link');
  res.json(approval);
}));

// Originals, straight from the camera: the website serves each screen a resized copy (next/image).
const IMAGE_MAX = 25 * 1024 * 1024;
sitesRouter.post('/:id/images', requireEditorSession, express.raw({ type: () => true, limit: IMAGE_MAX }), wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const kind = Buffer.isBuffer(req.body) && req.body.length ? imageKind(req.body) : undefined;
  if (!kind) return res.status(415).json({ error: 'Use a PNG, JPEG or WebP photo.' });
  // Its size goes in the name, so the page can hold its place before it loads.
  const size = imageSize(req.body, kind);
  const rel = `img-${Date.now()}${size ? `-${size[0]}x${size[1]}` : ''}.${kind}`;
  await storage.put(`site_${p.id}`, rel, Readable.from([req.body]));
  res.json({ path: `site_${p.id}/${rel}` });
}), (err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That photo is over 25 MB. Export it smaller.' });
  next(err);
});
