/**
 * Asset storage driver seam (CLAUDE.md §9). Routes and store.js never touch
 * the filesystem for assets directly, only this module. Two drivers:
 *
 *   local (default)  server/src/data/assets/ (or ASSET_DIR) on this PC
 *   s3               one cloud bucket every PC and the hosted API share
 *                    (storage-s3.js; ASSET_DRIVER=s3 in server/.env)
 *
 *   put(assetId, relPath, readStream) -> void
 *   get(assetId, relPath, { range })  -> readStream   // honours byte ranges
 *   stat(assetId, relPath)            -> { bytes, contentType }
 *   list(assetId, under?)             -> relPath[]     // every file of an asset
 *   exists(assetId)                   -> boolean
 *   readAll(assetId, relPath)         -> Buffer
 *   url(assetId, relPath)             -> string
 *   remove(assetId, relPath?)         -> void
 *
 * A missing file is an error with code 'ENOENT' from either driver.
 */
import { createReadStream, createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { DATA_DIR } from './dataDir.js';
import { createS3Driver } from './storage-s3.js';

// NAS masters/processing stay elsewhere; this is published derivatives only.
const ASSET_DIR = process.env.ASSET_DIR
  ? path.resolve(process.env.ASSET_DIR)
  : path.join(DATA_DIR, 'assets'); // sibling of data/scenes, data/leads

const CONTENT_TYPES = {
  '.lcc2': 'application/octet-stream',
  '.sog': 'application/octet-stream',
  '.ply': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.btree': 'application/octet-stream',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4'
};

export function contentTypeFor(relPath) {
  return CONTENT_TYPES[path.extname(relPath).toLowerCase()] ?? 'application/octet-stream';
}

const invalid = (what) => Object.assign(new Error(`Invalid asset ${what}.`), { status: 400 });

/** The asset id and a clean relative path ('/'-separated), or a 400. No
 *  traversal out of the asset's own folder, in either segment. */
function checked(assetId, relPath = '') {
  if (!/^[a-zA-Z0-9_-]+$/.test(assetId)) throw invalid('id');
  const rel = path.posix.normalize(String(relPath).replace(/\\/g, '/')).replace(/^\.\/?$/, '');
  if (rel.startsWith('../') || rel === '..' || rel.startsWith('/')) throw invalid('path');
  return rel;
}

/* ---------------------------------------------------------------- local */

function resolvePath(assetId, relPath = '') {
  const base = path.join(ASSET_DIR, assetId);
  const full = path.normalize(path.join(base, checked(assetId, relPath)));
  if (full !== base && !full.startsWith(base + path.sep)) throw invalid('path');
  return full;
}

const local = {
  name: 'local',
  async put(assetId, relPath, readStream) {
    const dest = resolvePath(assetId, relPath);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await pipeline(readStream, createWriteStream(dest));
  },
  async stat(assetId, relPath) {
    const s = await fs.stat(resolvePath(assetId, relPath));
    return { bytes: s.size };
  },
  get(assetId, relPath, { range } = {}) {
    const full = resolvePath(assetId, relPath);
    return range ? createReadStream(full, range) : createReadStream(full);
  },
  async list(assetId, under = '') {
    const base = resolvePath(assetId);
    const out = [];
    const walk = async (dir) => {
      let entries;
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else out.push(path.relative(base, full).split(path.sep).join('/'));
      }
    };
    await walk(resolvePath(assetId, under));
    return out;
  },
  async exists(assetId) {
    return fs.stat(resolvePath(assetId)).then(() => true, () => false);
  },
  async remove(assetId, relPath) {
    if (relPath) return fs.rm(resolvePath(assetId, relPath), { force: true });
    await fs.rm(resolvePath(assetId), { recursive: true, force: true });
  }
};

/* ------------------------------------------------------------- the seam */

const driver = process.env.ASSET_DRIVER === 's3' ? createS3Driver(process.env) : local;
export const DRIVER = driver.name;

// async throughout, so a refused path is a rejected promise like any other failure
export const put = async (assetId, relPath, readStream) =>
  driver.put(assetId, checked(assetId, relPath), readStream, contentTypeFor(relPath));

export async function stat(assetId, relPath) {
  const { bytes } = await driver.stat(assetId, checked(assetId, relPath));
  return { bytes, contentType: contentTypeFor(relPath) };
}

/** Range-capable read. `range` is `{ start, end }` (inclusive), both optional. */
export const get = (assetId, relPath, opts) => driver.get(assetId, checked(assetId, relPath), opts);

export const list = async (assetId, under = '') => driver.list(assetId, checked(assetId, under));
export const exists = async (assetId) => { checked(assetId); return driver.exists(assetId); };

/** A whole (smallish) file, e.g. a mesh for the floor plan. */
export async function readAll(assetId, relPath) {
  const chunks = [];
  for await (const c of get(assetId, relPath)) chunks.push(c);
  return Buffer.concat(chunks);
}

/** The path the assets route serves it at, with either driver: the API
 *  streams from the bucket, so the browser never needs the bucket's address. */
export function url(assetId, relPath) {
  return `/api/assets/${assetId}/${relPath}`;
}

/** The whole asset — or, given `relPath`, just that one file. Missing is not an error. */
export const remove = async (assetId, relPath) => driver.remove(assetId, relPath ? checked(assetId, relPath) : undefined);

export { ASSET_DIR };
