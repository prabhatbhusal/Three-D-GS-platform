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

const app = express();
const PORT = process.env.PORT || 4000;
// The Next app's own origin, so the editor's session cookie survives a
// cross-origin fetch (dev: Next on 3000, API on 4000).
const ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

app.use(cors({ origin: ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '2mb' })); // scene JSON docs are small; thumbs are data URLs, so give this some room

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/scenes', scenesRouter);
app.use('/api/gallery', galleryRouter);
app.use('/api/auth', authRouter);
app.use('/api/embed', embedRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/assets', assetsRouter);
app.use('/api/properties', propertiesRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

app.listen(PORT, () => {
  console.log(`[server] splatspace API listening on http://localhost:${PORT}`);
});
