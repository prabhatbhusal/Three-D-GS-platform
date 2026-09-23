'use client';

import { useEffect, useRef, useState } from 'react';
import { filesFromDataTransfer, filesFromFileList, uploadVariant } from '../lib/upload';
import { createProperty, getScenes, saveScene } from '../lib/api';
import { blankSceneDoc } from '../lib/sceneDoc';
import { hydrateScenes } from '../lib/scenes';
import { formatBytes, freeSceneId, slugify, ModelNote, PICK_ACCEPT, UpAxisSelect } from './Uploader';
import type { UpChoice } from '../lib/modelConvert';
import type { StagedFile, UploadProgress, UploadResult } from '../@types/upload.types';

const TITLE_MAX = 80;
type Source = 'lcc2' | 'model' | 'video360';

/** "Bar_Restro" (a folder), "Bar_Restro.zip", "…/Bar_Restro.lcc2" or "Lobby.fbx" -> "Bar Restro". */
function nameFromUpload(files: StagedFile[]): string {
  const first = files[0]?.relPath ?? '';
  const raw = files.length === 1 ? first.split('/').pop()!.replace(/\.[^.]+$/, '')
    : first.includes('/') ? first.split('/')[0]
      : (files.find((f) => /\.(lcc2|fbx|glb|gltf|obj|ply)$/i.test(f.relPath))?.relPath ?? '').replace(/\.(lcc2|fbx|glb|gltf|obj|ply)$/i, '');
  return raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const isVideo = (f: StagedFile) => /\.(insv|mp4|mov|mkv)$/i.test(f.relPath);

/**
 * New project, in one step: name the client, drop their Lixel Studio export,
 * and the project opens with that space already loaded — never an empty
 * viewer. The export goes through exactly the studio uploader's path
 * (chunked, resumable, validated server-side, §7.1) as the space's high
 * variant; medium/low can be added inside the project later.
 *
 * 360 camera video is shown as a source but isn't built: nothing here turns
 * video into a splat. It says so rather than accepting a file it can't use.
 */
export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [spaceName, setSpaceName] = useState('');
  const [source, setSource] = useState<Source>('lcc2');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [up, setUp] = useState<UpChoice>('auto');
  const [stage, setStage] = useState('');
  const folderRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const uploading = status === 'uploading';

  const close = () => {
    if (uploading && !window.confirm('The upload is still running. Close and lose it?')) return;
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // re-bound each render so `close` sees the current upload state

  const take = (files: StagedFile[]) => {
    if (!files.length || uploading) return;
    if (files.some(isVideo) && !files.some((f) => /\.(lcc2|zip|fbx|glb|gltf|obj|ply)$/i.test(f.relPath))) {
      setStatus('error');
      setUploadError('Turning 360 video into a space isn’t available yet. Process the capture in Lixel Studio and drop its export folder (or a .zip of it) here.');
      return;
    }
    const guess = nameFromUpload(files);
    if (guess && !spaceName.trim()) setSpaceName(guess);
    setStatus('uploading');
    setUploadError('');
    setResult(null);
    setProgress({ bytesSent: 0, bytesTotal: files.reduce((n, f) => n + f.file.size, 0) });
    uploadVariant(files, setProgress, { up, onStage: setStage })
      .then((r) => { setResult(r); setStatus('done'); })
      .catch((e: unknown) => { setStatus('error'); setUploadError(e instanceof Error ? e.message : 'The upload failed. Try again.'); })
      .finally(() => setStage(''));
  };

  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) take(filesFromFileList(e.target.files));
    e.target.value = '';
  };

  const canCreate = !!title.trim() && !uploading && !creating && (status !== 'done' || !!spaceName.trim());

  const create = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const p = await createProperty(title);
      if (!p) throw new Error('The server did not confirm the project. Try again.');
      if (result) {
        const name = spaceName.trim() || title.trim();
        const id = freeSceneId(`${p.id}-${slugify(name)}`);
        const high = { assetId: result.assetId, meta: result.meta, bytes: result.bytes };
        await saveScene(id, blankSceneDoc(id, name, { high }, p.id, result.format ?? 'lcc2'));
        hydrateScenes(await getScenes());
      }
      location.assign(`/studio/${p.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not create the project. Try again.');
      setCreating(false);
    }
  };

  const pct = progress?.bytesTotal ? Math.round((progress.bytesSent / progress.bytesTotal) * 100) : 0;

  return (
    <div className="np-scrim">
      <div className="np" role="dialog" aria-modal="true" aria-labelledby="np-title">
        <header className="np-head">
          <div>
            <h2 id="np-title">New project</h2>
            <p>Name the client, drop their capture, and the project opens with it loaded.</p>
          </div>
          <button className="np-x" onClick={close} aria-label="Close">✕</button>
        </header>

        <div className="np-body">
          {/* ---------------- input data ---------------- */}
          <section className="np-main">
            <h3>Input data</h3>
            <div className="np-sources" role="radiogroup" aria-label="What are you uploading?">
              <button
                role="radio" aria-checked={source === 'lcc2'} className={`np-source ${source === 'lcc2' ? 'on' : ''}`}
                onClick={() => setSource('lcc2')}
              >
                <span className="np-source-ic" aria-hidden>
                  <svg viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m3 13 9 5 9-5" /></svg>
                </span>
                <span className="np-source-txt">
                  <b>Lixel Studio export</b>
                  <span>LCC2 folder or .zip</span>
                </span>
              </button>
              <button
                role="radio" aria-checked={source === 'model'} className={`np-source ${source === 'model' ? 'on' : ''}`}
                onClick={() => setSource('model')}
              >
                <span className="np-source-ic" aria-hidden>
                  <svg viewBox="0 0 24 24"><path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" /><path d="m3 7 9 5 9-5M12 12v10" /></svg>
                </span>
                <span className="np-source-txt">
                  <b>3D model</b>
                  <span>FBX · OBJ · PLY · GLB</span>
                </span>
              </button>
              <button
                role="radio" aria-checked={source === 'video360'} className={`np-source ${source === 'video360' ? 'on' : ''}`}
                onClick={() => setSource('video360')}
              >
                <span className="np-source-ic" aria-hidden>
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" /></svg>
                </span>
                <span className="np-source-txt">
                  <b>360 camera video <em className="np-soon">Coming soon</em></b>
                  <span>INSV · MP4 · MOV</span>
                </span>
              </button>
            </div>

            {source === 'video360' ? (
              <div className="np-drop np-drop-off">
                <p className="np-drop-title">360 video isn&apos;t supported yet</p>
                <p className="np-drop-sub">
                  Nothing in the studio turns 360 footage into a space today. Process the capture in Lixel Studio,
                  then use <button className="np-link" onClick={() => setSource('lcc2')}>Lixel Studio export</button>.
                </p>
              </div>
            ) : (
              <div
                className={`np-drop ${dragOver ? 'is-over' : ''} ${status === 'done' ? 'is-done' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={async (e) => { e.preventDefault(); setDragOver(false); take(await filesFromDataTransfer(e.dataTransfer.items)); }}
              >
                {status === 'idle' && (
                  <>
                    <span className="np-drop-ic" aria-hidden>
                      <svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" /></svg>
                    </span>
                    {source === 'model' ? (
                      <>
                        <p className="np-drop-title">
                          Drop the model here or <button className="np-link" onClick={() => zipRef.current?.click()}>pick files</button>
                        </p>
                        <p className="np-drop-sub">
                          An .fbx, .obj (with its .mtl), .ply or .glb, with its textures. It is converted here, upright and compressed.{' '}
                          <button className="np-link" onClick={() => folderRef.current?.click()}>Pick its folder instead</button>
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="np-drop-title">
                          Drop the export folder here or <button className="np-link" onClick={() => folderRef.current?.click()}>browse</button>
                        </p>
                        <p className="np-drop-sub">
                          The whole folder Lixel Studio made: the .lcc2 index and its data tiles.{' '}
                          <button className="np-link" onClick={() => zipRef.current?.click()}>Pick a .zip instead</button>
                        </p>
                      </>
                    )}
                  </>
                )}
                {uploading && (
                  <div className="np-progress">
                    <p className="np-drop-title">{stage ? `Converting: ${stage}…` : `Uploading… ${pct}%`}</p>
                    <div className="np-bar"><div style={{ width: `${pct}%` }} /></div>
                    <p className="np-drop-sub">
                      {formatBytes(progress?.bytesSent ?? 0)} of {formatBytes(progress?.bytesTotal ?? 0)}. A dropped connection resumes where it stopped.
                    </p>
                  </div>
                )}
                {status === 'done' && result && (
                  <>
                    <span className="np-drop-ic is-ok" aria-hidden>✓</span>
                    <p className="np-drop-title">{result.format && result.format !== 'lcc2' ? 'Model uploaded' : 'Export uploaded'}</p>
                    <p className="np-drop-sub">
                      {result.splatCount !== null && <>{(result.splatCount / 1e6).toFixed(1)}M splats · </>}
                      {result.converted ? <><ModelNote result={result} />{' '}</> : <>{formatBytes(result.bytes)} · {result.fileCount} files ·{' '}</>}
                      <button className="np-link" onClick={() => folderRef.current?.click()}>Replace</button>
                    </p>
                  </>
                )}
                {status === 'error' && (
                  <>
                    <p className="np-drop-title">That didn&apos;t upload</p>
                    <p className="np-err">{uploadError}</p>
                    <p className="np-drop-sub">
                      <button className="np-link" onClick={() => folderRef.current?.click()}>Pick the folder again</button>
                      {' or '}<button className="np-link" onClick={() => zipRef.current?.click()}>a .zip</button>
                    </p>
                  </>
                )}
              </div>
            )}

            {source === 'model' && <UpAxisSelect value={up} onChange={setUp} />}

            <div className="np-chips" aria-hidden>
              {['LCC2', 'ZIP', 'FBX', 'OBJ', 'PLY', 'GLB'].map((c) => <span key={c} className="np-chip">{c}</span>)}
              {['INSV', 'MP4', 'MOV'].map((c) => <span key={c} className="np-chip is-off">{c}</span>)}
            </div>

            <input
              ref={folderRef} type="file" multiple hidden onChange={pick}
              // @ts-expect-error -- webkitdirectory has no React prop type, but the DOM attribute works
              webkitdirectory=""
            />
            <input ref={zipRef} type="file" accept={PICK_ACCEPT} multiple hidden onChange={pick} />
          </section>

          {/* ---------------- settings ---------------- */}
          <aside className="np-side">
            <h3>Project</h3>
            <label className="np-field">
              <span>Project name <b aria-hidden>*</b></span>
              <input
                value={title} maxLength={TITLE_MAX} autoFocus placeholder="Basera Boutique Hotel"
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canCreate) create(); }}
              />
              <small>{title.length}/{TITLE_MAX}</small>
            </label>
            <label className="np-field">
              <span>First space</span>
              <input value={spaceName} maxLength={TITLE_MAX} placeholder="Reception" onChange={(e) => setSpaceName(e.target.value)} />
              <small>Named from the export; change it if you like.</small>
            </label>

            {createError && <p className="np-err">{createError}</p>}

            <button className="np-create" disabled={!canCreate} onClick={create}>
              {creating ? 'Creating…' : status === 'done' ? 'Create project' : 'Create empty project'}
            </button>
            <p className="np-note">
              {uploading ? 'Waiting for the upload to finish.'
                : status === 'done' ? 'Opens straight into the editor with this space loaded.'
                  : 'You can also create it now and upload spaces inside it later.'}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
