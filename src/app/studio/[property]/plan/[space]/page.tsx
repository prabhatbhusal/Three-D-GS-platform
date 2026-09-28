'use client';

import { use, useEffect, useState } from 'react';
import { API_BASE_URL, assetUrl, getProperty, getScene } from '../../../../../lib/api';
import { loadPlan, type FloorPlan } from '../../../../../lib/floorMap';
import { useStudioSession } from '../../../../../lib/useStudioSession';
import type { Property } from '../../../../../@types/scene.types';
import '../../report/report.css';

type Sheet = { title: string; assetId: string; project: Property | null; plan: FloorPlan | null };

/**
 * A space's floor plan as a client deliverable: a title sheet with the
 * project's logo, the plan the studio was showing (?img=floorplan/…), and a
 * room schedule when the plan was drawn from the scan. "Save as PDF" is the
 * browser's print dialog, like the monthly report.
 */
export default function PlanSheetPage({ params }: { params: Promise<{ property: string; space: string }> }) {
  const { property, space } = use(params);
  const ok = useStudioSession(`/studio/${property}/plan/${space}`);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [error, setError] = useState('');
  const [img, setImg] = useState('');

  useEffect(() => {
    if (!ok) return;
    const want = new URLSearchParams(location.search).get('img') ?? 'floorplan/plan.svg';
    // only the space's own plan files
    setImg(/^floorplan\/[\w.-]+$/.test(want) && !want.includes('..') ? want : 'floorplan/plan.svg');
    (async () => {
      const doc = await getScene(space);
      if (!doc) throw new Error('That space doesn’t exist.');
      const assetId = doc.splat?.variants?.high?.assetId;
      if (!assetId || assetId.startsWith('local:')) throw new Error('This space has no uploaded scan, so no plan.');
      const [project, plan] = await Promise.all([
        doc.propertyId ? getProperty(doc.propertyId).catch(() => null) : null,
        loadPlan(assetId)
      ]);
      setSheet({ title: doc.title, assetId, project, plan });
    })().catch((e: unknown) => setError(e instanceof Error ? e.message : 'Couldn’t load the plan.'));
  }, [ok, space]);

  if (!ok) return <div className="rp-note">Opening the plan…</div>;
  if (error) return <div className="rp-note">{error}</div>;
  if (!sheet) return <div className="rp-note">Loading the plan…</div>;

  const theme = sheet.project?.theme ?? {};
  const drawn = img.endsWith('.svg');
  const rooms = drawn ? (sheet.plan?.rooms ?? []) : [];
  const total = rooms.reduce((a, r) => a + r.area, 0);
  const style = { '--rp-accent': theme.accent || '#1d1d1f' } as React.CSSProperties;
  const today = new Date().toLocaleDateString('en', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="rp" style={style}>
      <div className="rp-controls">
        <span />
        <button onClick={() => window.print()}>Save as PDF</button>
      </div>

      <article className="rp-page">
        <header className="rp-head">
          {/* eslint-disable-next-line @next/next/no-img-element -- a client's logo from the API, printed as-is */}
          {theme.logo && <img src={`${API_BASE_URL}/api/assets/${theme.logo}`} alt="" />}
          <div>
            <h1>{sheet.title}</h1>
            <p>{[theme.brand || sheet.project?.title, 'Floor plan', today].filter(Boolean).join(' · ')}</p>
          </div>
        </header>

        {/* eslint-disable-next-line @next/next/no-img-element -- the plan file itself, SVG or the studio's upload */}
        <img className="rp-plan" src={assetUrl(sheet.assetId, img)} alt={`Floor plan of ${sheet.title}`} />

        {rooms.length > 0 && (
          <section>
            <h2>Rooms</h2>
            <table className="rp-table">
              <thead><tr><th>Room</th><th>Size</th><th>Area</th></tr></thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.size[0].toFixed(1)} × {r.size[1].toFixed(1)} m</td>
                    <td>{r.area.toFixed(1)} m²</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><th>Total</th><th /><th>{total.toFixed(1)} m²</th></tr></tfoot>
            </table>
          </section>
        )}
        <p className="rp-muted">
          {drawn
            ? 'Drawn from the 3D scan. Sizes and areas are measured from the scan; check critical dimensions on site.'
            : 'Plan supplied for this space.'}
        </p>
      </article>
    </div>
  );
}
