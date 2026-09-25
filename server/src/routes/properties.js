/**
 * Properties (CLAUDE.md §5.1) — one per client. Studio-only for now: the
 * public hub page (/t/<property>) that would read these is not built yet,
 * so there is no public read and no publish state here.
 *
 * Ownership (2026-09-24): a project belongs to whoever created it. An admin
 * sees and manages every project; everyone else sees only the ones they own,
 * are a member of, or that have no owner (every project made before this —
 * ownerId defaults to null, see store.js's fillPropertyDefaults). Only the
 * owner or an admin can rename, delete, or change who else has access.
 */
import { Router } from 'express';
import {
  listProperties, getProperty, createProperty, renameProperty, deleteProperty, listScenes,
  addPropertyMember, removePropertyMember, propertyIsVisible, propertyIsManageable, setPropertyTheme, setLeadEmails
} from '../store.js';
import { listLeads, leadsCsv } from '../leadsStore.js';
import express from 'express';
import { Readable } from 'stream';
import * as storage from '../storage.js';
import { imageKind } from './assets.js';
import { requireEditorSession } from '../middleware/auth.js';
import { getUserById, getUserByEmail } from '../usersStore.js';
import { freshSession as fresh } from '../access.js';
import { record, recent } from '../activity.js';

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
  if (!propertyIsManageable(p, session)) { res.status(403).json({ error: 'Only the project\u2019s owner or an admin can change its branding.' }); return null; }
  return p;
}

/** Anyone who can see the project: its enquiries, newest first. */
async function visibleProject(req, res) {
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

/** Every property this session can see, with how many spaces it holds. */
propertiesRouter.get('/', requireEditorSession, wrap(async (req, res) => {
  const session = await freshSession(req);
  const [properties, scenes] = await Promise.all([listProperties(), listScenes()]);
  const mine = properties.filter((p) => propertyIsVisible(p, session));
  res.json(mine.map((p) => ({ ...p, spaceCount: scenes.filter((s) => s.propertyId === p.id).length })));
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
  if (!propertyIsManageable(existing, session)) return res.status(403).json({ error: 'Only the project’s owner or an admin can rename it.' });
  const renamed = await renameProperty(req.params.id, req.body?.title);
  await record(req, existing.id, 'renamed the project', renamed.title, `was “${existing.title}”`);
  res.json(renamed);
}));

/** Its spaces are kept and become unfiled; nothing published changes. Owner or admin. */
propertiesRouter.delete('/:id', requireEditorSession, wrap(async (req, res) => {
  const session = await freshSession(req);
  const existing = await getProperty(req.params.id);
  if (!existing || !propertyIsVisible(existing, session)) return res.status(404).json(NOT_FOUND);
  if (!propertyIsManageable(existing, session)) return res.status(403).json({ error: 'Only the project’s owner or an admin can delete it.' });
  const gone = await deleteProperty(req.params.id);
  await storage.remove(`brand_${existing.id}`); // its logo
  await record(req, existing.id, 'deleted the project', existing.title, gone.released ? `${gone.released} space(s) moved to “Not in a project yet”` : undefined);
  res.json(gone);
}));

/** Share the project with a teammate, by email. Owner or admin. */
propertiesRouter.post('/:id/members', requireEditorSession, wrap(async (req, res) => {
  const session = await freshSession(req);
  const existing = await getProperty(req.params.id);
  if (!existing || !propertyIsVisible(existing, session)) return res.status(404).json(NOT_FOUND);
  if (!propertyIsManageable(existing, session)) return res.status(403).json({ error: 'Only the project’s owner or an admin can share it.' });
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
  if (!propertyIsManageable(existing, session)) return res.status(403).json({ error: 'Only the project’s owner or an admin can change who has access.' });
  const left = await removePropertyMember(req.params.id, req.params.userId);
  const who = await getUserById(req.params.userId);
  await record(req, existing.id, 'removed a teammate', existing.title, who ? who.name : undefined);
  res.json(left);
}));
