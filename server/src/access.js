/**
 * Who may work on what (2026-09-24 ownership, applied to spaces and assets
 * 2026-09-25). A space belongs to its project (`propertyId`); you can work on
 * it if you can see that project — its owner, a member, or an admin — or if
 * it's in no project (or its project was deleted). An asset is judged by the
 * spaces that use it; one no space uses yet (an upload in progress) is open
 * to whoever is signed in, as it always was.
 */
import { getProperty, getScene, listScenes, propertyIsVisible } from './store.js';
import { getUserById } from './usersStore.js';
import { readSession } from './middleware/auth.js';

/** The session's role read fresh from the account, not the JWT claim, so a
 *  promotion or demotion applies at once. The legacy passwordless session
 *  has no account and keeps its full access. */
export async function freshSession(session) {
  if (!session) return null;
  if (!session.sub) return { sub: null, role: 'admin' };
  const user = await getUserById(session.sub);
  return user ? { sub: session.sub, role: user.role } : null;
}

async function projectAllows(session, propertyId) {
  if (!propertyId) return true;
  const p = await getProperty(propertyId);
  return !p || propertyIsVisible(p, session); // a deleted project leaves its spaces unfiled
}

/** Can this session work on this space? A space that doesn't exist yet is
 *  judged by the project it would be saved into, if any. */
export async function mayWorkOnScene(session, sceneId, intoPropertyId) {
  const scene = await getScene(sceneId).catch(() => null);
  if (scene && !(await projectAllows(session, scene.propertyId))) return false;
  if (intoPropertyId !== undefined && !(await projectAllows(session, intoPropertyId))) return false;
  return true;
}

/** Can this session change this asset? Every space using it must allow it.
 *  ponytail: reads every space to find its users; fine at tens of spaces,
 *  index asset -> space when there are hundreds. */
export async function mayWorkOnAsset(session, assetId) {
  for (const { id } of await listScenes()) {
    const doc = await getScene(id).catch(() => null);
    if (doc && JSON.stringify(doc).includes(assetId) && !(await projectAllows(session, doc.propertyId))) return false;
  }
  return true;
}

/** The spaces a session may see in the studio's lists. */
export async function visibleScenes(session, scenes) {
  const out = [];
  for (const s of scenes) if (await projectAllows(session, s.propertyId)) out.push(s);
  return out;
}

const FORBIDDEN = { error: 'That space belongs to a project you haven’t been added to. Ask its owner or an admin.' };

/** Express guard for `:id` space routes; run after requireEditorSession. */
export const sceneGuard = (req, res, next) => {
  (async () => {
    const session = await freshSession(req.session);
    if (!session) return res.status(401).json({ error: 'Your account no longer exists.' });
    req.access = session;
    // a save or a move names the project it goes into: that must allow it too
    const into = req.body && typeof req.body === 'object' && 'propertyId' in req.body ? req.body.propertyId ?? null : undefined;
    if (!(await mayWorkOnScene(session, req.params.id, into))) return res.status(403).json(FORBIDDEN);
    next();
  })().catch(next);
};

/** Express guard for `:assetId` routes that change a stored asset. */
export const assetGuard = (req, res, next) => {
  (async () => {
    const session = await freshSession(req.session);
    if (!session) return res.status(401).json({ error: 'Your account no longer exists.' });
    req.access = session;
    if (!(await mayWorkOnAsset(session, req.params.assetId))) return res.status(403).json(FORBIDDEN);
    next();
  })().catch(next);
};

/** For public routes that also serve the studio: the session if there is one. */
export const optionalSession = async (req) => freshSession(readSession(req));
