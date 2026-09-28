import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { scenesRouter, galleryRouter } from './routes/scenes.js';
import { authRouter } from './routes/auth.js';
import { embedRouter } from './routes/embed.js';
import { leadsRouter } from './routes/leads.js';
import { assetsRouter } from './routes/assets.js';
import { propertiesRouter } from './routes/properties.js';
import { teamRouter } from './routes/team.js';
import { statsRouter } from './routes/stats.js';
import { sitesRouter } from './routes/sites.js';
import { reservationsRouter } from './routes/reservations.js';
import { fileURLToPath } from 'url';
import path from 'path';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const DEV = process.env.NODE_ENV !== 'production';
const HERE = path.dirname(fileURLToPath(import.meta.url));
// The Next app's own origin, so the editor's session cookie survives a
// cross-origin fetch (dev: Next on 3000, API on 4000). In development any
// localhost port is the site too: Next moves to 3001 by itself when 3000 is
// taken, and refusing it there broke every request.
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const allowed = (origin) => !origin || origin === ORIGIN || (DEV && LOCALHOST.test(origin));

app.use(cors({ origin: (origin, done) => done(null, allowed(origin)), credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' })); // scene JSON docs are small; thumbs are data URLs, so give this some room

// In development it says which copy of the API this is, so a new one (or
// scripts/dev.mjs) can recognise and stop a copy an editor left running.
app.get('/api/health', (req, res) => res.json(DEV ? { ok: true, service: 'rcaas-api', pid: process.pid, dir: HERE } : { ok: true }));
app.use('/api/scenes', scenesRouter);
app.use('/api/gallery', galleryRouter);
app.use('/api/auth', authRouter);
app.use('/api/embed', embedRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/properties', propertiesRouter);
app.use('/api/team', teamRouter);
app.use('/api/stats', statsRouter);
app.use('/api/sites', reservationsRouter);
app.use('/api/sites', sitesRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

/**
 * Listen on PORT. If it's taken by an earlier copy of this same API (VS Code
 * closed without stopping it), stop that copy and take the port back; if
 * something else has it, move up a port (at most ten) and say so, since the
 * site must then be pointed at the new one (scripts/dev.mjs does that itself).
 */
async function sameApiOn(port) {
  try {
    const h = await (await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(1500) })).json();
    return h?.service === 'rcaas-api' && h.dir === HERE && h.pid !== process.pid ? h.pid : null;
  } catch {
    return null;
  }
}

function listen(port, tries = 0) {
  const server = app.listen(port, () => {
    console.log(`[server] splatspace API listening on http://localhost:${port}`);
    if (port !== PORT) {
      console.warn(`[server] (not ${PORT}: it was taken). Point the site here: NEXT_PUBLIC_API_URL=http://localhost:${port}\n` +
        '[server] or start both with "npm run dev" at the project root, which does it for you.');
    }
  });
  server.on('error', async (err) => {
    if (err.code !== 'EADDRINUSE' || tries >= 10) throw err;
    const stale = DEV && tries === 0 ? await sameApiOn(port) : null;
    if (stale) {
      console.warn(`[server] an earlier copy of this API (pid ${stale}) still holds :${port}; stopping it`);
      try { process.kill(stale); } catch { /* already gone */ }
      await new Promise((r) => setTimeout(r, 1000));
      return listen(port, tries + 1);
    }
    console.warn(`[server] port ${port} is in use; trying ${port + 1}`);
    listen(port + 1, tries + 1);
  });
}
listen(PORT);
