import { Router } from 'express';
import {
  listScenes, getScene, saveScene, publishChecks, publishScene, unpublishScene,
  getPublishedScene, revertToPublished, listPublished, setSceneProperty
} from '../store.js';
import { requireEditorSession } from '../middleware/auth.js';

export const scenesRouter = Router();
export const galleryRouter = Router();

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const notFound = (res, id) => res.status(404).json({ error: `Scene "${id}" not found.` });

// Public: every published space, for the gallery page.
galleryRouter.get('/', wrap(async (req, res) => { res.json(await listPublished()); }));

// Public: what visitors see. Never the draft (§7.5, constraint 6).
scenesRouter.get('/:id/published', wrap(async (req, res) => {
  const doc = await getPublishedScene(req.params.id);
  if (!doc) return res.status(404).json({ error: 'This space is not published.' });
  res.json(doc);
}));

// Studio: publish state + what would block or warn, without publishing.
scenesRouter.get('/:id/publish', requireEditorSession, wrap(async (req, res) => {
  const draft = await getScene(req.params.id);
  if (!draft) return notFound(res, req.params.id);
  res.json({
    status: draft.status ?? 'draft',
    publishedVersion: draft.publishedVersion ?? null,
    publishedAt: draft.publishedAt ?? null,
    ...publishChecks(draft)
  });
}));

scenesRouter.post('/:id/publish', requireEditorSession, wrap(async (req, res) => {
  const result = await publishScene(req.params.id);
  if (!result) return notFound(res, req.params.id);
  res.status(result.published ? 200 : 422).json(result);
}));

scenesRouter.post('/:id/unpublish', requireEditorSession, wrap(async (req, res) => {
  const result = await unpublishScene(req.params.id);
  if (!result) return notFound(res, req.params.id);
  res.json(result);
}));

scenesRouter.post('/:id/revert', requireEditorSession, wrap(async (req, res) => {
  const doc = await revertToPublished(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Nothing to revert to — this space is not published.' });
  res.json(doc);
}));

// Studio: move a space into a property, or out of all of them with null.
scenesRouter.post('/:id/property', requireEditorSession, wrap(async (req, res) => {
  const propertyId = req.body?.propertyId ?? null;
  if (propertyId !== null && typeof propertyId !== 'string') {
    return res.status(400).json({ error: 'propertyId must be a property id or null.' });
  }
  const result = await setSceneProperty(req.params.id, propertyId);
  if (!result) return notFound(res, req.params.id);
  res.json(result);
}));

// Visitor-facing: the scene menu. No auth — this is public, embeddable data.
scenesRouter.get('/', async (req, res, next) => {
  try {
    res.json(await listScenes());
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
scenesRouter.put('/:id', requireEditorSession, async (req, res, next) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a scene JSON document.' });
    }
    const saved = await saveScene(req.params.id, req.body);
    res.json(saved);
  } catch (err) {
    next(err);
  }
});
