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

/** A space in a project is for whoever can see the project. One in no project
 *  (or whose project was deleted) is its owner's alone (2026-09-27; before,
 *  every account saw them). The legacy shared-password session sees all. */
async function spaceAllows(session, propertyId, ownerId) {
  if (!session?.sub) return true;
  const p = propertyId ? await getProperty(propertyId) : null;
  if (p) return propertyIsVisible(p, session);
  return ownerId === session.sub;
}

/** Can this session work on this space? A space that doesn't exist yet is
 *  judged by the project it would be saved into, if any (in none, it's theirs). */
export async function mayWorkOnScene(session, sceneId, intoPropertyId) {
  const scene = await getScene(sceneId).catch(() => null);
  if (scene && !(await spaceAllows(session, scene.propertyId, scene.ownerId ?? null))) return false;
  if (intoPropertyId !== undefined && !(await spaceAllows(session, intoPropertyId, session?.sub))) return false;
  return true;
}

/** Can this session change this asset? Every space using it must allow it.
 *  ponytail: reads every space to find its users; fine at tens of spaces,
 *  index asset -> space when there are hundreds. */
export async function mayWorkOnAsset(session, assetId) {
  for (const { id } of await listScenes()) {
    const doc = await getScene(id).catch(() => null);
    if (doc && JSON.stringify(doc).includes(assetId) && !(await spaceAllows(session, doc.propertyId, doc.ownerId ?? null))) return false;
  }
  return true;
}

/** The spaces a session may see in the studio's lists. */
export async function visibleScenes(session, scenes) {
  const out = [];
  for (const s of scenes) if (await spaceAllows(session, s.propertyId, s.ownerId ?? null)) out.push(s);
  return out;
}

const FORBIDDEN = { error: 'That space belongs to a project you haven’t been added to. Ask its owner to share it with you.' };

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
