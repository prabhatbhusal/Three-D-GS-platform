import { Router } from 'express';
import { listScenes, getScene, saveScene } from '../store.js';
import { requireEditorSession } from '../middleware/auth.js';

export const scenesRouter = Router();

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
