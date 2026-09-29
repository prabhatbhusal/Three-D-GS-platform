/**
 * Public visit beacons from the tour (stats.js). The tour sends them with
 * navigator.sendBeacon as text/plain — a beacon can't make the preflight a
 * JSON content type would need. Only published spaces count, and the project
 * is looked up here, never taken from the beacon. Rate-limited per IP so a
 * script can't inflate a client's numbers much.
 *
 *   POST /api/stats   { space, visit?: true, seconds?: number }
 *                     { space, hotspot: id, first?: true }   a hotspot opened (the first of the visit: first)
 *                     { space, intent: 'enquire' | 'book' | 'table' | 'room' | 'whatsapp' }   a card (or WhatsApp) opened, once per visit
 */
import { Router } from 'express';
import express from 'express';
import { getPublishedScene } from '../store.js';
import { count, INTENTS } from '../stats.js';

export const statsRouter = Router();

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = Number(process.env.STATS_RATE_MAX) || 120; // tests raise it
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_MAX;
}

statsRouter.post('/', express.text({ type: () => true, limit: '2kb' }), async (req, res, next) => {
  try {
    // Always 204: a beacon doesn't read the answer, and a refusal shouldn't teach anyone anything.
    res.status(204).end();
    if (rateLimited(req.ip || req.socket?.remoteAddress || 'unknown')) return;
    let body;
    try { body = JSON.parse(typeof req.body === 'string' ? req.body : ''); } catch { return; }
    const space = typeof body?.space === 'string' && /^[a-z0-9-]+$/i.test(body.space) ? body.space : null;
    if (!space) return;
    const snap = await getPublishedScene(space).catch(() => null);
    if (!snap?.propertyId) return;
    // A hotspot must be one this published space has; its name comes from there, not the beacon.
    if (typeof body.hotspot === 'string') {
      const h = (snap.hotspots ?? []).find((x) => x.id === body.hotspot);
      if (h) await count(snap.propertyId, space, { hotspot: { id: h.id, label: String(h.label ?? '').slice(0, 80) || h.id }, first: body.first === true });
      return;
    }
    if (INTENTS.includes(body.intent)) return void (await count(snap.propertyId, space, { intent: body.intent }));
    const seconds = Math.max(0, Math.min(1800, Math.round(Number(body.seconds) || 0))); // at most 30 min per beacon
    if (body.visit !== true && !seconds) return;
    await count(snap.propertyId, space, { visit: body.visit === true, seconds });
  } catch (err) {
    console.warn('[stats]', err.message);
  }
});
