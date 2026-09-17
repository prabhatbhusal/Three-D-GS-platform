/**
 * Upload init/chunk/finalize + range-capable read (CLAUDE.md §7.1, §9).
 *
 * One assetId per upload (one per splat variant — high/medium/low are three
 * separate assets, per the scene schema's `splat.variants`, CLAUDE.md §5.2).
 * Files land in a local staging area first, one small chunk at a time, and
 * only move into real storage (storage.js) on finalize — so a scan is never
 * held in server memory to validate it (§7.1), and a half-finished upload
 * never pollutes the asset store.
 *
 * Resumability needs no client-side bookkeeping: POST .../files always
 * reports how many bytes of that relPath are already staged, so a dropped
 * connection resumes from there instead of restarting (§7.1).
 */
import { Router } from 'express';
import express from 'express';
import { promises as fs, createWriteStream, createReadStream, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import yauzl from 'yauzl';
import { requireEditorSession } from '../middleware/auth.js';
import * as storage from '../storage.js';

export const assetsRouter = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAGING_DIR = path.join(__dirname, '..', 'data', 'uploads-staging');
const CHUNK_MAX = '16mb'; // client sends 8 MB chunks (§7.1); headroom for slop

function newAssetId() {
  return `ast_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/** No `..`, no leading slash, no backslashes — a relPath is a posix-relative path. */
function safeRelPath(relPath) {
  if (typeof relPath !== 'string' || !relPath) return null;
  const normalized = relPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || normalized.split('/').includes('..')) return null;
  return normalized;
}

function stagingFile(assetId, relPath) {
  return path.join(STAGING_DIR, assetId, relPath);
}

async function stagedBytes(assetId, relPath) {
  try {
    const s = await fs.stat(stagingFile(assetId, relPath));
    return s.size;
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
}

/* -------------------------------------------------------------------- */
/* Create — mints an assetId and its staging area                        */
/* -------------------------------------------------------------------- */

assetsRouter.post('/', requireEditorSession, async (req, res, next) => {
  try {
    const assetId = newAssetId();
    await fs.mkdir(path.join(STAGING_DIR, assetId), { recursive: true });
    res.json({ assetId });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------- */
/* Init / resume-check for one file                                      */
/* -------------------------------------------------------------------- */

assetsRouter.post('/:assetId/files', requireEditorSession, async (req, res, next) => {
  try {
    const relPath = safeRelPath(req.body?.relPath);
    if (!relPath) return res.status(400).json({ error: 'relPath is required and must be a relative path.' });
    const bytesReceived = await stagedBytes(req.params.assetId, relPath);
    res.json({ relPath, bytesReceived });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------- */
/* Chunk — raw bytes, appended at a caller-declared offset                */
/* -------------------------------------------------------------------- */

assetsRouter.put(
  '/:assetId/files/chunk',
  requireEditorSession,
  express.raw({ type: () => true, limit: CHUNK_MAX }),
  async (req, res, next) => {
    try {
      const relPath = safeRelPath(req.query.relPath);
      const offset = Number(req.query.offset);
      if (!relPath) return res.status(400).json({ error: 'relPath is required and must be a relative path.' });
      if (!Number.isInteger(offset) || offset < 0) {
        return res.status(400).json({ error: 'offset must be a non-negative integer.' });
      }
      if (!Buffer.isBuffer(req.body) || !req.body.length) {
        return res.status(400).json({ error: 'Empty chunk body.' });
      }

      const current = await stagedBytes(req.params.assetId, relPath);
      if (current !== offset) {
        // Caller's view of the file is stale — tell it where to actually resume.
        return res.status(409).json({ error: 'Offset does not match bytes already staged.', bytesReceived: current });
      }

      const dest = stagingFile(req.params.assetId, relPath);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await new Promise((resolve, reject) => {
        const ws = createWriteStream(dest, { flags: offset === 0 ? 'w' : 'r+', start: offset });
        ws.on('error', reject);
        // 'close', not 'finish': finish fires once the data is handed to the
        // OS but the fd is still open, and Windows won't delete a directory
        // that still has open handles — which left rejected uploads staged.
        ws.on('close', resolve);
        ws.end(req.body);
      });

      res.json({ relPath, bytesReceived: offset + req.body.length });
    } catch (err) {
      next(err);
    }
  }
);

/* -------------------------------------------------------------------- */
/* Zip — extracted in place, staging-to-staging, before finalize's       */
/* usual validate-and-move (so drop-a-zip and drop-a-folder converge     */
/* on the exact same code path from here on).                           */
/* -------------------------------------------------------------------- */

/** Extracts every file entry into the same asset's staging dir. Skips
 *  directory entries and anything that fails the same relPath safety check
 *  a normal upload gets — a hostile path inside the zip doesn't get a pass. */
function extractZipToStaging(assetId, zipRelPath) {
  const zipPath = stagingFile(assetId, zipRelPath);
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
      if (err) return reject(err);
      zipfile.on('error', reject);
      zipfile.on('end', resolve);
      zipfile.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) { zipfile.readEntry(); return; } // directory entry
        const relPath = safeRelPath(entry.fileName);
        if (!relPath) { zipfile.readEntry(); return; } // traversal attempt inside the zip — drop it
        zipfile.openReadStream(entry, (err2, readStream) => {
          if (err2) return reject(err2);
          const dest = stagingFile(assetId, relPath);
          mkdirSync(path.dirname(dest), { recursive: true });
          const ws = createWriteStream(dest);
          readStream.on('error', reject);
          ws.on('error', reject);
          ws.on('finish', () => zipfile.readEntry());
          readStream.pipe(ws);
        });
      });
      zipfile.readEntry();
    });
  });
}

/* -------------------------------------------------------------------- */
/* meta.lcc2 — plain JSON, despite the extension. Its `root` tree lists   */
/* every tile the renderer will ask for, so we can check an export is     */
/* actually complete instead of finding out as a 404 storm at view time.  */
/* -------------------------------------------------------------------- */

/** Every splat/mesh/bvh file the index references, as paths relative to
 *  meta.lcc2's own directory. The `child` map is keyed by octant, not an
 *  array, so walk values either way. */
function collectReferencedFiles(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  for (const key of ['splatFiles', 'meshFiles', 'bvhFiles']) {
    for (const f of node[key] ?? []) if (typeof f === 'string') out.add(f.replace(/\\/g, '/'));
  }
  const kids = node.child;
  if (Array.isArray(kids)) for (const c of kids) collectReferencedFiles(c, out);
  else if (kids && typeof kids === 'object') for (const c of Object.values(kids)) collectReferencedFiles(c, out);
  return out;
}

/* -------------------------------------------------------------------- */
/* Finalize — validate + move staged files into real storage              */
/* -------------------------------------------------------------------- */

async function listStagedFiles(assetId) {
  const root = path.join(STAGING_DIR, assetId);
  let entries;
  try {
    entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((e) => e.isFile())
    // Node's recursive readdir gives `parentPath` (or `path` on older 20.x) per entry.
    .map((e) => path.relative(root, path.join(e.parentPath ?? e.path, e.name)).replace(/\\/g, '/'));
}

assetsRouter.post('/:assetId/finalize', requireEditorSession, async (req, res, next) => {
  const { assetId } = req.params;
  try {
    let relPaths = await listStagedFiles(assetId);
    if (!relPaths.length) {
      return res.status(400).json({ error: 'No files were uploaded for this asset.' });
    }

    // A single .zip upload extracts in place, then the rest of finalize runs
    // exactly as it would for a dropped folder — one code path either way.
    const zipRelPath = relPaths.length === 1 && relPaths[0].toLowerCase().endsWith('.zip') ? relPaths[0] : null;
    if (zipRelPath) {
      try {
        await extractZipToStaging(assetId, zipRelPath);
      } catch {
        // Don't leak yauzl's raw error text (§11: no exception strings), and
        // don't leave a half-extracted zip's files sitting in staging forever
        // — every other rejection path below cleans up before returning.
        await fs.rm(path.join(STAGING_DIR, assetId), { recursive: true, force: true });
        return res.status(400).json({ error: 'That zip looks corrupt or unreadable — re-export it and try again.' });
      }
      await fs.rm(stagingFile(assetId, zipRelPath), { force: true });
      relPaths = await listStagedFiles(assetId);
      if (!relPaths.length) {
        await fs.rm(path.join(STAGING_DIR, assetId), { recursive: true, force: true });
        return res.status(400).json({ error: 'The zip file was empty.' });
      }
    }

    // The index is NOT reliably called meta.lcc2 — Lixel Studio names it after
    // the capture (Library.lcc2, Bar_Restro.lcc2, ...), and a folder can hold
    // more than one, including a stale one left over from an earlier export.
    // So: don't trust the filename. Check each candidate against the files
    // actually present and use the one that matches; a stale index is exactly
    // the thing that shows up later as a 404 storm from CollLoader.
    const indexPaths = relPaths
      .filter((p) => p.toLowerCase().endsWith('.lcc2'))
      .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
    if (!indexPaths.length) {
      await fs.rm(path.join(STAGING_DIR, assetId), { recursive: true, force: true });
      return res.status(400).json({ error: 'No .lcc2 index found in the upload — pick the whole Lixel Studio export.' });
    }

    const staged = new Set(relPaths);
    let chosen = null; // first candidate whose every referenced tile is present
    let closest = null; // else the least-broken one, for the error message
    for (const relPath of indexPaths) {
      let meta;
      try {
        // ~100 KB of JSON: the index, not the scan (§7.1's "never load a scan
        // into server memory" still holds).
        meta = JSON.parse(await fs.readFile(stagingFile(assetId, relPath), 'utf8'));
      } catch {
        continue; // not readable JSON — try the next candidate
      }
      const dir = path.posix.dirname(relPath);
      const missing = [...collectReferencedFiles(meta.root)].filter(
        (rel) => !staged.has(dir === '.' ? rel : `${dir}/${rel}`)
      );
      if (!missing.length) { chosen = { relPath, meta }; break; }
      if (!closest || missing.length < closest.missing.length) closest = { relPath, meta, missing };
    }

    if (!chosen) {
      await fs.rm(path.join(STAGING_DIR, assetId), { recursive: true, force: true });
      if (!closest) {
        return res.status(400).json({ error: `${indexPaths[0]} isn't readable JSON — the export looks corrupt.` });
      }
      return res.status(400).json({
        error:
          `This export is incomplete: ${closest.relPath} references ${closest.missing.length} file(s) that aren't ` +
          `in it, starting with ${closest.missing.slice(0, 3).join(', ')}. Re-export it from Lixel Studio.`
      });
    }

    const metaRelPath = chosen.relPath;
    const meta = chosen.meta;

    let bytes = 0;
    for (const relPath of relPaths) {
      const full = stagingFile(assetId, relPath);
      const { size } = await fs.stat(full);
      if (size === 0) return res.status(400).json({ error: `${relPath} uploaded empty — never load a partial scan.` });
      bytes += size;
      // eslint-disable-next-line no-await-in-loop -- files are moved sequentially; a scan is dozens, not thousands
      await storage.put(assetId, relPath, createReadStream(full));
    }

    await fs.rm(path.join(STAGING_DIR, assetId), { recursive: true, force: true });
    res.json({
      assetId,
      bytes,
      fileCount: relPaths.length,
      meta: metaRelPath,
      splatCount: typeof meta.totalSplats === 'number' ? meta.totalSplats : null,
      bbox: meta.root?.boundingBox ?? null
    });
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------- */
/* Read — public, range-capable (the SDK streams tiles with 206s)        */
/* -------------------------------------------------------------------- */

assetsRouter.get('/:assetId/*', async (req, res, next) => {
  try {
    const relPath = safeRelPath(req.params[0]);
    if (!relPath) return res.status(400).json({ error: 'Invalid asset path.' });

    const { bytes, contentType } = await storage.stat(req.params.assetId, relPath);
    const range = req.headers.range;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', contentType);

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : bytes - 1;
      if (!match || start > end || end >= bytes) {
        res.setHeader('Content-Range', `bytes */${bytes}`);
        return res.status(416).end();
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${bytes}`);
      res.setHeader('Content-Length', end - start + 1);
      storage.get(req.params.assetId, relPath, { range: { start, end } }).pipe(res);
    } else {
      res.setHeader('Content-Length', bytes);
      storage.get(req.params.assetId, relPath).pipe(res);
    }
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Asset not found.' });
    next(err);
  }
});

assetsRouter.delete('/:assetId', requireEditorSession, async (req, res, next) => {
  try {
    await storage.remove(req.params.assetId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
