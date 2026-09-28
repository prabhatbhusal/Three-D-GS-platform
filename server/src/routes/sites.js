/**
 * Project websites (/s/<project>): an editorial page around the project's
 * live tour — its story, its rooms, photos, floor plan, a menu, and the
 * enquiry form. The tour itself is the published one, embedded as-is. The
 * studio edits a draft; publishing copies it to what the public page reads.
 * Stored as data/sites/<project>.json: { draft, published, publishedAt }.
 * Photos are the asset `site_<project>`.
 *
 *   GET  /api/sites/:id           public: the published site, ready to render
 *   GET  /api/sites/:id/draft     studio: the draft, and the project's spaces and viewpoints
 *   PUT  /api/sites/:id/draft     studio: save the draft
 *   POST /api/sites/:id/publish   studio: put the draft live
 *   POST /api/sites/:id/images    studio: a photo (PNG, JPEG or WebP body) -> { path }
 */
import { Router } from 'express';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { DATA_DIR } from '../dataDir.js';
import * as storage from '../storage.js';
import { getProperty, getPublishedScene, getEmbed, listScenes, listPublished } from '../store.js';
import { requireEditorSession } from '../middleware/auth.js';
import { visibleProject } from './properties.js';
import { imageKind } from './assets.js';
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

/** Only the fields the page knows, trimmed and capped: the draft is whatever the studio sent. */
export function cleanSite(d, pid) {
  const s = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const list = (a, n, f) => (Array.isArray(a) ? a : []).slice(0, n).map(f);
  const img = (v) => (typeof v === 'string' && new RegExp(`^site_${pid}/img-\\d+\\.(png|jpg|webp)$`).test(v) ? v : '');
  const id = (v) => (typeof v === 'string' && /^[\w-]{1,80}$/.test(v) ? v : '');
  d = d && typeof d === 'object' ? d : {};
  return {
    hero: { eyebrow: s(d.hero?.eyebrow, 80), title: s(d.hero?.title, 120), lede: s(d.hero?.lede, 400), space: id(d.hero?.space) },
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
    booking: cleanBooking(d.booking, { s, img, id })
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

/** A space the public page may show: published, and in this project. */
async function ownPublished(pid, space) {
  if (!space) return null;
  const snap = await getPublishedScene(space).catch(() => null);
  return snap && snap.propertyId === pid ? snap : null;
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
    site: { ...site, rooms, booking: liveBooking(site) },
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
  res.json({ draft: cleanSite(saved?.draft, p.id), publishedAt: saved?.publishedAt ?? null, spaces });
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

const IMAGE_MAX = 8 * 1024 * 1024;
sitesRouter.post('/:id/images', requireEditorSession, express.raw({ type: () => true, limit: IMAGE_MAX }), wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const kind = Buffer.isBuffer(req.body) && req.body.length ? imageKind(req.body) : undefined;
  if (!kind) return res.status(415).json({ error: 'Use a PNG, JPEG or WebP photo.' });
  const rel = `img-${Date.now()}.${kind}`;
  await storage.put(`site_${p.id}`, rel, Readable.from([req.body]));
  res.json({ path: `site_${p.id}/${rel}` });
}), (err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That photo is over 8 MB. Export it smaller.' });
  next(err);
});
