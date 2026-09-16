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
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// NAS masters/processing stay elsewhere; this is published derivatives only.
const ASSET_DIR = process.env.ASSET_DIR
  ? path.resolve(process.env.ASSET_DIR)
  : path.join(__dirname, 'data', 'assets'); // sibling of data/scenes, data/leads

const CONTENT_TYPES = {
  '.lcc2': 'application/octet-stream',
  '.sog': 'application/octet-stream',
  '.ply': 'application/octet-stream',
  '.btree': 'application/octet-stream',
  '.json': 'application/json',
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

export async function remove(assetId) {
  const base = resolvePath(assetId);
  await fs.rm(base, { recursive: true, force: true });
}

export { ASSET_DIR };
