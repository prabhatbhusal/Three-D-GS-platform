/**
 * Editor session auth. CLAUDE.md: "session auth for the editor, signed
 * short-lived tokens for embeds" — this is the session half. A signed,
 * httpOnly cookie carrying the account (routes/auth.js, usersStore.js), or
 * no account for the legacy shared-password sign-in.
 */
import jwt from 'jsonwebtoken';

const SESSION_COOKIE = 'splatspace_session';
const SESSION_TTL = '12h';

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set — see server/.env.example');
  return s;
}

/** `user` is null for the legacy shared-password sign-in. */
export function issueSession(res, user = null) {
  const claims = user ? { role: 'editor', sub: user.id, name: user.name, email: user.email } : { role: 'editor' };
  const token = jwt.sign(claims, secret(), { expiresIn: SESSION_TTL });
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 12 * 60 * 60 * 1000
  });
}

export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE);
}

export function readSession(req) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return null;
  try {
    return jwt.verify(token, secret());
  } catch {
    return null;
  }
}

/** Blocks the request unless it carries a valid editor session cookie. */
export function requireEditorSession(req, res, next) {
  const session = readSession(req);
  if (!session) return res.status(401).json({ error: 'Sign in to the editor first.' });
  req.session = session;
  next();
}
