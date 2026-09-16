/**
 * Signed short-lived tokens for embeds (CLAUDE.md: "signed short-lived tokens
 * for embeds"). A client site's server requests a token for the scene it's
 * allowed to show and passes it in the iframe src; nothing here yet actually
 * gates the viewer on it — that check belongs wherever the embed route ends
 * up living once real clients need access control instead of just a public
 * scene menu. This issues and verifies the token so that wiring is a small
 * follow-up, not a new subsystem.
 */
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { getScene } from '../store.js';

export const embedRouter = Router();
const TOKEN_TTL = '10m';

function secret() {
  const s = process.env.EMBED_TOKEN_SECRET;
  if (!s) throw new Error('EMBED_TOKEN_SECRET is not set — see server/.env.example');
  return s;
}

embedRouter.post('/token', async (req, res, next) => {
  try {
    const { sceneId } = req.body || {};
    if (!sceneId) return res.status(400).json({ error: 'sceneId is required.' });
    const scene = await getScene(sceneId);
    if (!scene) return res.status(404).json({ error: `Scene "${sceneId}" not found.` });

    const token = jwt.sign({ sceneId }, secret(), { expiresIn: TOKEN_TTL });
    res.json({ token, sceneId, expiresIn: TOKEN_TTL });
  } catch (err) {
    next(err);
  }
});

embedRouter.get('/verify', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ valid: false, error: 'token is required.' });
  try {
    const payload = jwt.verify(token, secret());
    res.json({ valid: true, sceneId: payload.sceneId });
  } catch {
    res.status(401).json({ valid: false });
  }
});
