/**
 * Properties (CLAUDE.md §5.1) — one per client. Studio-only for now: the
 * public hub page (/t/<property>) that would read these is not built yet,
 * so there is no public read and no publish state here.
 *
 * Ownership (2026-09-24, private per account 2026-09-27): a project belongs to
 * whoever created it. Each account sees only the projects it owns or was
 * shared into — an admin too; admin is for running accounts, not a view of
 * everyone's work. Projects from before accounts (ownerId null) show only as
 * a name any account can claim. Only the owner can rename, delete, rebrand or
 * change who else has access.
 */
import { Router } from 'express';
import {
  listProperties, getProperty, createProperty, renameProperty, deleteProperty, listScenes,
  addPropertyMember, removePropertyMember, propertyIsVisible, propertyIsManageable, propertyIsClaimable, claimProperty, setPropertyTheme, setPropertyInfo, setLeadEmails
} from '../store.js';
import { listLeads, leadsCsv } from '../leadsStore.js';
import { monthStats, monthOf } from '../stats.js';
import { getScene } from '../store.js';
import express from 'express';
import { Readable } from 'stream';
import * as storage from '../storage.js';
import { imageKind } from './assets.js';
import { requireEditorSession } from '../middleware/auth.js';
import { getUserById, getUserByEmail } from '../usersStore.js';
import { freshSession as fresh } from '../access.js';
import { record, recent } from '../activity.js';
import { removeSite } from './sites.js';

export const propertiesRouter = Router();

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

/** The session's current role (access.js); a deleted account can see nothing. */
const freshSession = async (req) => (await fresh(req.session)) ?? { sub: req.session.sub, role: 'none' };

const NOT_FOUND = { error: 'That project does not exist.' };

/** Public: a project's branding, for its tours. Nothing else about it. */
propertiesRouter.get('/:id/theme', wrap(async (req, res) => {
  const p = await getProperty(req.params.id);
  if (!p) return res.status(404).json(NOT_FOUND);
  res.json({ title: p.title, theme: p.theme ?? {} });
}));

/** Owner or admin: the project, or the reason they can't change it. */
async function manageable(req, res) {
  const session = await freshSession(req);
  const p = await getProperty(req.params.id);
  if (!p || !propertyIsVisible(p, session)) { res.status(404).json(NOT_FOUND); return null; }
  if (!propertyIsManageable(p, session)) { res.status(403).json({ error: 'Only the project\u2019s owner can change its branding.' }); return null; }
  return p;
}

/** Anyone who can see the project: its enquiries, newest first. */
export async function visibleProject(req, res) {
  const session = await freshSession(req);
  const p = await getProperty(req.params.id);
  if (!p || !propertyIsVisible(p, session)) { res.status(404).json(NOT_FOUND); return null; }
  return p;
}
const projectLeads = async (id) => (await listLeads()).filter((l) => l.propertyId === id);

propertiesRouter.get('/:id/leads', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  res.json({ leads: await projectLeads(p.id), emails: p.leadEmails ?? [], emailOn: !!process.env.RESEND_API_KEY });
}));

/** The monthly client report (studio/report/[property]): visits and time per
 *  space from stats.js, enquiries per space from the leads. ?month=YYYY-MM,
 *  this month by default. */
propertiesRouter.get('/:id/report', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const month = typeof req.query.month === 'string' ? req.query.month : monthOf();
  const stats = await monthStats(p.id, month);
  if (!stats) return res.status(400).json({ error: 'month must look like 2026-09.' });
  const leads = (await projectLeads(p.id)).filter((l) => l.createdAt.startsWith(month));
  const ids = new Set([...Object.keys(stats.spaces), ...leads.map((l) => l.sceneId).filter((id) => id !== 'hub'),
    ...(await listScenes()).filter((s) => s.propertyId === p.id).map((s) => s.id)]);
  const spaces = [];
  for (const id of ids) {
    const doc = await getScene(id).catch(() => null);
    const st = stats.spaces[id] ?? { visits: 0, seconds: 0 };
    spaces.push({ id, title: doc?.title || id, visits: st.visits, seconds: st.seconds, enquiries: leads.filter((l) => l.sceneId === id).length });
  }
  spaces.sort((a, b) => b.visits - a.visits || b.enquiries - a.enquiries);
  res.json({
    project: { id: p.id, title: p.title, theme: p.theme ?? {} },
    month,
    visits: stats.visits,
    seconds: stats.seconds,
    days: stats.days,
    enquiries: leads.length,
    fromProjectPage: leads.filter((l) => l.sceneId === 'hub').length,
    spaces
  });
}));

/** The same, for Excel. */
propertiesRouter.get('/:id/leads.csv', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const day = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${p.id}-enquiries-${day}.csv"`);
  res.send(leadsCsv(await projectLeads(p.id)));
  await record(req, p.id, 'downloaded the enquiries', p.title);
}));

/** Owner or admin: who new enquiries are emailed to. */
propertiesRouter.put('/:id/lead-emails', requireEditorSession, wrap(async (req, res) => {
  const p = await manageable(req, res);
  if (!p) return;
  try {
    const next = await setLeadEmails(p.id, req.body?.emails);
    await record(req, p.id, 'changed who gets enquiries', p.title, next.leadEmails.join(', ') || 'no one');
    res.json({ emails: next.leadEmails });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}));

/** Brand name, accent colour, heading font. */
propertiesRouter.put('/:id/theme', requireEditorSession, wrap(async (req, res) => {
  const p = await manageable(req, res);
  if (!p) return;
  const patch = {};
  for (const k of ['brand', 'accent', 'font']) if (req.body && k in req.body) patch[k] = req.body[k];
  try {
    const next = await setPropertyTheme(p.id, patch);
    await record(req, p.id, 'changed the branding', p.title);
    res.json(next);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}));

/** The logo: PNG, JPEG or WebP, 2 MB at most, stored as the asset
 *  `brand_<project>`, so it's served like any other asset. A new one
 *  replaces it; `?v=` in the path makes browsers fetch the new one. */
const LOGO_MAX = 2 * 1024 * 1024;
propertiesRouter.put('/:id/logo', requireEditorSession, express.raw({ type: () => true, limit: LOGO_MAX }), wrap(async (req, res) => {
  const p = await manageable(req, res);
  if (!p) return;
  const body = req.body;
  const kind = Buffer.isBuffer(body) && body.length ? imageKind(body) : undefined;
  if (!kind) return res.status(415).json({ error: 'Use a PNG, JPEG or WebP image for the logo.' });
  const assetId = `brand_${p.id}`;
  for (const ext of ['png', 'jpg', 'webp']) await storage.remove(assetId, `logo.${ext}`);
  await storage.put(assetId, `logo.${kind}`, Readable.from([body]));
  const next = await setPropertyTheme(p.id, { logo: `${assetId}/logo.${kind}?v=${Date.now()}` });
  await record(req, p.id, 'uploaded a logo', p.title);
  res.json(next);
}), (err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That logo is over 2 MB. Export it smaller.' });
  next(err);
});

propertiesRouter.delete('/:id/logo', requireEditorSession, wrap(async (req, res) => {
  const p = await manageable(req, res);
  if (!p) return;
  await storage.remove(`brand_${p.id}`);
  const next = await setPropertyTheme(p.id, { logo: null });
  await record(req, p.id, 'removed the logo', p.title);
  res.json(next);
}));

/** What the project says about its brand (store.js setPropertyInfo). Owner only. */
propertiesRouter.put('/:id/info', requireEditorSession, wrap(async (req, res) => {
  const p = await manageable(req, res);
  if (!p) return;
  const next = await setPropertyInfo(p.id, req.body ?? {});
  await record(req, p.id, 'updated the brand information', p.title);
  res.json(next);
}));

/** Every property this session can see, with how many spaces it holds. Projects
 *  from before accounts (no owner) come too, but only as a name to claim. */
propertiesRouter.get('/', requireEditorSession, wrap(async (req, res) => {
  const session = await freshSession(req);
  const [properties, scenes] = await Promise.all([listProperties(), listScenes()]);
  const count = (id) => scenes.filter((s) => s.propertyId === id).length;
  const mine = properties.filter((p) => propertyIsVisible(p, session)).map((p) => ({ ...p, spaceCount: count(p.id) }));
  const unclaimed = properties.filter((p) => !propertyIsVisible(p, session) && propertyIsClaimable(p, session))
    .map((p) => ({ id: p.id, title: p.title, ownerId: null, members: [], claimable: true, spaceCount: count(p.id) }));
  res.json([...mine, ...unclaimed]);
}));

/** Make a project from before accounts yours: from then on only you (and whoever
 *  you share it with) can see it. */
propertiesRouter.post('/:id/claim', requireEditorSession, wrap(async (req, res) => {
  const session = await freshSession(req);
  const p = await getProperty(req.params.id);
  if (!p) return res.status(404).json(NOT_FOUND);
  if (!propertyIsClaimable(p, session)) {
    return res.status(409).json({ error: p.ownerId ? 'That project already has an owner.' : 'Sign in with your own account to claim a project.' });
  }
  const claimed = await claimProperty(p.id, session.sub);
  if (!claimed) return res.status(409).json({ error: 'Someone has just claimed it.' });
  await record(req, p.id, 'claimed the project', p.title);
  res.json(claimed);
}));

propertiesRouter.get('/:id', requireEditorSession, wrap(async (req, res) => {
  const session = await freshSession(req);
  const p = await getProperty(req.params.id);
  if (!p || !propertyIsVisible(p, session)) return res.status(404).json(NOT_FOUND);
  // Resolve names for the share panel — cheap at this team size (usersStore).
  const [ownerUser, memberUsers] = await Promise.all([
    p.ownerId ? getUserById(p.ownerId) : null,
    Promise.all(p.members.map(getUserById))
  ]);
  res.json({
    ...p,
    ownerName: ownerUser?.name ?? null,
    memberDetails: memberUsers.filter(Boolean).map((u) => ({ id: u.id, name: u.name, email: u.email }))
  });
}));

propertiesRouter.post('/', requireEditorSession, wrap(async (req, res) => {
  const p = await createProperty(req.body?.title, req.session.sub ?? null);
  await record(req, p.id, 'created the project', p.title);
  res.status(201).json(p);
}));

/** Who did what in this project, newest first. Anyone who can see it. */
propertiesRouter.get('/:id/activity', requireEditorSession, wrap(async (req, res) => {
  const session = await freshSession(req);
  const p = await getProperty(req.params.id);
  if (!p || !propertyIsVisible(p, session)) return res.status(404).json(NOT_FOUND);
  res.json(await recent(p.id));
}));

/** Title only — the id never changes (see renameProperty). Owner or admin. */
propertiesRouter.patch('/:id', requireEditorSession, wrap(async (req, res) => {
  const session = await freshSession(req);
  const existing = await getProperty(req.params.id);
  if (!existing || !propertyIsVisible(existing, session)) return res.status(404).json(NOT_FOUND);
  if (!propertyIsManageable(existing, session)) return res.status(403).json({ error: 'Only the project’s owner can rename it.' });
  const renamed = await renameProperty(req.params.id, req.body?.title);
  await record(req, existing.id, 'renamed the project', renamed.title, `was “${existing.title}”`);
  res.json(renamed);
}));

/** Its spaces are kept and become unfiled; nothing published changes. Owner or admin. */
propertiesRouter.delete('/:id', requireEditorSession, wrap(async (req, res) => {
  const session = await freshSession(req);
  const existing = await getProperty(req.params.id);
  if (!existing || !propertyIsVisible(existing, session)) return res.status(404).json(NOT_FOUND);
  if (!propertyIsManageable(existing, session)) return res.status(403).json({ error: 'Only the project’s owner can delete it.' });
  const gone = await deleteProperty(req.params.id, session.sub ?? null);
  await storage.remove(`brand_${existing.id}`); // its logo
  await removeSite(existing.id); // its website and photos
  await record(req, existing.id, 'deleted the project', existing.title, gone.released ? `${gone.released} space(s) moved to “Not in a project yet”` : undefined);
  res.json(gone);
}));

/** Share the project with a teammate, by email. Owner or admin. */
propertiesRouter.post('/:id/members', requireEditorSession, wrap(async (req, res) => {
  const session = await freshSession(req);
  const existing = await getProperty(req.params.id);
  if (!existing || !propertyIsVisible(existing, session)) return res.status(404).json(NOT_FOUND);
  if (!propertyIsManageable(existing, session)) return res.status(403).json({ error: 'Only the project’s owner can share it.' });
  const email = String(req.body?.email ?? '').trim();
  if (!email) return res.status(400).json({ error: 'Enter an email address.' });
  const user = await getUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'No account with that email. They need to sign up first.' });
  const shared = await addPropertyMember(req.params.id, user.id);
  await record(req, existing.id, 'shared the project', existing.title, `with ${user.name}`);
  res.json(shared);
}));

propertiesRouter.delete('/:id/members/:userId', requireEditorSession, wrap(async (req, res) => {
  const session = await freshSession(req);
  const existing = await getProperty(req.params.id);
  if (!existing || !propertyIsVisible(existing, session)) return res.status(404).json(NOT_FOUND);
  if (!propertyIsManageable(existing, session)) return res.status(403).json({ error: 'Only the project’s owner can change who has access.' });
  const left = await removePropertyMember(req.params.id, req.params.userId);
  const who = await getUserById(req.params.userId);
  await record(req, existing.id, 'removed a teammate', existing.title, who ? who.name : undefined);
  res.json(left);
}));
