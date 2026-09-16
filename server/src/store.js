/**
 * File-backed scene store. CLAUDE.md's actual plan is Django + DRF + Postgres;
 * this Node service is the pre-database stand-in, so the storage layer is
 * isolated behind this one module — swapping in Postgres later means
 * rewriting this file, not the routes that call it.
 *
 * One JSON file per scene under data/scenes/<id>.json, each already shaped to
 * the CLAUDE.md scene schema (splat + spawn + camera + waypoints + hotspots +
 * tracks + theme + neighbours). Splat binaries themselves stay out of this
 * service entirely — they're served as static files (Next's /public today,
 * S3 + CDN later, per CLAUDE.md's storage plan).
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { migrateScene, CURRENT_VERSION } from './migrate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENES_DIR = path.join(__dirname, 'data', 'scenes');

function sceneFile(id) {
  // No path traversal via the id — it becomes a filename.
  if (!/^[a-z0-9-]+$/i.test(id)) throw Object.assign(new Error('invalid scene id'), { status: 400 });
  return path.join(SCENES_DIR, `${id}.json`);
}

export async function listScenes() {
  const files = await fs.readdir(SCENES_DIR);
  const scenes = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => migrateScene(JSON.parse(await fs.readFile(path.join(SCENES_DIR, f), 'utf8'))))
  );
  // Only what the menu / spawn logic needs — not the full hotspot/track payload.
  return scenes.map((s) => ({
    id: s.id,
    title: s.title,
    tagline: s.tagline,
    spawn: s.spawn,
    outdoor: s.outdoor ?? false,
    unitScale: s.unitScale,
    // High-variant asset id, so the client's metaPath() can resolve an
    // uploaded scene through /api/assets/ instead of the legacy
    // public/assets/rooms/ convention (CLAUDE.md §2, §9).
    assetId: s.splat?.variants?.high?.assetId,
    meta: s.splat?.variants?.high?.meta,
    neighbours: s.neighbours ?? []
  }));
}

/** Migrated on read (CLAUDE.md §5.3) — the file on disk is untouched until
 *  the next saveScene() call writes the migrated shape back. */
export async function getScene(id) {
  try {
    const raw = JSON.parse(await fs.readFile(sceneFile(id), 'utf8'));
    return migrateScene(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveScene(id, doc) {
  if (doc.id && doc.id !== id) throw Object.assign(new Error('id mismatch'), { status: 400 });
  const withId = { ...doc, id, version: doc.version ?? CURRENT_VERSION };
  await fs.writeFile(sceneFile(id), JSON.stringify(withId, null, 2));
  return withId;
}
