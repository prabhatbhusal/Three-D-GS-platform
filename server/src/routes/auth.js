/**
 * Studio sign-up / sign-in.
 *
 * Accounts are per person, but creating one needs the team access code — the
 * existing EDITOR_PASSWORD. The studio session can upload models and
 * overwrite scenes, so open public sign-up would hand that to anyone who
 * found the page. The code keeps the security boundary where it was.
 *
 * `POST /login` with only `{ password }` is the old shared-password sign-in,
 * still used by the uploader's inline sign-in. It stays until every teammate
 * has an account.
 */
import { Router } from 'express';
import { timingSafeEqual } from 'crypto';
import { issueSession, clearSession, readSession, staleReason } from '../middleware/auth.js';
import { createUser, verifyUser, getUserById, resetPassword } from '../usersStore.js';

export const authRouter = Router();

// In-memory, per IP — same shape as leads.js; one process today.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = Number(process.env.AUTH_RATE_MAX) || 10; // tests raise it; production keeps 10
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_MAX;
}
const ipOf = (req) => req.ip || req.socket?.remoteAddress || 'unknown';
const TOO_MANY = { error: 'Too many attempts from this connection. Wait a few minutes and try again.' };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v) => (typeof v === 'string' ? v : '');

function teamCodeMatches(code) {
  const expected = process.env.EDITOR_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(str(code));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

authRouter.post('/signup', async (req, res, next) => {
  try {
    if (rateLimited(ipOf(req))) return res.status(429).json(TOO_MANY);
    if (!process.env.EDITOR_PASSWORD) {
      return res.status(500).json({ error: 'EDITOR_PASSWORD is not set on the server.' });
    }
    const name = str(req.body?.name).trim();
    const email = str(req.body?.email).trim();
    const password = str(req.body?.password);

    if (!name || name.length > 80) return res.status(400).json({ error: 'Enter your name (80 characters at most).' });
    if (!EMAIL_RE.test(email) || email.length > 200) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
    }
    if (!teamCodeMatches(req.body?.accessCode)) {
      return res.status(403).json({ error: 'That team access code is wrong. Ask your studio lead for it.' });
    }

    const user = await createUser({ name: name.replace(/[<>]/g, ''), email, password });
    if (!user) return res.status(409).json({ error: 'An account with that email already exists. Sign in instead.' });

    issueSession(res, user);
    res.status(201).json({ authenticated: true, user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    if (rateLimited(ipOf(req))) return res.status(429).json(TOO_MANY);
    const { email, password } = req.body || {};

    if (!email) {
      if (!process.env.EDITOR_PASSWORD) {
        return res.status(500).json({ error: 'EDITOR_PASSWORD is not set on the server.' });
      }
      if (!teamCodeMatches(password)) return res.status(401).json({ error: 'Wrong password.' });
      issueSession(res);
      return res.json({ authenticated: true, user: null });
    }

    const user = await verifyUser(str(email), str(password));
    if (!user) return res.status(401).json({ error: 'Email or password is wrong.' });
    issueSession(res, user);
    res.json({ authenticated: true, user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ authenticated: false });
});

/** Set a new password from an admin's one-time reset link (routes/team.js),
 *  and sign in with it. Every older session of that account stops working. */
authRouter.post('/reset', async (req, res, next) => {
  try {
    if (rateLimited(ipOf(req))) return res.status(429).json(TOO_MANY);
    const token = str(req.body?.token);
    const password = str(req.body?.password);
    if (password.length < 8 || password.length > 200) {
      return res.status(400).json({ error: 'Use a password of at least 8 characters.' });
    }
    const user = token ? await resetPassword(token, password) : null;
    if (!user) return res.status(400).json({ error: 'That reset link has expired or was already used. Ask an admin for a new one.' });
    issueSession(res, user);
    res.json({ authenticated: true, user });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/session', async (req, res) => {
  let s = readSession(req);
  // removed, or signed in before a password reset: signed out
  if (s && (await staleReason(s))) { clearSession(res); s = null; }
  // Role read fresh from the account, not the JWT claim, so a promotion or
  // demotion shows up on the next load instead of waiting out the cookie.
  const role = s?.sub ? (await getUserById(s.sub))?.role ?? 'editor' : undefined;
  res.json({
    authenticated: !!s,
    user: s?.sub ? { id: s.sub, name: s.name, email: s.email, role } : null
  });
});
