/**
 * The team list — who has a studio account and their role. Admin-only: the
 * console for promoting/demoting people, making a one-time password reset
 * link (there's no email service yet: the admin sends it), and removing an
 * account. A removed person is signed out everywhere at once
 * (middleware/auth.js) and their projects pass to the admin who removed them.
 */
import { Router } from 'express';
import { listUsers, setUserRole, createResetToken, deleteUser } from '../usersStore.js';
import { reassignProjects } from '../store.js';
import { requireAdmin } from '../middleware/auth.js';

export const teamRouter = Router();

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const withStatus = (fn) => wrap(async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

teamRouter.get('/', requireAdmin, wrap(async (req, res) => {
  res.json(await listUsers());
}));

teamRouter.patch('/:id/role', requireAdmin, withStatus(async (req, res) => {
  const role = req.body?.role;
  if (role !== 'admin' && role !== 'editor') return res.status(400).json({ error: 'role must be "admin" or "editor".' });
  const user = await setUserRole(req.params.id, role);
  if (!user) return res.status(404).json({ error: 'That account does not exist.' });
  res.json(user);
}));

/** A one-time link, good for 24 hours, to send to the person. */
teamRouter.post('/:id/reset', requireAdmin, wrap(async (req, res) => {
  const r = await createResetToken(req.params.id);
  if (!r) return res.status(404).json({ error: 'That account does not exist.' });
  res.json({ path: `/login?reset=${r.token}`, expires: r.expires, user: r.user });
}));

teamRouter.delete('/:id', requireAdmin, withStatus(async (req, res) => {
  if (req.params.id === req.session.sub) return res.status(400).json({ error: 'You can’t remove your own account.' });
  const gone = await deleteUser(req.params.id);
  if (!gone) return res.status(404).json({ error: 'That account does not exist.' });
  const moved = await reassignProjects(gone.id, req.session.sub ?? null);
  res.json({ removed: gone, projectsReassigned: moved });
}));
