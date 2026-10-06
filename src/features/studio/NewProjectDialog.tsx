'use client';

import { useEffect, useRef, useState } from 'react';
import { filesFromDataTransfer, filesFromFileList, isVideo360File, uploadVariant, uploadVideo360 } from './upload';
import { createProperty, getScenes, saveScene, saveSiteDraft, setProjectFeatures, setProjectInfo, setProjectTheme, uploadProjectLogo } from '../../lib/api';
import { TEMPLATES, templateFor, type PlaceKind } from './siteTemplates';
import { BrandInfoFields, infoProblem } from './BrandInfoFields';
import { inkOn, paletteFromImage } from '../../lib/brandColor';
import type { BrandFont, ProjectInfo } from '../../@types/config.types';
import { blankSceneDoc } from '../scene/sceneDoc';
import { hydrateScenes } from '../scene/scenes';
import { formatBytes, freeSceneId, slugify, ModelNote, PICK_ACCEPT, UpAxisSelect } from './Uploader';
import type { UpChoice } from './modelConvert';
import type { StagedFile, UploadProgress, UploadResult } from '../../@types/upload.types';

const TITLE_MAX = 80;
const DEFAULT_ACCENT = '#b08d57';
const LOGO_MAX = 2 * 1024 * 1024;
const FONTS: [BrandFont, string, string][] = [
  ['serif', 'Serif', "Georgia, 'Times New Roman', serif"],
  ['sans', 'Modern sans', "system-ui, 'Segoe UI', Roboto, sans-serif"],
  ['classic', 'Classic', "'Palatino Linotype', 'Book Antiqua', Palatino, serif"]
];
type Source = 'lcc2' | 'model' | 'video360';

/** "Bar_Restro" (a folder), "Bar_Restro.zip", "…/Bar_Restro.lcc2" or "Lobby.fbx" -> "Bar Restro". */
function nameFromUpload(files: StagedFile[]): string {
  const first = files[0]?.relPath ?? '';
  const raw = files.length === 1 ? first.split('/').pop()!.replace(/\.[^.]+$/, '')
    : first.includes('/') ? first.split('/')[0]
      : (files.find((f) => /\.(lcc2|fbx|glb|gltf|obj|ply)$/i.test(f.relPath))?.relPath ?? '').replace(/\.(lcc2|fbx|glb|gltf|obj|ply)$/i, '');
  return raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const isVideo = (f: StagedFile) => isVideo360File(f.relPath);

/**
 * New project, in one step: name the client, drop their Lixel Studio export,
 * and the project opens with that space already loaded — never an empty
 * viewer. The export goes through exactly the studio uploader's path
 * (chunked, resumable, validated server-side, §7.1) as the space's high
 * variant; medium/low can be added inside the project later.
 *
 * A 360 camera video (equirectangular MP4/MOV/WebM) is a space too: visitors
 * look round it (panoModel.ts). Raw INSV is refused with what to do instead.
 */
export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [spaceName, setSpaceName] = useState('');
  const [kind, setKind] = useState<PlaceKind>('other');
  const starter = templateFor(kind);
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
  // The brand, set up with the project (saved once it exists; Branding changes it later).
  const [brand, setBrand] = useState('');
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [accentSet, setAccentSet] = useState(false);
  // The logo's own colours, and whether the brand colour was picked by hand (then a new logo won't change it).
  const [logoColours, setLogoColours] = useState<string[]>([]);
  const [logoNote, setLogoNote] = useState('');
  const [byHand, setByHand] = useState(false);
  const [font, setFont] = useState<BrandFont>('serif');
  const [logo, setLogo] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState('');
  const [info, setInfo] = useState<ProjectInfo>({});
  const [createdId, setCreatedId] = useState('');
  const logoRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (logoUrl) URL.revokeObjectURL(logoUrl); }, [logoUrl]);
  const pickLogo = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return setCreateError('Use a PNG, JPEG or WebP image for the logo.');
    if (f.size > LOGO_MAX) return setCreateError('That logo is over 2 MB. Export it smaller.');
    setCreateError('');
    setLogo(f);
    setLogoUrl(URL.createObjectURL(f));
    paletteFromImage(f).then((p) => {
      setLogoColours(p.colours);
      setLogoNote(p.accent ? (byHand ? '' : 'Brand colour taken from your logo. Pick another any time.') : 'Your logo is black and white: pick a brand colour.');
      if (p.accent && !byHand) { setAccent(p.accent); setAccentSet(true); }
    }).catch(() => { setLogoColours([]); setLogoNote(''); });
  };
  const chooseColour = (c: string) => { setAccent(c); setAccentSet(true); setByHand(true); setLogoNote(''); };
  const folderRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
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
    const guess = nameFromUpload(files);
    if (source === 'video360' || (files.some(isVideo) && !files.some((f) => /\.(lcc2|zip|fbx|glb|gltf|obj|ply)$/i.test(f.relPath)))) {
      const videos = files.filter(isVideo);
      if (videos.length !== 1 || files.length !== 1) {
        setStatus('error');
        setUploadError('Drop one 360 video: an equirectangular MP4, MOV or WebM.');
        return;
      }
      setSource('video360');
      if (guess && !spaceName.trim()) setSpaceName(guess);
      setStatus('uploading');
      setUploadError('');
      setResult(null);
      setProgress({ bytesSent: 0, bytesTotal: videos[0].file.size });
      uploadVideo360(videos[0].file, setProgress)
        .then((r) => { setResult(r); setStatus('done'); })
        .catch((e: unknown) => { setStatus('error'); setUploadError(e instanceof Error ? e.message : 'The upload failed. Try again.'); });
      return;
    }
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

  const canCreate = !!createdId || (!!title.trim() && !uploading && !creating && (status !== 'done' || !!spaceName.trim()));

  const create = async () => {
    if (createdId) { location.assign(`/studio/${createdId}`); return; }
    const problem = infoProblem(info);
    if (problem) { setCreateError(problem); return; }
    setCreating(true);
    setCreateError('');
    try {
      const p = await createProperty(title);
      if (!p) throw new Error('The server did not confirm the project. Try again.');
      // Its brand. The project exists now either way: if this fails, say so and let them open it.
      try {
        const name = brand.trim();
        await setProjectTheme(p.id, { ...(name ? { brand: name } : {}), ...(accentSet ? { accent } : {}), font });
        if (logo) await uploadProjectLogo(p.id, logo);
        const filled = Object.fromEntries(Object.entries(info).filter(([, v]) => v?.trim())) as ProjectInfo;
        if (Object.keys(filled).length) await setProjectInfo(p.id, filled);
      } catch (e) {
        setCreatedId(p.id);
        setCreating(false);
        setCreateError(`The project was made, but its brand didn’t save (${e instanceof Error ? e.message : 'unknown error'}). Open it and set it in ⋯ → Branding.`);
        return;
      }
      if (starter.site) await saveSiteDraft(p.id, starter.site).catch(() => { /* a blank website: nothing lost */ });
      if (starter.features) await setProjectFeatures(p.id, starter.features).catch(() => { /* all on: switch off from its home */ });
      if (result) {
        const name = spaceName.trim() || title.trim();
        const id = freeSceneId(`${p.id}-${slugify(name)}`);
        const high = { assetId: result.assetId, meta: result.meta, bytes: result.bytes };
        await saveScene(id, blankSceneDoc(id, name, { high }, p.id, result.format ?? 'lcc2'));
        hydrateScenes(await getScenes());
      }
      location.assign(result ? `/studio/${p.id}/edit` : `/studio/${p.id}`); // its first space to work on, else its home
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
                  <b>360 camera video</b>
                  <span>MP4 · MOV · WebM, 360°</span>
                </span>
              </button>
            </div>

            {(
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
                    {source === 'video360' ? (
                      <>
                        <p className="np-drop-title">
                          Drop the 360 video here or <button className="np-link" onClick={() => videoRef.current?.click()}>pick it</button>
                        </p>
                        <p className="np-drop-sub">
                          One equirectangular video (twice as wide as it is tall), as your camera&apos;s app exports it.
                          Visitors look round it from where it was filmed. From an Insta360, export a 360 MP4 first: raw INSV isn&apos;t one picture yet.
                        </p>
                      </>
                    ) : source === 'model' ? (
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
                    <p className="np-drop-title">{result.format === 'video360' ? '360 video uploaded' : result.format && result.format !== 'lcc2' ? 'Model uploaded' : 'Export uploaded'}</p>
                    <p className="np-drop-sub">
                      {result.splatCount !== null && <>{(result.splatCount / 1e6).toFixed(1)}M splats · </>}
                      {result.converted ? <><ModelNote result={result} />{' '}</> : <>{formatBytes(result.bytes)} · {result.fileCount} {result.fileCount === 1 ? 'file' : 'files'} ·{' '}</>}
                      <button className="np-link" onClick={() => (source === 'video360' ? videoRef : folderRef).current?.click()}>Replace</button>
                    </p>
                  </>
                )}
                {status === 'error' && (
                  <>
                    <p className="np-drop-title">That didn&apos;t upload</p>
                    <p className="np-err">{uploadError}</p>
                    <p className="np-drop-sub">
                      {source === 'video360'
                        ? <button className="np-link" onClick={() => videoRef.current?.click()}>Pick another video</button>
                        : <>
                          <button className="np-link" onClick={() => folderRef.current?.click()}>Pick the folder again</button>
                          {' or '}<button className="np-link" onClick={() => zipRef.current?.click()}>a .zip</button>
                        </>}
                    </p>
                  </>
                )}
              </div>
            )}

            {source === 'model' && <UpAxisSelect value={up} onChange={setUp} />}

            <div className="np-chips" aria-hidden>
              {['LCC2', 'ZIP', 'FBX', 'OBJ', 'PLY', 'GLB'].map((c) => <span key={c} className="np-chip">{c}</span>)}
              {['MP4', 'MOV', 'WEBM'].map((c) => <span key={c} className="np-chip">{c}</span>)}
              <span className="np-chip is-off" title="Export raw INSV from Insta360 Studio as a 360 MP4 first">INSV</span>
            </div>

            <input
              ref={folderRef} type="file" multiple hidden onChange={pick}
              // @ts-expect-error -- webkitdirectory has no React prop type, but the DOM attribute works
              webkitdirectory=""
            />
            <input ref={zipRef} type="file" accept={PICK_ACCEPT} multiple hidden onChange={pick} />
            <input ref={videoRef} type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm,.insv" hidden onChange={pick} />
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
            <div className="np-field">
              <span>Kind of place</span>
              <div className="np-kinds" role="radiogroup" aria-label="Kind of place">
                {TEMPLATES.map((t) => (
                  <button key={t.kind} type="button" role="radio" aria-checked={kind === t.kind}
                    className={`np-kind${kind === t.kind ? ' is-on' : ''}`} onClick={() => setKind(t.kind)}>{t.label}</button>
                ))}
              </div>
              <small className="np-kind-note">{starter.gives}</small>
            </div>
            <label className="np-field">
              <span>First space</span>
              <input value={spaceName} maxLength={TITLE_MAX} placeholder={starter.firstSpace} onChange={(e) => setSpaceName(e.target.value)} />
              <small>Named from the export; change it if you like.</small>
            </label>

            <h3>Brand</h3>
            <div className="np-brand-preview" style={{ '--acc': accent, '--acc-ink': inkOn(accent), '--face': FONTS.find(([f]) => f === font)![2] } as React.CSSProperties}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen file */}
              {logoUrl ? <img src={logoUrl} alt="" /> : <span className="np-brand-mark">{(brand || title || 'B').trim()[0]}</span>}
              <span className="np-brand-name">{brand || title || 'Your brand'}</span>
              <span className="np-brand-pill">Start virtual tour</span>
            </div>
            <div className="np-brand-row">
              <button type="button" className="np-link-btn" onClick={() => logoRef.current?.click()}>{logo ? 'Change logo…' : 'Upload logo…'}</button>
              {logo && <button type="button" className="np-link-btn" onClick={() => { setLogo(null); setLogoUrl(''); setLogoColours([]); setLogoNote(''); }}>Remove</button>}
            </div>
            <input ref={logoRef} type="file" hidden accept="image/png,image/jpeg,image/webp"
              onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ''; }} />
            <label className="np-field">
              <span>Brand name</span>
              <input value={brand} maxLength={80} placeholder={title || 'Shown on tours and the website'} onChange={(e) => setBrand(e.target.value)} />
            </label>
            <div className="np-brand-row">
              <label className="np-field np-field-colour">
                <span>Brand colour</span>
                <span className="np-colour">
                  <input type="color" value={accent} onChange={(e) => chooseColour(e.target.value)} aria-label="Brand colour" />
                  <code>{accent}</code>
                </span>
              </label>
              <label className="np-field">
                <span>Heading font</span>
                <select className="np-select" value={font} onChange={(e) => setFont(e.target.value as BrandFont)}>
                  {FONTS.map(([f, label]) => <option key={f} value={f}>{label}</option>)}
                </select>
              </label>
            </div>
            {logoColours.length > 0 && (
              <div className="np-swatches" role="group" aria-label="Colours in your logo">
                <small>From your logo</small>
                {logoColours.map((c) => (
                  <button key={c} type="button" className={`np-swatch${c === accent ? ' is-on' : ''}`} style={{ background: c }}
                    aria-label={`Use ${c}`} aria-pressed={c === accent} title={c} onClick={() => chooseColour(c)} />
                ))}
              </div>
            )}
            {logoNote && <small className="np-note">{logoNote}</small>}
            <details className="np-more">
              <summary>Brand information <small>optional</small></summary>
              <p className="np-note">Shown on the project’s website: how guests reach you, and a word about you.</p>
              <BrandInfoFields value={info} onChange={setInfo} />
            </details>

            {createError && <p className="np-err">{createError}</p>}

            <button className="np-create" disabled={!canCreate} onClick={create}>
              {createdId ? 'Open the project' : creating ? 'Creating…' : status === 'done' ? 'Create project' : 'Create empty project'}
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
