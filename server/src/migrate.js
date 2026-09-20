/**
 * Scene schema migrations (CLAUDE.md §5.3). Run ON READ, not as a one-off
 * script — a scene authored last month must open today without anyone
 * remembering to run anything. store.js calls this on every getScene(); the
 * migrated doc is only written back on the next save, never on read alone.
 */

const CURRENT_VERSION = 2;

function normalizeTrackTimes(track, fallbackSeconds = 4) {
  const keyframes = Array.isArray(track?.keyframes) ? track.keyframes : [];
  if (!keyframes.length) return { ...track, seconds: Number.isFinite(track?.seconds) ? track.seconds : fallbackSeconds, keyframes: [] };

  const totalSeconds = Number.isFinite(track?.seconds) && track.seconds > 0 ? track.seconds : fallbackSeconds;
  const normalized = keyframes
    .map((kf, index) => {
      const rawT = Number(kf?.t);
      const safeT = Number.isFinite(rawT) ? rawT : index;
      return { ...kf, t: safeT };
    })
    .sort((a, b) => Number(a.t) - Number(b.t));

  const lastTime = Number(normalized[normalized.length - 1]?.t ?? totalSeconds);
  const duration = lastTime > 0 ? lastTime : totalSeconds;
  const finalSeconds = Number.isFinite(track?.seconds) && track.seconds > 0 ? track.seconds : duration;

  return {
    ...track,
    seconds: finalSeconds,
    keyframes: normalized
      .map((kf, index) => {
        const maxKey = Math.max(1, normalized.length - 1);
        const t = Number(kf.t);
        const scaled = maxKey === 1 ? (index / maxKey) * finalSeconds : (t / duration) * finalSeconds;
        return { ...kf, t: Number.isFinite(scaled) ? Number(scaled.toFixed(3)) : index * (finalSeconds / maxKey) };
      })
      .sort((a, b) => Number(a.t) - Number(b.t))
  };
}

/** v1 -> v2, per the CLAUDE.md §5.3 table. */
function v1ToV2(doc) {
  const next = { ...doc, version: 2 };

  // splat: { meta, format } -> splat.variants.high, asset-id addressed.
  // There's no real asset store yet (server/src/storage.js is [build], not
  // built) — "local:<id>" is the bridge: it still resolves through the old
  // public/assets/rooms/<id>/ convention on the client, but every scene doc
  // now speaks the v2 shape a future storage driver can read directly.
  if (doc.splat && !doc.splat.variants) {
    next.splat = {
      format: doc.splat.format ?? 'lcc2',
      variants: {
        high: { assetId: `local:${doc.id}`, meta: doc.splat.meta ?? 'meta.lcc2' }
      }
    };
  }

  // waypoints[] -> viewpoints[] (CLAUDE.md §0.2 terminology).
  if (doc.waypoints && !doc.viewpoints) {
    next.viewpoints = doc.waypoints;
    delete next.waypoints;
  } else if (!doc.viewpoints) {
    next.viewpoints = [];
  }

  // camera.mode: 'waypoint' -> 'viewpoint'; 'avatar' -> 'walk' (logged once —
  // this is a real behaviour change for anything that reads it, even though
  // nothing in the renderer consumes camera.mode yet).
  if (doc.camera?.mode === 'waypoint') {
    next.camera = { ...doc.camera, mode: 'viewpoint' };
  } else if (doc.camera?.mode === 'avatar') {
    next.camera = { ...doc.camera, mode: 'walk' };
    console.warn(`[migrate] scene "${doc.id}": camera.mode "avatar" -> "walk" (avatar mode is removed)`);
  }

  if (!doc.transform) {
    next.transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1 };
  }
  if (!Array.isArray(doc.tracks)) {
    next.tracks = [];
  } else {
    next.tracks = doc.tracks.map((t) => normalizeTrackTimes({ cues: [], audio: null, ...t }, 4));
  }
  if (doc.audio === undefined) next.audio = null;
  if (doc.cta === undefined) next.cta = null;
  if (doc.theme === undefined) next.theme = null;
  if (doc.propertyId === undefined) next.propertyId = null;

  return next;
}

const STEPS = { 1: v1ToV2 };

/** Migrates `doc` up to CURRENT_VERSION, applying each step in order. A doc
 *  already current passes through untouched (same reference, so store.js can
 *  cheaply tell whether a write-back is actually needed). */
export function migrateScene(doc) {
  let current = doc;
  let version = doc.version ?? 1;
  while (version < CURRENT_VERSION) {
    const step = STEPS[version];
    if (!step) {
      throw new Error(`[migrate] no migration from schema version ${version} (scene "${doc.id}")`);
    }
    current = step(current);
    version = current.version;
  }
  return current;
}

export { CURRENT_VERSION };
