'use client';

import dynamic from 'next/dynamic';
import { use, useEffect, useState } from 'react';
import { getProperty, getScenes, LAST_PROJECT_KEY } from '../../../../lib/api';
import { hydrateScenes, scopeToProperty } from '../../../../features/scene/scenes';
import { useStudioSession } from '../../../../features/auth/useStudioSession';
import { applyTheme } from '../../../../lib/uiConfig';
import type { Property } from '../../../../@types/scene.types';
import '../../../../features/studio/editor.css';

// Client-only: LCCRender is a module singleton that breaks under a server render pass.
const App = dynamic(() => import('../../../../features/scene/App'), { ssr: false });

type Gate =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'offline'; message: string }
  | { kind: 'ready'; property: Property };

/**
 * The editor, inside one client's project (a "property" in code, §0.2):
 * /studio/<project>/edit, or ?space=<id> to open on that space (the project
 * home's space cards). The space list is scoped BEFORE the 3D mounts, so the
 * renderer never starts streaming another client's model. A project with no
 * spaces yet goes back to its home, which offers the upload.
 */
export default function PropertyEditorPage({ params }: { params: Promise<{ property: string }> }) {
  const { property: id } = use(params);
  const ok = useStudioSession(`/studio/${id}/edit`);
  const [gate, setGate] = useState<Gate>({ kind: 'loading' });

  useEffect(() => {
    if (!ok) return;
    (async () => {
      const p = await getProperty(id);
      if (!p) return setGate({ kind: 'missing' });
      // The client's staff have no spaces to edit here: their page is the reservations.
      if (p.access === 'staff') { location.replace(`/studio/${encodeURIComponent(p.id)}/reservations`); return; }
      // So the project list can show which one you were working in.
      try { localStorage.setItem(LAST_PROJECT_KEY, p.id); } catch { /* private mode */ }
      applyTheme(p.theme, p.title, p.info?.whatsapp ?? null, p.features); // so Preview shows the project's own branding
      hydrateScenes(await getScenes());
      const space = new URLSearchParams(location.search).get('space');
      if (!scopeToProperty(p.id, space)) { location.replace(`/studio/${encodeURIComponent(p.id)}`); return; }
      setGate({ kind: 'ready', property: p });
    })().catch((e: unknown) =>
      setGate({ kind: 'offline', message: e instanceof Error ? e.message : 'The studio server isn’t answering.' }));
  }, [ok, id]);

  if (!ok || gate.kind === 'loading') return <div className="ed2-boot">Opening the studio…</div>;
  if (gate.kind === 'ready') return <App property={gate.property} />;

  return (
    <div className="ed2">
      <main className="pl">
        <section className="pl-body">
          <div className="pl-empty">
            <h1>{gate.kind === 'missing' ? 'That project doesn’t exist' : 'The studio server isn’t answering'}</h1>
            <p>{gate.kind === 'missing' ? 'It may have been deleted, or the link is wrong. Pick one from the list.' : gate.message}</p>
            {gate.kind === 'offline' && <button className="pl-btn pl-btn-main" onClick={() => location.reload()}>Try again</button>}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the studio’s 3D renderer is a page singleton: leave with a full page load */}
            <a className="pl-btn" href="/studio">All projects</a>
          </div>
        </section>
      </main>
    </div>
  );
}
