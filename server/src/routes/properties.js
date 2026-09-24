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
  addPropertyMember, removePropertyMember, propertyIsVisible, propertyIsManageable
} from '../store.js';
import { requireEditorSession } from '../middleware/auth.js';
import { getUserById, getUserByEmail } from '../usersStore.js';

export const propertiesRouter = Router();

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

/** The session's role, checked fresh against the account rather than the
 *  JWT claim, so a promotion/demotion applies at once (see requireAdmin). */
async function freshSession(req) {
  if (!req.session.sub) return { sub: null, role: 'admin' }; // legacy passwordless session
  const user = await getUserById(req.session.sub);
  return { sub: req.session.sub, role: user?.role ?? 'editor' };
}

const NOT_FOUND = { error: 'That project does not exist.' };

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
  res.status(201).json(await createProperty(req.body?.title, req.session.sub ?? null));
}));

/** Title only — the id never changes (see renameProperty). Owner or admin. */
propertiesRouter.patch('/:id', requireEditorSession, wrap(async (req, res) => {
  const session = await freshSession(req);
  const existing = await getProperty(req.params.id);
  if (!existing || !propertyIsVisible(existing, session)) return res.status(404).json(NOT_FOUND);
  if (!propertyIsManageable(existing, session)) return res.status(403).json({ error: 'Only the project’s owner or an admin can rename it.' });
  res.json(await renameProperty(req.params.id, req.body?.title));
}));

/** Its spaces are kept and become unfiled; nothing published changes. Owner or admin. */
propertiesRouter.delete('/:id', requireEditorSession, wrap(async (req, res) => {
  const session = await freshSession(req);
  const existing = await getProperty(req.params.id);
  if (!existing || !propertyIsVisible(existing, session)) return res.status(404).json(NOT_FOUND);
  if (!propertyIsManageable(existing, session)) return res.status(403).json({ error: 'Only the project’s owner or an admin can delete it.' });
  res.json(await deleteProperty(req.params.id));
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
  res.json(await addPropertyMember(req.params.id, user.id));
}));

propertiesRouter.delete('/:id/members/:userId', requireEditorSession, wrap(async (req, res) => {
  const session = await freshSession(req);
  const existing = await getProperty(req.params.id);
  if (!existing || !propertyIsVisible(existing, session)) return res.status(404).json(NOT_FOUND);
  if (!propertyIsManageable(existing, session)) return res.status(403).json({ error: 'Only the project’s owner or an admin can change who has access.' });
  res.json(await removePropertyMember(req.params.id, req.params.userId));
}));
