'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { filesFromDataTransfer, filesFromFileList, uploadVariant } from '../lib/upload';
import { saveScene, getScenes, getSession, login } from '../lib/api';
import { blankSceneDoc } from '../lib/sceneDoc';
import { hydrateScenes, SCENE_BY_ID } from '../lib/scenes';
import type { StagedFile, UploadProgress, UploadResult, VariantTier } from '../@types/upload.types';
import type { SplatVariant } from '../@types/scene.types';
import './uploader.css';

interface SlotState {
  status: 'idle' | 'uploading' | 'done' | 'error';
  fileCount?: number;
  progress?: UploadProgress;
  result?: UploadResult;
  error?: string;
}

const IDLE: SlotState = { status: 'idle' };

const VARIANT_COPY: Record<VariantTier, { label: string; hint: string }> = {
  high: { label: 'High', hint: 'Full-fidelity export — required.' },
  medium: { label: 'Medium', hint: 'Optional — falls back to High if missing.' },
  low: { label: 'Low', hint: 'Optional — falls back to Medium, then High.' }
};

export function slugify(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `space-${Date.now().toString(36)}`;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Saving is an upsert by id, so a second "Reception" would silently replace
 *  the first. Add -2, -3… until the id is free. */
export function freeSceneId(base: string): string {
  let id = base;
  for (let n = 2; SCENE_BY_ID[id]; n++) id = `${base}-${n}`;
  return id;
}

interface UploaderProps {
  /** The property the new space is filed under (§5.1); its id prefixes the
   *  space's id, as in the schema's own "basera-lobby" example. */
  propertyId?: string | null;
  onClose: () => void;
  onCreated: (sceneId: string) => void;
}

export function Uploader({ propertyId = null, onClose, onCreated }: UploaderProps) {
  const [title, setTitle] = useState('');
  const [slots, setSlots] = useState<Record<VariantTier, SlotState>>({ high: IDLE, medium: IDLE, low: IDLE });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  // Uploads are session-only (server/src/routes/assets.js). Check before the
  // creator picks a 130 MB folder, not after — a 401 at that point wastes the
  // whole transfer.
  const [session, setSession] = useState<'checking' | 'in' | 'out'>('checking');
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    getSession()
      .then((s) => setSession(s?.authenticated ? 'in' : 'out'))
      .catch((err: unknown) => {
        setSession('out');
        setSessionError(err instanceof Error ? err.message : 'Could not reach the API.');
      });
  }, []);

  const setSlot = useCallback((tier: VariantTier, patch: Partial<SlotState>) => {
    setSlots((prev) => ({ ...prev, [tier]: { ...prev[tier], ...patch } }));
  }, []);

  const runUpload = useCallback((tier: VariantTier, files: StagedFile[]) => {
    if (!files.length) return;
    const bytesTotal = files.reduce((sum, f) => sum + f.file.size, 0);
    setSlot(tier, { status: 'uploading', fileCount: files.length, progress: { bytesSent: 0, bytesTotal }, error: undefined, result: undefined });
    uploadVariant(files, (p) => setSlot(tier, { progress: p }))
      .then((result) => setSlot(tier, { status: 'done', result }))
      .catch((err: unknown) => setSlot(tier, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed.' }));
  }, [setSlot]);

  const canCreate = title.trim().length > 0 && slots.high.status === 'done' && !creating;

  const createSpace = async () => {
    if (!slots.high.result) return;
    setCreating(true);
    setCreateError('');
    try {
      const id = freeSceneId(propertyId ? `${propertyId}-${slugify(title)}` : slugify(title));
      const variants: { high: SplatVariant; medium?: SplatVariant; low?: SplatVariant } = {
        high: { assetId: slots.high.result.assetId, meta: slots.high.result.meta }
      };
      if (slots.medium.result) variants.medium = { assetId: slots.medium.result.assetId, meta: slots.medium.result.meta };
      if (slots.low.result) variants.low = { assetId: slots.low.result.assetId, meta: slots.low.result.meta };

      await saveScene(id, blankSceneDoc(id, title.trim(), variants, propertyId));
      hydrateScenes(await getScenes()); // pulls the new scene (+ its assetId) into the runtime list
      onCreated(id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create the space — try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="up-scrim" onClick={onClose}>
      <div className="up-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="New space">
        <header className="up-head">
          <h2>New space</h2>
          <button className="up-x" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <p className="up-sub">
          Upload a Lixel Studio export — the whole folder, or a .zip of it. It holds the .lcc2 index
          (named after the capture, e.g. Library.lcc2) next to its data/ tiles. Pick the folder, not the .lcc2 on its own.
        </p>

        <label className="up-field">
          <span>Space title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reception" autoFocus />
        </label>

        {session === 'checking' && <p className="up-slot-hint">Checking your editor session…</p>}

        {session === 'out' && (
          <SignIn error={sessionError} onSignedIn={() => { setSession('in'); setSessionError(''); }} />
        )}

        {session === 'in' && (
          <>
            <div className="up-slots">
              {(['high', 'medium', 'low'] as const).map((tier) => (
                <VariantSlot key={tier} tier={tier} state={slots[tier]} onFiles={(files) => runUpload(tier, files)} />
              ))}
            </div>

            {createError && <p className="up-error">{createError}</p>}

            <button className="up-create" disabled={!canCreate} onClick={createSpace}>
              {creating ? 'Creating…' : 'Create space'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- */

/** There is no sign-*up*: one shared editor password stands in until real
 *  accounts exist (server/src/middleware/auth.js). This is the whole login
 *  surface the studio has. */
function SignIn({ error, onSignedIn }: { error: string; onSignedIn: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFailed('');
    try {
      await login(password);
      onSignedIn();
    } catch (err) {
      setFailed(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="up-signin" onSubmit={submit}>
      <p className="up-slot-hint">
        Uploading needs an editor session. One shared password, set as
        <code> EDITOR_PASSWORD</code> in <code>server/.env</code>.
      </p>
      <div className="up-signin-row">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Editor password"
          autoComplete="current-password"
        />
        <button type="submit" disabled={busy || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </div>
      {(failed || error) && <p className="up-error">{failed || error}</p>}
    </form>
  );
}

/* -------------------------------------------------------------------- */

function VariantSlot({ tier, state, onFiles }: { tier: VariantTier; state: SlotState; onFiles: (files: StagedFile[]) => void }) {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const copy = VARIANT_COPY[tier];

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (state.status === 'uploading') return;
    onFiles(await filesFromDataTransfer(e.dataTransfer.items));
  };

  const onBrowsePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) onFiles(filesFromFileList(e.target.files));
    e.target.value = '';
  };

  const pct = state.progress?.bytesTotal ? Math.round((state.progress.bytesSent / state.progress.bytesTotal) * 100) : 0;

  return (
    <div
      className={`up-slot up-slot-${state.status} ${dragOver ? 'up-slot-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="up-slot-top">
        <span className="up-slot-label">{copy.label}</span>
        {state.status === 'done' && <span className="up-slot-ok">✓ done</span>}
      </div>

      {state.status === 'idle' && (
        <>
          <p className="up-slot-hint">{copy.hint}</p>
          <div className="up-browse-row">
            <button type="button" className="up-browse" onClick={() => folderInputRef.current?.click()}>
              Drop folder here or browse
            </button>
            <button type="button" className="up-browse-zip" onClick={() => zipInputRef.current?.click()}>
              or pick a .zip file
            </button>
          </div>
        </>
      )}

      {state.status === 'uploading' && (
        <div className="up-progress">
          <div className="up-progress-track"><div className="up-progress-bar" style={{ width: `${pct}%` }} /></div>
          <p className="up-progress-txt">
            {formatBytes(state.progress?.bytesSent ?? 0)} / {formatBytes(state.progress?.bytesTotal ?? 0)}
            {' · '}{state.fileCount} file{state.fileCount === 1 ? '' : 's'}
          </p>
        </div>
      )}

      {state.status === 'done' && state.result && (
        <p className="up-slot-hint">
          {state.result.splatCount !== null && (
            <>{(state.result.splatCount / 1e6).toFixed(1)}M splats<br /></>
          )}
          {formatBytes(state.result.bytes)} · {state.result.fileCount} file{state.result.fileCount === 1 ? '' : 's'}
          {' — '}<button type="button" className="up-relink" onClick={() => folderInputRef.current?.click()}>replace</button>
        </p>
      )}

      {state.status === 'error' && (
        <>
          <p className="up-slot-error">{state.error}</p>
          <div className="up-browse-row">
            <button type="button" className="up-browse" onClick={() => folderInputRef.current?.click()}>Try folder again</button>
            <button type="button" className="up-browse-zip" onClick={() => zipInputRef.current?.click()}>or a .zip</button>
          </div>
        </>
      )}

      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error -- webkitdirectory has no React prop type, but the DOM attribute works
        webkitdirectory=""
        multiple
        hidden
        onChange={onBrowsePick}
      />
      {/* .lcc2 is accepted here only so it's visible in the dialog — picking one
          alone is a dead end, and validateExport says so in plain words rather
          than leaving the creator staring at a folder-only picker. */}
      <input ref={zipInputRef} type="file" accept=".zip,application/zip,.lcc2" multiple hidden onChange={onBrowsePick} />
    </div>
  );
}
