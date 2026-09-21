/**
 * Properties (CLAUDE.md §5.1) — one per client. Studio-only for now: the
 * public hub page (/t/<property>) that would read these is not built yet,
 * so there is no public read and no publish state here.
 */
import { Router } from 'express';
import { listProperties, getProperty, createProperty, renameProperty, deleteProperty, listScenes } from '../store.js';
import { requireEditorSession } from '../middleware/auth.js';

export const propertiesRouter = Router();

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

/** Every property with how many spaces it holds. */
propertiesRouter.get('/', requireEditorSession, wrap(async (req, res) => {
  const [properties, scenes] = await Promise.all([listProperties(), listScenes()]);
  res.json(properties.map((p) => ({ ...p, spaceCount: scenes.filter((s) => s.propertyId === p.id).length })));
}));

propertiesRouter.get('/:id', requireEditorSession, wrap(async (req, res) => {
  const p = await getProperty(req.params.id);
  if (!p) return res.status(404).json({ error: 'That project does not exist.' });
  res.json(p);
}));

propertiesRouter.post('/', requireEditorSession, wrap(async (req, res) => {
  res.status(201).json(await createProperty(req.body?.title));
}));

/** Title only — the id never changes (see renameProperty). */
propertiesRouter.patch('/:id', requireEditorSession, wrap(async (req, res) => {
  const p = await renameProperty(req.params.id, req.body?.title);
  if (!p) return res.status(404).json({ error: 'That project does not exist.' });
  res.json(p);
}));

/** Its spaces are kept and become unfiled; nothing published changes. */
propertiesRouter.delete('/:id', requireEditorSession, wrap(async (req, res) => {
  const result = await deleteProperty(req.params.id);
  if (!result) return res.status(404).json({ error: 'That project does not exist.' });
  res.json(result);
}));
