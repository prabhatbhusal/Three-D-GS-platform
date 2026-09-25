'use client';

import dynamic from 'next/dynamic';
import { use, useEffect, useState } from 'react';
import { getProperty, getScenes, LAST_PROJECT_KEY } from '../../../lib/api';
import { hydrateScenes, scopeToProperty } from '../../../lib/scenes';
import { useStudioSession } from '../../../lib/useStudioSession';
import { applyTheme } from '../../../lib/uiConfig';
import { Uploader } from '../../../components/Uploader';
import type { Property } from '../../../@types/scene.types';
import '../../../components/editor.css';

// Client-only: LCCRender is a module singleton that breaks under a server render pass.
const App = dynamic(() => import('../../../components/App'), { ssr: false });

type Gate =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'offline'; message: string }
  | { kind: 'empty'; property: Property }
  | { kind: 'ready'; property: Property };

/**
 * The editor, inside one client's project (a "property" in code, §0.2). The
 * space list is scoped BEFORE the 3D mounts, so the renderer never starts
 * streaming another client's model. A project with no spaces yet goes
 * straight to the uploader.
 */
export default function PropertyStudioPage({ params }: { params: Promise<{ property: string }> }) {
  const { property: id } = use(params);
  const ok = useStudioSession(`/studio/${id}`);
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!ok) return;
    (async () => {
      const p = await getProperty(id);
      if (!p) return setGate({ kind: 'missing' });
      // So the project list can show which one you were working in.
      try { localStorage.setItem(LAST_PROJECT_KEY, p.id); } catch { /* private mode */ }
      applyTheme(p.theme, p.title); // so Preview shows the project's own branding
      hydrateScenes(await getScenes());
      setGate(scopeToProperty(p.id) ? { kind: 'ready', property: p } : { kind: 'empty', property: p });
    })().catch((e: unknown) =>
      setGate({ kind: 'offline', message: e instanceof Error ? e.message : 'The studio server isn’t answering.' }));
  }, [ok, id]);

  if (!ok || gate.kind === 'loading') return <div className="ed2-boot">Opening the studio…</div>;
  if (gate.kind === 'ready') return <App property={gate.property} />;

  return (
    <div className="ed2">
      <main className="pl">
        <header className="pl-top">
          <nav className="ed2-crumb" aria-label="Breadcrumb">
            <a href="/studio">Projects</a>
            {gate.kind === 'empty' && <><span aria-hidden>/</span><span className="ed2-crumb-here">{gate.property.title}</span></>}
          </nav>
        </header>
        <section className="pl-body">
          {gate.kind === 'missing' && (
            <div className="pl-empty">
              <h1>That project doesn&apos;t exist</h1>
              <p>It may have been deleted, or the link is wrong. Pick one from the list.</p>
              <a className="pl-btn" href="/studio">All projects</a>
            </div>
          )}
          {gate.kind === 'offline' && (
            <div className="pl-empty">
              <h1>The studio server isn&apos;t answering</h1>
              <p>{gate.message}</p>
              <button className="pl-btn" onClick={() => location.reload()}>Try again</button>
            </div>
          )}
          {gate.kind === 'empty' && (
            <div className="pl-empty">
              <h1>{gate.property.title} has no spaces yet</h1>
              <p>Upload its first Lixel Studio export to start. Everything you add here stays with this client.</p>
              <button className="pl-btn pl-btn-main" onClick={() => setUploading(true)}>＋ Upload the first space</button>
            </div>
          )}
        </section>
      </main>
      {gate.kind === 'empty' && uploading && (
        <Uploader
          propertyId={gate.property.id}
          onClose={() => setUploading(false)}
          onCreated={() => {
            // Uploader already re-hydrated the list with the new space in it.
            if (scopeToProperty(gate.property.id)) setGate({ kind: 'ready', property: gate.property });
          }}
        />
      )}
    </div>
  );
}
