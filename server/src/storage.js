/**
 * Asset storage driver seam (CLAUDE.md §9). Local disk today; swap in an s3
 * driver behind this exact interface when hosting is bought — routes/assets.js
 * and store.js never touch the filesystem directly, only this module.
 *
 *   put(assetId, relPath, readStream) -> void
 *   get(assetId, relPath, { range })  -> readStream   // honours byte ranges
 *   stat(assetId, relPath)            -> { bytes, contentType }
 *   url(assetId, relPath)             -> string
 *   remove(assetId)                   -> void
 */
import { createReadStream, createWriteStream } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { DATA_DIR } from './dataDir.js';

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

function contentTypeFor(relPath) {
  return CONTENT_TYPES[path.extname(relPath).toLowerCase()] ?? 'application/octet-stream';
}

/** No path traversal out of the asset's own folder, in either segment. */
function resolvePath(assetId, relPath = '') {
  if (!/^[a-zA-Z0-9_-]+$/.test(assetId)) {
    throw Object.assign(new Error('Invalid asset id.'), { status: 400 });
  }
  const base = path.join(ASSET_DIR, assetId);
  const full = path.normalize(path.join(base, relPath));
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw Object.assign(new Error('Invalid asset path.'), { status: 400 });
  }
  return full;
}

export async function put(assetId, relPath, readStream) {
  const dest = resolvePath(assetId, relPath);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await pipeline(readStream, createWriteStream(dest));
}

export async function stat(assetId, relPath) {
  const s = await fs.stat(resolvePath(assetId, relPath));
  return { bytes: s.size, contentType: contentTypeFor(relPath) };
}

/** Range-capable read. `range` is `{ start, end }` (inclusive), both optional. */
export function get(assetId, relPath, { range } = {}) {
  const full = resolvePath(assetId, relPath);
  return range ? createReadStream(full, range) : createReadStream(full);
}

/** Local driver: a same-origin path the assets route serves. An s3 driver
 *  would return a signed/CDN URL instead — callers never see the difference. */
export function url(assetId, relPath) {
  return `/api/assets/${assetId}/${relPath}`;
}

/** The whole asset — or, given `relPath`, just that one file (an S3 driver:
 *  delete the prefix, or the one key). Missing is not an error. */
export async function remove(assetId, relPath) {
  if (relPath) return fs.rm(resolvePath(assetId, relPath), { force: true });
  await fs.rm(resolvePath(assetId), { recursive: true, force: true });
}

export { ASSET_DIR };
