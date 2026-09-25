/**
 * Who did what, per project (2026-09-25): one append-only JSON-lines file per
 * project under data/activity/ (gitignored: it carries names). Spaces in no
 * project log to _unfiled. Writing an entry never fails the action it
 * records — a full disk costs the log line, not the publish.
 */
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from './dataDir.js';
import { getScene, listScenes } from './store.js';

const DIR = path.join(DATA_DIR, 'activity');
const fileFor = (propertyId) =>
  path.join(DIR, `${typeof propertyId === 'string' && /^[a-z0-9-]+$/.test(propertyId) ? propertyId : '_unfiled'}.jsonl`);

/** `req.session` names who; the legacy shared-password session has no account. */
export async function record(req, propertyId, action, target, detail) {
  const s = req.session;
  const who = s?.sub ? { id: s.sub, name: s.name } : { id: null, name: 'Shared team password' };
  const entry = { at: new Date().toISOString(), who, action, target, ...(detail ? { detail } : {}) };
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.appendFile(fileFor(propertyId), `${JSON.stringify(entry)}\n`);
  } catch (err) {
    console.warn('[activity] not recorded:', err.message);
  }
}

/** An action on a space: logged to the project the space is in. */
export async function recordScene(req, sceneId, action, detail) {
  const doc = await getScene(sceneId).catch(() => null);
  await record(req, doc?.propertyId ?? null, action, doc?.title || sceneId, detail);
}

/** An action on an asset: logged to the project of each space using it. */
export async function recordAsset(req, assetId, action, detail) {
  const users = [];
  for (const { id } of await listScenes()) {
    const doc = await getScene(id).catch(() => null);
    if (doc && JSON.stringify(doc.splat ?? {}).includes(assetId)) users.push(doc);
  }
  if (!users.length) return record(req, null, action, assetId, detail);
  for (const d of users) await record(req, d.propertyId ?? null, action, d.title || d.id, detail);
}

/** Newest first. */
export async function recent(propertyId, limit = 200) {
  let text;
  try {
    text = await fs.readFile(fileFor(propertyId), 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const line of text.split('\n').reverse()) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* a torn last line */ }
    if (out.length >= limit) break;
  }
  return out;
}
