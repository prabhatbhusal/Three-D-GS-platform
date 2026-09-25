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
import { randomUUID } from 'crypto';
import yauzl from 'yauzl';
import zlib from 'zlib';
import { Readable } from 'stream';
import { requireEditorSession } from '../middleware/auth.js';
import { assetGuard } from '../access.js';
import { recordAsset } from '../activity.js';
import * as storage from '../storage.js';
import { buildFloorPlan } from '../floorplan.js';
import { DATA_DIR } from '../dataDir.js';

export const assetsRouter = Router();

// Every route joins :assetId into a filesystem path, and several rm -rf it.
// Same rule storage.js enforces — letters, digits, _ and - only, so "..",
// "/" and "\\" never reach path.join.
assetsRouter.param('assetId', (req, res, next, id) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(400).json({ error: 'Invalid asset id.' });
  next();
});

const STAGING_DIR = path.join(DATA_DIR, 'uploads-staging');
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

/* -------------------------------------------------------------------- */
/* Audio (§6.3) — one AAC .m4a, at most 2 MB. Same upload, same asset ids */
/* as a splat export; only the validation differs.                       */
/* -------------------------------------------------------------------- */

const AUDIO_MAX_BYTES = 2 * 1024 * 1024;

/** An .m4a is an MP4 container: bytes 4-8 are "ftyp". Catches an .mp3 or a
 *  .wav renamed to .m4a, which would otherwise fail silently on a visitor's
 *  phone instead of here. */
async function looksLikeMp4(file) {
  const fh = await fs.open(file, 'r');
  try {
    const head = Buffer.alloc(12);
    const { bytesRead } = await fh.read(head, 0, 12, 0);
    return bytesRead === 12 && head.toString('latin1', 4, 8) === 'ftyp';
  } finally {
    await fh.close();
  }
}

async function finalizeAudio(assetId, res) {
  const relPaths = await listStagedFiles(assetId);
  const reject = async (msg) => {
    await fs.rm(path.join(STAGING_DIR, assetId), { recursive: true, force: true });
    return res.status(400).json({ error: msg });
  };
  if (relPaths.length !== 1) return reject('Upload one audio file at a time.');
  const [relPath] = relPaths;
  if (!relPath.toLowerCase().endsWith('.m4a')) {
    return reject('Audio must be AAC in an .m4a file (mono, 96 kbps). That format plays in every browser, including older Safari.');
  }
  const full = stagingFile(assetId, relPath);
  const { size } = await fs.stat(full);
  if (!size) return reject(`${relPath} uploaded empty.`);
  if (size > AUDIO_MAX_BYTES) {
    return reject(`${relPath} is ${(size / 1048576).toFixed(1)} MB. Audio is capped at 2 MB per space — re-encode it mono at 96 kbps, or trim it.`);
  }
  if (!(await looksLikeMp4(full))) return reject(`${relPath} isn't really an .m4a file — export it again as AAC (.m4a).`);

  await storage.put(assetId, relPath, createReadStream(full));
  await fs.rm(path.join(STAGING_DIR, assetId), { recursive: true, force: true });
  return res.json({ assetId, bytes: size, file: relPath });
}

/* -------------------------------------------------------------------- */
/* 3D models — FBX / OBJ / PLY / glTF. The studio converts them in the   */
/* browser (src/lib/modelConvert.ts: upright, metres, centred, a floor   */
/* for point clouds, meshopt-compressed) and uploads one .glb. This     */
/* checks it is one, and keeps a gzipped copy to send (§3 budgets).     */
/* -------------------------------------------------------------------- */

const MODEL_SOURCE = /\.(fbx|obj|ply|gltf)$/i;

/** Reads the start of a GLB: its header and JSON chunk, never the geometry
 *  (§7.1). Returns { kind } or { error }. */
export function inspectGlb(head, name) {
  if (head.length < 20 || head.toString('latin1', 0, 4) !== 'glTF') return { error: `${name} isn't a GLB file.` };
  if (head.readUInt32LE(4) !== 2) return { error: `${name} is glTF version ${head.readUInt32LE(4)}; only version 2 loads.` };
  const jsonLength = head.readUInt32LE(12);
  if (head.toString('latin1', 16, 20) !== 'JSON' || 20 + jsonLength > head.length) {
    return { error: `${name} has no readable scene description. Export it again.` };
  }
  let gltf;
  try {
    gltf = JSON.parse(head.toString('utf8', 20, 20 + jsonLength));
  } catch {
    return { error: `${name} has a corrupt scene description. Export it again.` };
  }
  // mode 0 = POINTS. The converter adds a hidden floor to a point cloud, on
  // a node named rcaas-collision, so "points" means: everything *drawn* is
  // points. (The exporter names nodes, not meshes.)
  const meshes = gltf.meshes ?? [];
  if (!meshes.some((m) => m.primitives?.length)) return { error: `${name} has no geometry in it.` };
  const hidden = new Set((gltf.nodes ?? []).filter((n) => n.name === 'rcaas-collision').map((n) => n.mesh));
  const drawn = meshes.filter((_, i) => !hidden.has(i)).flatMap((m) => m.primitives ?? []);
  return { kind: drawn.length && drawn.every((p) => p.mode === 0) ? 'points' : 'mesh' };
}

async function finalizeGlb(assetId, relPath, res) {
  const reject = async (msg) => {
    await fs.rm(path.join(STAGING_DIR, assetId), { recursive: true, force: true });
    return res.status(400).json({ error: msg });
  };
  const full = stagingFile(assetId, relPath);
  const { size } = await fs.stat(full);
  if (!size) return reject(`${relPath} uploaded empty. Upload it again.`);
  // Header + JSON: the JSON chunk is the scene description, a few MB at most.
  const fh = await fs.open(full, 'r');
  let head;
  try {
    const want = Math.min(size, 16 * 1024 * 1024);
    head = Buffer.alloc(want);
    await fh.read(head, 0, want, 0);
  } finally {
    await fh.close();
  }
  const found = inspectGlb(head, relPath);
  if (found.error) return reject(found.error);

  await storage.put(assetId, relPath, createReadStream(full));
  // Meshopt data is laid out to compress well; the read route sends this
  // copy to any client that accepts gzip and didn't ask for a byte range.
  await storage.put(assetId, `${relPath}.gz`, createReadStream(full).pipe(zlib.createGzip({ level: 6 })));
  await fs.rm(path.join(STAGING_DIR, assetId), { recursive: true, force: true });
  return res.json({ assetId, bytes: size, fileCount: 1, meta: relPath, format: 'glb', kind: found.kind, splatCount: null, bbox: null });
}


assetsRouter.post('/:assetId/finalize', requireEditorSession, assetGuard, async (req, res, next) => {
  const { assetId } = req.params;
  try {
    if (req.query.kind === 'audio') return await finalizeAudio(assetId, res);
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

    // One .glb: a 3D model the studio converted (FBX/OBJ/PLY/glTF).
    if (relPaths.length === 1 && relPaths[0].toLowerCase().endsWith('.glb')) return await finalizeGlb(assetId, relPaths[0], res);
    // A model that skipped the studio's conversion: inside a zip, most likely.
    if (!relPaths.some((p) => p.toLowerCase().endsWith('.lcc2')) && relPaths.some((p) => MODEL_SOURCE.test(p))) {
      await fs.rm(path.join(STAGING_DIR, assetId), { recursive: true, force: true });
      return res.status(400).json({ error: "3D models are converted in the studio before upload. Pick the model's folder or its files, not a .zip." });
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
      return res.status(400).json({ error: 'No .lcc2 index, .obj or .ply found in the upload. Pick the whole Lixel Studio export, or an OBJ/PLY model.' });
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
    // a floor plan from the export's own collision mesh; never fails the upload
    const floorPlan = await buildFloorPlan(assetId, meta.name && meta.name !== 'XGrids Lcc2 Splats' ? meta.name : 'Floor plan').catch(() => null);
    res.json({
      floorPlan,
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
    res.setHeader('Vary', 'Accept-Encoding');

    // A whole-file read of a model: send the gzipped copy finalizeGlb made.
    // Byte ranges (the LCC SDK's tiles) always get the raw file.
    if (!range && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '') && relPath.toLowerCase().endsWith('.glb')) {
      const gz = await storage.stat(req.params.assetId, `${relPath}.gz`).catch(() => null);
      if (gz) {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Length', gz.bytes);
        return storage.get(req.params.assetId, `${relPath}.gz`).pipe(res);
      }
    }

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

/** (Re)build a space's floor plan, e.g. for a scan uploaded before plans existed. */
assetsRouter.post('/:assetId/floorplan', requireEditorSession, assetGuard, async (req, res, next) => {
  try {
    const plan = await buildFloorPlan(req.params.assetId, String(req.query.title || 'Floor plan').slice(0, 80));
    if (!plan) return res.status(422).json({ error: 'This space has no collision mesh to draw a plan from. Upload the full Lixel Studio export.' });
    await recordAsset(req, req.params.assetId, 'redrew the floor plan', `${plan.size[0]} × ${plan.size[1]} m`);
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

/* -------------------------------------------------------------------- */
/* Your own floor plan — an architect's drawing, a fire plan — beside     */
/* the one drawn from the scan. One per space; a new one replaces it.     */
/* PNG, JPEG or WebP by their first bytes. Not SVG: it can carry script   */
/* and is served from this origin. Not PDF: an <img> can't show it.       */
/* -------------------------------------------------------------------- */

const PLAN_MAX = 15 * 1024 * 1024;
const PLAN_KINDS = [
  ['png', (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a],
  ['jpg', (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['webp', (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP']
];
/** 'png' | 'jpg' | 'webp' from an image's first bytes, or undefined. */
export const imageKind = (buf) => PLAN_KINDS.find(([, is]) => is(buf))?.[0];

const clearUploadedPlan = (assetId) =>
  Promise.all(PLAN_KINDS.map(([ext]) => storage.remove(assetId, `floorplan/uploaded.${ext}`)));

assetsRouter.put(
  '/:assetId/floorplan/upload',
  requireEditorSession,
  assetGuard,
  express.raw({ type: () => true, limit: PLAN_MAX }),
  async (req, res, next) => {
    try {
      // ponytail: local driver — an S3 driver needs its own "does this asset exist"
      try { await fs.stat(path.join(storage.ASSET_DIR, req.params.assetId)); } catch {
        return res.status(404).json({ error: 'Asset not found.' });
      }
      const body = req.body;
      if (!Buffer.isBuffer(body) || !body.length) return res.status(400).json({ error: 'Choose an image of the floor plan to upload.' });
      const kind = imageKind(body);
      if (!kind) return res.status(415).json({ error: 'Use a PNG, JPEG or WebP image. For a PDF, export the page as a PNG first.' });
      await clearUploadedPlan(req.params.assetId);
      const rel = `floorplan/uploaded.${kind}`;
      await storage.put(req.params.assetId, rel, Readable.from([body]));
      await recordAsset(req, req.params.assetId, 'uploaded a floor plan');
      res.status(201).json({ path: rel, bytes: body.length });
    } catch (err) {
      next(err);
    }
  },
  // only reached when express.raw refuses the body
  (err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That image is over 15 MB. Export it smaller and try again.' });
    next(err);
  }
);

assetsRouter.delete('/:assetId/floorplan/upload', requireEditorSession, assetGuard, async (req, res, next) => {
  try {
    await clearUploadedPlan(req.params.assetId);
    await recordAsset(req, req.params.assetId, 'removed the uploaded floor plan');
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

assetsRouter.delete('/:assetId', requireEditorSession, assetGuard, async (req, res, next) => {
  try {
    await recordAsset(req, req.params.assetId, 'deleted a model', req.params.assetId);
    await storage.remove(req.params.assetId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
