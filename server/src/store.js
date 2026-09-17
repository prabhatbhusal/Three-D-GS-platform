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

function sceneFile(id, version) {
  // No path traversal via the id — it becomes a filename.
  if (!/^[a-z0-9-]+$/i.test(id)) throw Object.assign(new Error('invalid scene id'), { status: 400 });
  if (version !== undefined && !Number.isInteger(version)) throw Object.assign(new Error('invalid version'), { status: 400 });
  return path.join(SCENES_DIR, version === undefined ? `${id}.json` : `${id}@${version}.json`);
}

// Drafts only — `<id>@<n>.json` files are published snapshots (§7.5).
const isDraftFile = (f) => f.endsWith('.json') && !f.includes('@');

export async function listScenes() {
  const files = await fs.readdir(SCENES_DIR);
  const scenes = await Promise.all(
    files
      .filter(isDraftFile)
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

const PUBLISH_FIELDS = ['status', 'publishedVersion', 'publishedAt'];

async function readRaw(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveScene(id, doc) {
  if (doc.id && doc.id !== id) throw Object.assign(new Error('id mismatch'), { status: 400 });
  // Publish state is owned by the publish routes below, not by the editor: a
  // studio tab opened before a publish would otherwise save its stale
  // `status` back and silently unpublish the space.
  const existing = await readRaw(sceneFile(id));
  const withId = { ...doc, id, version: doc.version ?? CURRENT_VERSION };
  for (const k of PUBLISH_FIELDS) {
    if (existing && k in existing) withId[k] = existing[k];
    else if (k === 'status') withId.status = 'draft';
    else delete withId[k];
  }
  await fs.writeFile(sceneFile(id), JSON.stringify(withId, null, 2));
  return withId;
}

/* ------------------------------------------------------------------ */
/* Publishing (§7.5) — immutable snapshots, visitors read only these   */
/* ------------------------------------------------------------------ */

/** Reasons publish must refuse, and things worth a warning. */
export function publishChecks(doc) {
  const blockers = [];
  const warnings = [];
  const high = doc.splat?.variants?.high;
  if (!high?.assetId) blockers.push('This space has no model. Upload the high-quality export first.');
  else if (String(high.assetId).startsWith('local:')) {
    warnings.push('This model is served from the legacy public folder, not uploaded storage. It will not move to hosting with the rest.');
  }
  const p = doc.spawn?.position;
  if (!Array.isArray(p) || p.length !== 3) blockers.push('Set a start view before publishing.');
  else if (p[0] === 0 && p[1] === 1.7 && p[2] === 3) {
    warnings.push('The start view is still the default. Visitors may open facing a wall; set one in the Scene panel.');
  }
  const v = doc.splat?.variants ?? {};
  if (high?.assetId && (!v.medium || !v.low)) {
    warnings.push('No medium or low variant, so phones load the full model. It still works, just slower to first frame.');
  }
  if (!doc.tracks?.length) warnings.push('No camera tracks, so the tour bar will be empty.');
  return { blockers, warnings };
}

export async function publishScene(id) {
  const draft = await getScene(id);
  if (!draft) return null;
  const { blockers, warnings } = publishChecks(draft);
  if (blockers.length) return { published: false, blockers, warnings };

  const version = (draft.publishedVersion ?? 0) + 1;
  const publishedAt = new Date().toISOString();
  const snapshot = { ...draft, status: 'published', publishedVersion: version, publishedAt };
  // 'wx': a snapshot, once written, is never overwritten.
  await fs.writeFile(sceneFile(id, version), JSON.stringify(snapshot, null, 2), { flag: 'wx' });

  const raw = await readRaw(sceneFile(id));
  await fs.writeFile(sceneFile(id), JSON.stringify({ ...raw, status: 'published', publishedVersion: version, publishedAt }, null, 2));
  return { published: true, version, publishedAt, warnings };
}

export async function unpublishScene(id) {
  const raw = await readRaw(sceneFile(id));
  if (!raw) return null;
  // Snapshots stay on disk as history; the draft just stops pointing at one.
  const { publishedVersion, publishedAt, ...rest } = raw;
  await fs.writeFile(sceneFile(id), JSON.stringify({ ...rest, status: 'draft' }, null, 2));
  return { published: false, lastVersion: publishedVersion ?? null };
}

/** The live published document, or null if the space isn't published. */
export async function getPublishedScene(id) {
  const raw = await readRaw(sceneFile(id));
  if (!raw || raw.status !== 'published' || !raw.publishedVersion) return null;
  const snap = await readRaw(sceneFile(id, raw.publishedVersion));
  return snap ? migrateScene(snap) : null;
}

/** Throw away draft edits: the draft becomes the published snapshot again. */
export async function revertToPublished(id) {
  const snap = await getPublishedScene(id);
  if (!snap) return null;
  await fs.writeFile(sceneFile(id), JSON.stringify(snap, null, 2));
  return snap;
}

/** Everything the public gallery shows, newest first. */
export async function listPublished() {
  const files = (await fs.readdir(SCENES_DIR)).filter(isDraftFile);
  const out = [];
  for (const f of files) {
    const id = f.slice(0, -5);
    const snap = await getPublishedScene(id);
    if (!snap) continue;
    out.push({
      id,
      title: snap.title,
      tagline: snap.tagline ?? null,
      publishedAt: snap.publishedAt,
      version: snap.publishedVersion,
      trackCount: snap.tracks?.length ?? 0,
      thumb: snap.tracks?.find((t) => t.thumb)?.thumb ?? null
    });
  }
  return out.sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));
}
