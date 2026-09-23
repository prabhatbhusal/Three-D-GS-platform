/**
 * Client for the Node API in /server — the CLAUDE.md-planned Django + DRF
 * backend, not started yet, stood up here in Node instead. Every call is
 * best-effort from the app's point of view: the viewer must keep working off
 * the scenes baked into lib/scenes.js if the API is unreachable, because
 * "time to first frame under 5s" (CLAUDE.md) can't wait on a second server.
 */
import type { ApiScene, Property, SceneDoc } from '../@types/scene.types';
import type { AudioUploadResult, UploadResult } from '../@types/upload.types';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

/** fetch() throws a bare "Failed to fetch" for every network-level failure —
 *  server down, wrong port, CORS refusal — which tells a creator nothing.
 *  Name the address we actually tried so the next step is obvious. */
async function send(path: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error(
      `Can't reach the API at ${API_BASE}. Start it with "cd server && npm run dev", ` +
      'and open the studio on the same host it allows (CLIENT_ORIGIN in server/.env).'
    );
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  const res = await send(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? null : res.json();
}

/** [{ id, title, tagline, spawn, outdoor, unitScale, neighbours }] */
export const getScenes = () => request<ApiScene[]>('/api/scenes');

/** Full scene document for one scene id, in the CLAUDE.md schema shape. */
export const getScene = (id: string) => request<SceneDoc>(`/api/scenes/${id}`);

/** Editor-only — requires a signed-in session (see login()). */
export const saveScene = (id: string, doc: SceneDoc) =>
  request(`/api/scenes/${id}`, { method: 'PUT', body: JSON.stringify(doc) });

/* ---- properties (§5.1) — studio-only ---- */

export const getProperties = () => request<Property[]>('/api/properties');
/** Resolves null when the property doesn't exist. */
export const getProperty = (id: string) =>
  request<Property>(`/api/properties/${encodeURIComponent(id)}`).catch((err: Error) => {
    if (/does not exist/i.test(err.message)) return null;
    throw err;
  });
export const createProperty = (title: string) =>
  request<Property>('/api/properties', { method: 'POST', body: JSON.stringify({ title }) });
/** Title only; the id (and every URL and space pointing at it) stays. */
export const renameProperty = (id: string, title: string) =>
  request<Property>(`/api/properties/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title }) });
/** Its spaces are kept and become unfiled; published tours are untouched. */
export const deleteProperty = (id: string) =>
  request<{ id: string; released: number }>(`/api/properties/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** The project last opened in this browser, so the list can point back to it. */
export const LAST_PROJECT_KEY = 'threedview.lastProject';

/** `null` takes the space out of every property. */
export const moveSceneToProperty = (sceneId: string, propertyId: string | null) =>
  request(`/api/scenes/${sceneId}/property`, { method: 'POST', body: JSON.stringify({ propertyId }) });

/* ---- publishing (§7.5) ---- */

/** What visitors see. Resolves null when the space isn't published. */
export const getPublishedScene = (id: string) =>
  request<SceneDoc>(`/api/scenes/${id}/published`).catch((err: Error) => {
    if (/not published/i.test(err.message)) return null;
    throw err;
  });

export interface PublishState {
  status: 'draft' | 'published';
  publishedVersion: number | null;
  publishedAt: string | null;
  blockers: string[];
  warnings: string[];
}
export interface PublishResult {
  published: boolean;
  version?: number;
  publishedAt?: string;
  blockers?: string[];
  warnings: string[];
}
export interface GalleryItem {
  id: string;
  title: string;
  tagline: string | null;
  publishedAt: string;
  version: number;
  trackCount: number;
  thumb: string | null;
}

export const getPublishState = (id: string) => request<PublishState>(`/api/scenes/${id}/publish`);

/** Resolves with the blockers instead of throwing when publish is refused. */
export async function publishSceneNow(id: string): Promise<PublishResult> {
  const res = await send(`/api/scenes/${id}/publish`, { method: 'POST', credentials: 'include' });
  const body = await res.json().catch(() => ({}));
  if (res.ok || res.status === 422) return body as PublishResult;
  throw new Error(body.error || `${res.status} ${res.statusText}`);
}
export const unpublishScene = (id: string) => request(`/api/scenes/${id}/unpublish`, { method: 'POST' });
export const revertScene = (id: string) => request<SceneDoc>(`/api/scenes/${id}/revert`, { method: 'POST' });
export const getGallery = () => request<GalleryItem[]>('/api/gallery');
/** Draw (or redraw) a space's floor plan from its scan; stored with the asset. */
export const buildFloorPlan = (assetId: string, title: string) =>
  request<{ size: [number, number]; floorArea: number; walls: number }>(
    `/api/assets/${assetId}/floorplan?title=${encodeURIComponent(title)}`, { method: 'POST' });
/** For server components, which have no browser cookies or CORS to worry about. */
export const API_BASE_URL = API_BASE;

export interface SessionUser { id: string; name: string; email: string }
interface SessionReply { authenticated: boolean; user: SessionUser | null }

/** `email` omitted = the legacy shared editor password (server/.env
 *  EDITOR_PASSWORD), still used by the uploader's inline sign-in. */
export const login = (password: string, email?: string) =>
  request<SessionReply>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

/** Needs the team access code — see server/src/routes/auth.js for why. */
export const signup = (fields: { name: string; email: string; password: string; accessCode: string }) =>
  request<SessionReply>('/api/auth/signup', { method: 'POST', body: JSON.stringify(fields) });

export const logout = () => request('/api/auth/logout', { method: 'POST' });

export const getSession = () => request<SessionReply>('/api/auth/session');

/** A short-lived token an embedding client's own server can hand to the
 *  viewer (CLAUDE.md: "signed short-lived tokens for embeds"). Not yet
 *  required by the viewer itself — see server/src/routes/embed.js. */
export const requestEmbedToken = (sceneId: string) =>
  request('/api/embed/token', { method: 'POST', body: JSON.stringify({ sceneId }) });

/** Public — no session needed. `payload` must include `sceneId` and
 *  `formRenderedAt` (Date.now() when the form first appeared — the backend's
 *  bot-timing check needs it, see server/src/routes/leads.js). */
export const submitLead = (payload: Record<string, unknown>) =>
  request('/api/leads', { method: 'POST', body: JSON.stringify(payload) });

/* ------------------------------------------------------------------ */
/* Asset upload (CLAUDE.md §7.1, §9). Editor-only.                     */
/* ------------------------------------------------------------------ */

export const createAsset = () => request<{ assetId: string }>('/api/assets', { method: 'POST' });

/** Reports bytes already staged for `relPath` — 0 for a fresh file, more if
 *  resuming a dropped connection. Never throws on a not-yet-started file. */
export const initAssetFile = (assetId: string, relPath: string) =>
  request<{ relPath: string; bytesReceived: number }>(`/api/assets/${assetId}/files`, {
    method: 'POST',
    body: JSON.stringify({ relPath })
  });

/** A 409 here isn't a failure — it means the server's view of `relPath`
 *  is ahead of the caller's (a retried chunk that actually landed); the
 *  response still carries the real `bytesReceived` to resync to. */
export async function uploadAssetChunk(
  assetId: string,
  relPath: string,
  offset: number,
  chunk: Blob
): Promise<{ ok: boolean; bytesReceived: number }> {
  const res = await send(
    `/api/assets/${assetId}/files/chunk?relPath=${encodeURIComponent(relPath)}&offset=${offset}`,
    { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return { ok: res.ok, bytesReceived: body.bytesReceived };
}

export const finalizeAsset = (assetId: string) =>
  request<UploadResult>(`/api/assets/${assetId}/finalize`, { method: 'POST' });

/** One .m4a, at most 2 MB — the server checks it really is one (§6.3). */
export const finalizeAudio = (assetId: string) =>
  request<AudioUploadResult>(`/api/assets/${assetId}/finalize?kind=audio`, { method: 'POST' });

export const deleteAsset = (assetId: string) => request(`/api/assets/${assetId}`, { method: 'DELETE' });

export const assetUrl = (assetId: string, relPath: string) => `${API_BASE}/api/assets/${assetId}/${relPath}`;

/** A link that is safe to put in a visitor's page: http(s) only, never
 *  javascript: or data:. Anything else comes back null — don't render it. */
export function safeUrl(u: string | undefined | null): string | null {
  const s = (u ?? '').trim();
  return /^https?:\/\/\S+$/i.test(s) ? s : null;
}

/** Scene documents address uploads as `asset://<assetId>/<relPath>` (§9);
 *  this turns one into a URL the browser can fetch. Plain http(s) passes
 *  through (hand-typed image/video links); anything else is null. */
export function resolveAsset(ref: string | undefined | null): string | null {
  const m = /^asset:\/\/([A-Za-z0-9_-]+)\/(.+)$/.exec(ref ?? '');
  if (m) return assetUrl(m[1], m[2].split('/').map(encodeURIComponent).join('/'));
  return safeUrl(ref);
}
