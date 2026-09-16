import { Router } from 'express';
import { issueSession, clearSession, readSession } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { password } = req.body || {};
  if (!process.env.EDITOR_PASSWORD) {
    return res.status(500).json({ error: 'EDITOR_PASSWORD is not set on the server.' });
  }
  if (password !== process.env.EDITOR_PASSWORD) {
    return res.status(401).json({ error: 'Wrong password.' });
  }
  issueSession(res);
  res.json({ authenticated: true });
});

authRouter.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ authenticated: false });
});

authRouter.get('/session', (req, res) => {
  res.json({ authenticated: !!readSession(req) });
});
