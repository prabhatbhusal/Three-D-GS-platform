/**
 * Embeds (2026-09-25). A hotel pastes an iframe once, so a short-lived token
 * can't be what lets it in. Instead each space has an embed key — an HMAC of
 * its id and an embed `version`, no expiry — baked into the snippet the
 * studio hands out. Retiring every old snippet is one bump of the version.
 * Optionally a space lists the websites allowed to frame it; the tour checks
 * the page it is actually inside (the browser's own `ancestorOrigins`, else
 * the referrer), which the embedding page can't forge.
 *
 *   GET  /api/embed/:id           studio: the key, version and sites
 *   POST /api/embed/:id           studio: { sites?: string[], rotate?: true }
 *   GET  /api/embed/check?space=&key=&from=   public: may this frame show it?
 */
import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { getEmbed, setEmbed } from '../store.js';
import { requireEditorSession } from '../middleware/auth.js';
import { sceneGuard } from '../access.js';
import { recordScene } from '../activity.js';

export const embedRouter = Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

function secret() {
  const s = process.env.EMBED_TOKEN_SECRET;
  if (!s) throw new Error('EMBED_TOKEN_SECRET is not set — see server/.env.example');
  return s;
}

export const embedKey = (sceneId, version) =>
  createHmac('sha256', secret()).update(`${sceneId}\n${version}`).digest('base64url').slice(0, 24);

/** "https://www.Basera.com/rooms" or "basera.com" -> "basera.com" */
export function siteOf(s) {
  const raw = String(s ?? '').trim().toLowerCase();
  if (!raw) return '';
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Allowed if no list is set, if it's our own site, or the host is a listed
 *  site or a subdomain of one. */
export function siteAllowed(from, sites, own = []) {
  const host = siteOf(from);
  if (!sites.length) return true;
  if (!host) return false; // the page hid where it is: with a list set, that's a no
  return [...sites, ...own].some((s) => host === s || host.endsWith(`.${s}`));
}

const ownSites = () => [siteOf(process.env.CLIENT_ORIGIN || 'http://localhost:3000')];

embedRouter.get('/check', wrap(async (req, res) => {
  const space = String(req.query.space ?? '');
  const key = String(req.query.key ?? '');
  const embed = /^[a-z0-9-]+$/i.test(space) ? await getEmbed(space) : null;
  if (!embed) return res.status(404).json({ ok: false, reason: 'unknown' });
  const want = Buffer.from(embedKey(space, embed.version));
  const got = Buffer.from(key);
  if (got.length !== want.length || !timingSafeEqual(got, want)) return res.json({ ok: false, reason: 'key' });
  if (!siteAllowed(req.query.from, embed.sites, ownSites())) return res.json({ ok: false, reason: 'site' });
  res.json({ ok: true });
}));

embedRouter.get('/:id', requireEditorSession, sceneGuard, wrap(async (req, res) => {
  const embed = await getEmbed(req.params.id);
  if (!embed) return res.status(404).json({ error: 'That space does not exist.' });
  res.json({ ...embed, key: embedKey(req.params.id, embed.version) });
}));

embedRouter.post('/:id', requireEditorSession, sceneGuard, wrap(async (req, res) => {
  const current = await getEmbed(req.params.id);
  if (!current) return res.status(404).json({ error: 'That space does not exist.' });
  const patch = {};
  if (req.body?.rotate === true) patch.version = current.version + 1;
  if (Array.isArray(req.body?.sites)) {
    const sites = [...new Set(req.body.sites.map(siteOf).filter(Boolean))].slice(0, 20);
    patch.sites = sites;
  }
  const embed = await setEmbed(req.params.id, patch);
  if (patch.version !== undefined) await recordScene(req, req.params.id, 'retired old embed codes');
  if (patch.sites) await recordScene(req, req.params.id, 'changed where it can be embedded', patch.sites.length ? patch.sites.join(', ') : 'any website');
  res.json({ ...embed, key: embedKey(req.params.id, embed.version) });
}));
