/** Spaces (scene documents): the studio’s list, load and save, publishing with numbered snapshots, version history, and the public reads of published spaces and their pictures. */
import { Router } from 'express';
import {
  listScenes, getScene, saveScene, publishChecks, publishScene, unpublishScene,
  getPublishedScene, revertToPublished, listPublished, setSceneProperty, listVersions, restoreVersion
} from '../store.js';
import { requireEditorSession } from '../middleware/auth.js';
import { sceneGuard, optionalSession, visibleScenes } from '../access.js';
import { record, recordScene } from '../activity.js';
import * as storage from '../storage.js';

export const scenesRouter = Router();
export const galleryRouter = Router();

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const notFound = (res, id) => res.status(404).json({ error: `Scene "${id}" not found.` });

// Public: every published space, for the gallery page.
// ?property=<id>: just that project's (its hub page, /t/<id>).
galleryRouter.get('/', wrap(async (req, res) => {
  const all = await listPublished();
  const want = typeof req.query.property === 'string' ? req.query.property : null;
  res.json(want ? all.filter((g) => g.propertyId === want) : all);
}));

// Public: a published space's picture (its first view's thumbnail, kept as a
// data URL in the doc) as a real image, for the gallery and link previews.
galleryRouter.get('/:id/thumb.jpg', wrap(async (req, res) => {
  const snap = await getPublishedScene(req.params.id);
  sendDataImage(res, snap?.tracks?.find((t) => t.thumb)?.thumb);
}));

/** A view thumbnail, which the doc keeps as a data URL, sent as the image it is. */
function sendDataImage(res, dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl ?? '');
  if (!m) return res.status(404).end();
  res.type(m[1]).set('Cache-Control', 'public, max-age=86400').send(Buffer.from(m[2], 'base64'));
}

// Public: what visitors see. Never the draft (§7.5, constraint 6). Its view
// thumbnails go as links (below), not the data URLs the doc keeps: ten of
// them are ~700 KB the tour would fetch before its first frame.
scenesRouter.get('/:id/published', wrap(async (req, res) => {
  const doc = await getPublishedScene(req.params.id);
  if (!doc) return res.status(404).json({ error: 'This space is not published.' });
  const link = (t) => `/api/scenes/${encodeURIComponent(doc.id)}/published/thumbs/${encodeURIComponent(t.id)}.jpg?v=${doc.publishedVersion}`;
  // visitors get the space, not which studio account owns it
  const { ownerId, ...pub } = doc;
  res.json({ ...pub, tracks: (pub.tracks ?? []).map((t) => (t.thumb?.startsWith?.('data:') ? { ...t, thumb: link(t) } : t)) });
}));

// A published camera track's thumbnail, as a JPEG.
scenesRouter.get('/:id/published/thumbs/:track.jpg', wrap(async (req, res) => {
  const doc = await getPublishedScene(req.params.id);
  sendDataImage(res, doc?.tracks?.find((t) => t.id === req.params.track)?.thumb);
}));

/** Is the space's scan on this server's storage at all? A checkout or server
 *  without the uploaded files (they're never in git) serves a tour that
 *  shows its start screen and never any 3D. A warning, not a block. */
async function missingFiles(doc) {
  const high = doc.splat?.variants?.high;
  if (!high?.assetId || !high.meta || String(high.assetId).startsWith('local:')) return [];
  try {
    await storage.stat(high.assetId, high.meta);
    return [];
  } catch {
    return [`This space’s scan files aren’t on this server (${high.assetId}). Visitors will get the start screen but no 3D. Upload the model again, or copy that folder from the computer it was uploaded on.`];
  }
}

// Studio: publish state + what would block or warn, without publishing.
scenesRouter.get('/:id/publish', requireEditorSession, sceneGuard, wrap(async (req, res) => {
  const draft = await getScene(req.params.id);
  if (!draft) return notFound(res, req.params.id);
  const checks = publishChecks(draft);
  res.json({
    status: draft.status ?? 'draft',
    publishedVersion: draft.publishedVersion ?? null,
    publishedAt: draft.publishedAt ?? null,
    ...checks,
    warnings: [...await missingFiles(draft), ...checks.warnings]
  });
}));

// Publish: run the checks, write snapshot n, and return warnings (missing scan files among them).
scenesRouter.post('/:id/publish', requireEditorSession, sceneGuard, wrap(async (req, res) => {
  const result = await publishScene(req.params.id);
  if (!result) return notFound(res, req.params.id);
  result.warnings = [...await missingFiles(await getScene(req.params.id)), ...(result.warnings ?? [])];
  if (result.published) await recordScene(req, req.params.id, 'published', `version ${result.version}`);
  res.status(result.published ? 200 : 422).json(result);
}));

// Take the space offline; its snapshots stay as history.
scenesRouter.post('/:id/unpublish', requireEditorSession, sceneGuard, wrap(async (req, res) => {
  const result = await unpublishScene(req.params.id);
  if (!result) return notFound(res, req.params.id);
  await recordScene(req, req.params.id, 'unpublished');
  res.json(result);
}));

// Throw away draft changes: copy the published version back into the draft.
scenesRouter.post('/:id/revert', requireEditorSession, sceneGuard, wrap(async (req, res) => {
  const doc = await revertToPublished(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Nothing to revert to — this space is not published.' });
  await recordScene(req, req.params.id, 'reverted to the published version');
  res.json(doc);
}));

// Studio: every published version, newest first.
scenesRouter.get('/:id/versions', requireEditorSession, sceneGuard, wrap(async (req, res) => {
  res.json(await listVersions(req.params.id));
}));

// Studio: bring back published version N as the draft; with `publish: true`,
// put it live at once (as a new version, so the history keeps every step).
scenesRouter.post('/:id/restore', requireEditorSession, sceneGuard, wrap(async (req, res) => {
  const version = Number(req.body?.version);
  const doc = await restoreVersion(req.params.id, version);
  if (!doc) return res.status(404).json({ error: `There is no published version ${req.body?.version ?? ''} of this space.` });
  await recordScene(req, req.params.id, 'restored an earlier version', `version ${version}`);
  if (req.body?.publish !== true) return res.json({ doc });
  const result = await publishScene(req.params.id);
  if (result?.published) await recordScene(req, req.params.id, 'published', `version ${result.version}, restored from ${version}`);
  res.status(result?.published ? 200 : 422).json({ doc, publish: result });
}));

// Studio: move a space into a property, or out of all of them with null.
scenesRouter.post('/:id/property', requireEditorSession, sceneGuard, wrap(async (req, res) => {
  const propertyId = req.body?.propertyId ?? null;
  if (propertyId !== null && typeof propertyId !== 'string') {
    return res.status(400).json({ error: 'propertyId must be a property id or null.' });
  }
  const before = await getScene(req.params.id).catch(() => null);
  const result = await setSceneProperty(req.params.id, propertyId, req.access?.sub ?? null);
  if (!result) return notFound(res, req.params.id);
  const title = before?.title || req.params.id;
  if ((before?.propertyId ?? null) !== propertyId) {
    if (before?.propertyId) await record(req, before.propertyId, 'moved a space out', title);
    await record(req, propertyId, 'moved a space in', title);
  }
  res.json(result);
}));

// The studio's space list: only the spaces your projects allow. (Visitors
// never needed it: the tour and gallery read published copies. It was public
// until 2026-09-27, which listed everyone's drafts to anyone.)
scenesRouter.get('/', requireEditorSession, async (req, res, next) => {
  try {
    const session = await optionalSession(req);
    if (!session) return res.status(401).json({ error: 'Your account no longer exists.' });
    res.json(await visibleScenes(session, await listScenes()));
  } catch (err) {
    next(err);
  }
});

// Full draft document — splat pointer, spawn, hotspots, tracks, theme. The
// studio's, so only for those who may work on the space (visitors: /published).
scenesRouter.get('/:id', requireEditorSession, sceneGuard, async (req, res, next) => {
  try {
    const scene = await getScene(req.params.id);
    if (!scene) return res.status(404).json({ error: `Scene "${req.params.id}" not found.` });
    res.json(scene);
  } catch (err) {
    next(err);
  }
});

// Editor save. Session-auth only for now — add embed-token write scoping if
// the editor ever needs to save from an embedded context (it doesn't today).
scenesRouter.put('/:id', requireEditorSession, sceneGuard, async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a scene JSON document.' });
    }
    const existed = !!(await getScene(req.params.id).catch(() => null));
    const saved = await saveScene(req.params.id, req.body, { creator: req.access?.sub ?? null });
    await record(req, saved.propertyId ?? null, existed ? 'saved changes' : 'added a space', saved.title || saved.id);
    res.json(saved);
  } catch (err) {
    next(err);
  }
});
