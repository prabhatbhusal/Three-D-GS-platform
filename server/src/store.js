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
import { migrateScene, CURRENT_VERSION } from './migrate.js';
import { DATA_DIR } from './dataDir.js';

const SCENES_DIR = path.join(DATA_DIR, 'scenes');
const PROPERTIES_DIR = path.join(DATA_DIR, 'properties');

const badRequest = (msg) => Object.assign(new Error(msg), { status: 400 });

/** A fresh DATA_DIR has no scenes/ yet: read it as empty, create it on write. */
async function sceneFiles() {
  try {
    return await fs.readdir(SCENES_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function sceneFile(id, version) {
  // No path traversal via the id — it becomes a filename.
  if (!/^[a-z0-9-]+$/i.test(id)) throw Object.assign(new Error('invalid scene id'), { status: 400 });
  if (version !== undefined && !Number.isInteger(version)) throw Object.assign(new Error('invalid version'), { status: 400 });
  return path.join(SCENES_DIR, version === undefined ? `${id}.json` : `${id}@${version}.json`);
}

// Drafts only — `<id>@<n>.json` files are published snapshots (§7.5).
const isDraftFile = (f) => f.endsWith('.json') && !f.includes('@');

export async function listScenes() {
  const files = await sceneFiles();
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
    // Which loader the client uses: the LCC SDK, or meshModel.ts for obj/ply.
    format: s.splat?.format ?? 'lcc2',
    neighbours: s.neighbours ?? [],
    propertyId: s.propertyId ?? null
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
  await fs.mkdir(SCENES_DIR, { recursive: true });
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
  const streams = (doc.splat?.format ?? 'lcc2') === 'lcc2';
  if (streams && high?.assetId && (!v.medium || !v.low)) {
    warnings.push('No medium or low variant, so phones load the full model. It still works, just slower to first frame.');
  }
  // An OBJ/PLY doesn't stream: the whole file is the bytes to first frame,
  // and constraint 2 budgets that at 35 MB even on the high tier.
  if (!streams && Number(high?.bytes) > 35e6) {
    warnings.push(
      `This ${doc.splat.format.toUpperCase()} model is ${(high.bytes / 1e6).toFixed(0)} MB and loads whole before the first frame, ` +
      'so phones wait a long time or run out of memory. For a large space, upload the Lixel Studio LCC export instead: it streams.'
    );
  }
  if (!doc.tracks?.length) warnings.push('No camera tracks, so the tour bar will be empty.');

  // §6.3: spoken content needs a text equivalent for the visitor who never unmutes.
  for (const h of doc.hotspots ?? []) {
    if (h.payload?.audio && !String(h.payload.transcript ?? '').trim()) {
      warnings.push(`Hotspot "${h.label}" has audio but no transcript. Muted visitors will miss what it says.`);
    }
  }

  if (doc.booking?.enabled && !isWebUrl(doc.booking.url)) {
    blockers.push('Book now is switched on but its link is not a web address. Add the booking page URL or switch Book now off.');
  }
  return { blockers, warnings };
}

/** Only http(s) links reach a visitor's page — never javascript: or data:. */
export const isWebUrl = (u) => typeof u === 'string' && /^https?:\/\/\S+$/i.test(u.trim());

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

/**
 * Move a space into a property (or out of all of them, with null). Patches
 * the draft on disk directly so nothing else in it changes — publish state
 * included. The published snapshot keeps whatever it had until the next publish.
 */
export async function setSceneProperty(id, propertyId) {
  const raw = await readRaw(sceneFile(id));
  if (!raw) return null;
  if (propertyId !== null && !(await getProperty(propertyId))) throw badRequest('That project does not exist.');
  const next = { ...raw, propertyId };
  await fs.writeFile(sceneFile(id), JSON.stringify(next, null, 2));
  return { id, propertyId };
}

/* ------------------------------------------------------------------ */
/* Properties (§5.1) — one per client: a hotel, a college, a campus.   */
/* The studio groups spaces by them. Membership lives on the scene     */
/* (`propertyId`), not in a list here, so there is one source of truth. */
/* ------------------------------------------------------------------ */

function propertyFile(id) {
  if (!/^[a-z0-9-]+$/.test(id)) throw badRequest('invalid property id');
  return path.join(PROPERTIES_DIR, `${id}.json`);
}

/** "Basera Boutique Hotel" -> "basera-boutique-hotel". */
export function propertyIdFor(title) {
  return String(title).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

export async function listProperties() {
  let files;
  try {
    files = await fs.readdir(PROPERTIES_DIR);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const list = await Promise.all(
    files.filter((f) => f.endsWith('.json')).map(async (f) => JSON.parse(await fs.readFile(path.join(PROPERTIES_DIR, f), 'utf8')))
  );
  return list.sort((a, b) => a.title.localeCompare(b.title));
}

export async function getProperty(id) {
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/.test(id)) return null;
  return readRaw(propertyFile(id));
}

/** Trimmed, non-empty, at most 80 characters — or a 400. */
function cleanTitle(title) {
  const clean = typeof title === 'string' ? title.trim() : '';
  if (!clean) throw badRequest('Give the project a name.');
  if (clean.length > 80) throw badRequest('Keep the name under 80 characters.');
  return clean;
}

/** Throws 400 on a bad title, 409 if a property with the same id exists. */
export async function createProperty(title) {
  const clean = cleanTitle(title);
  const id = propertyIdFor(clean);
  if (!id) throw badRequest('Use at least one letter or number in the name.');
  const doc = { id, version: 1, title: clean, createdAt: new Date().toISOString() };
  await fs.mkdir(PROPERTIES_DIR, { recursive: true });
  try {
    // 'wx': never overwrite a property that already has this id.
    await fs.writeFile(propertyFile(id), JSON.stringify(doc, null, 2), { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw Object.assign(new Error(`There is already a project called "${clean}".`), { status: 409 });
    }
    throw err;
  }
  return doc;
}

/**
 * Rename keeps the id: it is what every space's `propertyId` and every studio
 * URL point at, so only the title a person reads changes (same rule as
 * renameScene on the client).
 */
export async function renameProperty(id, title) {
  const p = await getProperty(id);
  if (!p) return null;
  const next = { ...p, title: cleanTitle(title) };
  await fs.writeFile(propertyFile(id), JSON.stringify(next, null, 2));
  return next;
}

/**
 * Deleting a property never deletes a space: its spaces go back to "not in a
 * property yet" (propertyId null) and published tours keep working, since a
 * tour doesn't read the property. Returns how many spaces were released.
 */
export async function deleteProperty(id) {
  const p = await getProperty(id);
  if (!p) return null;
  let released = 0;
  for (const f of (await sceneFiles()).filter(isDraftFile)) {
    const raw = await readRaw(path.join(SCENES_DIR, f));
    if (raw?.propertyId !== id) continue;
    await fs.writeFile(path.join(SCENES_DIR, f), JSON.stringify({ ...raw, propertyId: null }, null, 2));
    released += 1;
  }
  await fs.rm(propertyFile(id), { force: true });
  return { id, released };
}

/** Everything the public gallery shows, newest first. */
export async function listPublished() {
  const files = (await sceneFiles()).filter(isDraftFile);
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
