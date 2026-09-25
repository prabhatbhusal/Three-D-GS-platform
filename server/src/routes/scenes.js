import { Router } from 'express';
import {
  listScenes, getScene, saveScene, publishChecks, publishScene, unpublishScene,
  getPublishedScene, revertToPublished, listPublished, setSceneProperty, listVersions, restoreVersion
} from '../store.js';
import { requireEditorSession } from '../middleware/auth.js';
import { sceneGuard, optionalSession, visibleScenes } from '../access.js';
import { record, recordScene } from '../activity.js';

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

// Public: what visitors see. Never the draft (§7.5, constraint 6).
scenesRouter.get('/:id/published', wrap(async (req, res) => {
  const doc = await getPublishedScene(req.params.id);
  if (!doc) return res.status(404).json({ error: 'This space is not published.' });
  res.json(doc);
}));

// Studio: publish state + what would block or warn, without publishing.
scenesRouter.get('/:id/publish', requireEditorSession, sceneGuard, wrap(async (req, res) => {
  const draft = await getScene(req.params.id);
  if (!draft) return notFound(res, req.params.id);
  res.json({
    status: draft.status ?? 'draft',
    publishedVersion: draft.publishedVersion ?? null,
    publishedAt: draft.publishedAt ?? null,
    ...publishChecks(draft)
  });
}));

scenesRouter.post('/:id/publish', requireEditorSession, sceneGuard, wrap(async (req, res) => {
  const result = await publishScene(req.params.id);
  if (!result) return notFound(res, req.params.id);
  if (result.published) await recordScene(req, req.params.id, 'published', `version ${result.version}`);
  res.status(result.published ? 200 : 422).json(result);
}));

scenesRouter.post('/:id/unpublish', requireEditorSession, sceneGuard, wrap(async (req, res) => {
  const result = await unpublishScene(req.params.id);
  if (!result) return notFound(res, req.params.id);
  await recordScene(req, req.params.id, 'unpublished');
  res.json(result);
}));

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
  const result = await setSceneProperty(req.params.id, propertyId);
  if (!result) return notFound(res, req.params.id);
  const title = before?.title || req.params.id;
  if ((before?.propertyId ?? null) !== propertyId) {
    if (before?.propertyId) await record(req, before.propertyId, 'moved a space out', title);
    await record(req, propertyId, 'moved a space in', title);
  }
  res.json(result);
}));

// Visitor-facing: the scene menu. No auth — this is public, embeddable data.
// Signed in to the studio, you see only the spaces your projects allow.
scenesRouter.get('/', async (req, res, next) => {
  try {
    const all = await listScenes();
    const session = await optionalSession(req);
    res.json(session ? await visibleScenes(session, all) : all);
  } catch (err) {
    next(err);
  }
});

// Full scene document — splat pointer, spawn, hotspots, tracks, theme.
scenesRouter.get('/:id', async (req, res, next) => {
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
    const saved = await saveScene(req.params.id, req.body);
    await record(req, saved.propertyId ?? null, existed ? 'saved changes' : 'added a space', saved.title || saved.id);
    res.json(saved);
  } catch (err) {
    next(err);
  }
});
