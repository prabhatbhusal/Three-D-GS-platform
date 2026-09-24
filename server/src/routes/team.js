/**
 * The team list — who has a studio account and their role. Admin-only: this
 * is the console for promoting/demoting people (§21: "one task, one status
 * marker" — this is the whole of what "different admins" needed on the
 * server; there is no invite flow, see CLAUDE.md).
 */
import { Router } from 'express';
import { listUsers, setUserRole } from '../usersStore.js';
import { requireAdmin } from '../middleware/auth.js';

export const teamRouter = Router();

const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

teamRouter.get('/', requireAdmin, wrap(async (req, res) => {
  res.json(await listUsers());
}));

teamRouter.patch('/:id/role', requireAdmin, wrap(async (req, res) => {
  const role = req.body?.role;
  if (role !== 'admin' && role !== 'editor') return res.status(400).json({ error: 'role must be "admin" or "editor".' });
  try {
    const user = await setUserRole(req.params.id, role);
    if (!user) return res.status(404).json({ error: 'That account does not exist.' });
    res.json(user);
  } catch (err) {
    // setUserRole's last-admin guard carries its own status.
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
}));
