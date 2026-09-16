/**
 * Editor session auth. CLAUDE.md: "session auth for the editor, signed
 * short-lived tokens for embeds" — this is the session half. There is no user
 * database yet (Postgres "not started"), so it checks one shared editor
 * password from the environment and issues a signed, httpOnly session cookie.
 * Swap this for real per-user sessions once accounts exist.
 */
import jwt from 'jsonwebtoken';

const SESSION_COOKIE = 'splatspace_session';
const SESSION_TTL = '12h';

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set — see server/.env.example');
  return s;
}

export function issueSession(res) {
  const token = jwt.sign({ role: 'editor' }, secret(), { expiresIn: SESSION_TTL });
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
