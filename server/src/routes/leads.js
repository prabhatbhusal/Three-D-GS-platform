/**
 * Public lead intake (CLAUDE.md §6.4). Hostile-facing by definition — no
 * auth, reachable from any embed — so: rate limit by IP, a honeypot field,
 * a submission-time check, a size cap per field, and nothing stored or
 * echoed back that could carry HTML.
 *
 * The rate limiter and the timing check are both in-memory: fine for one
 * process; a real deployment behind multiple instances needs a shared store
 * (Redis, or a column on the Postgres this is standing in for) — noted, not
 * built, since there's exactly one Node process today.
 */
import { Router } from 'express';
import { saveLead, listLeads } from '../leadsStore.js';
import { requireEditorSession } from '../middleware/auth.js';

export const leadsRouter = Router();

const FIELD_LIMITS = { name: 100, phone: 30, email: 200, requirement: 100, dates: 100, message: 2000 };
const REQUIRED = ['name', 'phone'];
const MIN_FILL_TIME_MS = 1200; // a bot fills the form instantly; a person doesn't

// IP -> timestamps of recent submissions. Trimmed lazily on each hit.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_MAX;
}

/** No HTML in anything we store or ever render back. */
const clean = (s) => String(s ?? '').replace(/[<>]/g, '').trim();

leadsRouter.post('/', async (req, res, next) => {
  try {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (rateLimited(ip)) {
      return res.status(429).json({ error: 'Too many enquiries from this connection. Try again shortly.' });
    }

    const body = req.body || {};

    // Bot-catches fail SILENTLY (200, nothing stored) — telling an attacker
    // which check tripped just teaches them to route around it.
    if (clean(body.website)) return res.json({ ok: true });
    const renderedAt = Number(body.formRenderedAt);
    if (!renderedAt || Date.now() - renderedAt < MIN_FILL_TIME_MS) return res.json({ ok: true });

    for (const field of REQUIRED) {
      if (!clean(body[field])) {
        return res.status(400).json({ error: `${field === 'name' ? 'Name' : 'Phone'} is required.` });
      }
    }
    for (const [field, max] of Object.entries(FIELD_LIMITS)) {
      if (clean(body[field]).length > max) {
        return res.status(400).json({ error: `${field} is too long — keep it under ${max} characters.` });
      }
    }
    if (!body.sceneId) return res.status(400).json({ error: 'Missing which space this enquiry is about.' });

    const lead = await saveLead({
      sceneId: clean(body.sceneId),
      sceneName: clean(body.sceneName),
      name: clean(body.name),
      phone: clean(body.phone),
      email: clean(body.email),
      requirement: clean(body.requirement),
      dates: clean(body.dates),
      message: clean(body.message),
      ip
    });

    res.json({ ok: true, id: lead.id });
  } catch (err) {
    next(err);
  }
});

// Internal-only: the studio's future lead list reads from here. Session-
// gated now so it's not sitting open before that UI exists.
leadsRouter.get('/', requireEditorSession, async (req, res, next) => {
  try {
    res.json(await listLeads());
  } catch (err) {
    next(err);
  }
});
