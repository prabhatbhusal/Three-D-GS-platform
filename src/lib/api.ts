/**
 * Client for the Node API in /server — the CLAUDE.md-planned Django + DRF
 * backend, not started yet, stood up here in Node instead. Every call is
 * best-effort from the app's point of view: the viewer must keep working off
 * the scenes baked into lib/scenes.js if the API is unreachable, because
 * "time to first frame under 5s" (CLAUDE.md) can't wait on a second server.
 */
import type { ApiScene, SceneDoc } from '../@types/scene.types';
import type { UploadResult } from '../@types/upload.types';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

/** fetch() throws a bare "Failed to fetch" for every network-level failure —
 *  server down, wrong port, CORS refusal — which tells a creator nothing.
 *  Name the address we actually tried so the next step is obvious. */
async function send(path: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error(
      `Can't reach the API at ${API_BASE}. Start it with "cd server && npm start", ` +
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

/** One shared editor password (server/.env EDITOR_PASSWORD) until real
 *  accounts exist — there is nothing to sign *up* for. */
export const login = (password: string) =>
  request<{ authenticated: boolean }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ password }) });

export const logout = () => request('/api/auth/logout', { method: 'POST' });

export const getSession = () => request<{ authenticated: boolean }>('/api/auth/session');

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

export const deleteAsset = (assetId: string) => request(`/api/assets/${assetId}`, { method: 'DELETE' });

export const assetUrl = (assetId: string, relPath: string) => `${API_BASE}/api/assets/${assetId}/${relPath}`;
