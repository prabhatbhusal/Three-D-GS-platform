'use client';

/* The tour's live floor map: rooms, walls and doors from the scan's own
 * plan, a "you are here" dot with a view cone, and rooms you tap to go to.
 * Shown only for spaces with two or more rooms: a single room doesn't need
 * a map. The dot moves by writing attributes each frame, not React state. */

import { useEffect, useRef, useState } from 'react';
import { goToPlan, loadPlan, mapPose, toPlan, type FloorPlan } from '../lib/floorMap';

const TINTS = ['#2A3350', '#24403F', '#3F2E4E', '#343A48', '#23405A', '#46402C'];

export function FloorMap({ assetId, startOpen }: { assetId: string | undefined; startOpen: boolean }) {
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [open, setOpen] = useState(startOpen);
  const [here, setHere] = useState<string | null>(null);
  const dot = useRef<SVGGElement | null>(null);

  useEffect(() => {
    let live = true;
    setPlan(null);
    loadPlan(assetId).then((p) => { if (live) setPlan(p && p.rooms.length >= 2 ? p : null); });
    return () => { live = false; };
  }, [assetId]);

  useEffect(() => {
    if (!plan || !open) return;
    let raf = 0;
    let lastRoom: string | null = null;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const g = dot.current;
      if (!g || !mapPose.ok) return;
      const [u, v] = toPlan(plan, mapPose.x, mapPose.y);
      const [fu, fv] = toPlan(plan, mapPose.fx, mapPose.fy);
      const deg = (Math.atan2(-fv, fu) * 180) / Math.PI; // SVG y runs down
      g.setAttribute('transform', `translate(${u.toFixed(2)} ${(-v).toFixed(2)}) rotate(${deg.toFixed(1)})`);
      const room = plan.rooms.find((r) => r.rects.some((b) => u >= b[0] && u <= b[2] && v >= b[1] && v <= b[3]))?.id ?? null;
      if (room !== lastRoom) { lastRoom = room; setHere(room); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [plan, open]);

  if (!plan) return null;
  const [x0, y0, x1, y1] = plan.box;
  const pad = 0.6;
  const view = `${x0 - pad} ${-y1 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`;
  const rect = (b: number[]) => `M${b[0]} ${-b[3]}H${b[2]}V${-b[1]}H${b[0]}Z`;

  return (
    <div className={`vw-map${open ? ' is-open' : ''}`}>
      <button type="button" className="vw-map-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? 'Hide map' : 'Map'}
      </button>
      {open && (
        <svg viewBox={view} role="img" aria-label="Floor map. Tap a room to go there.">
          {plan.rooms.map((r, i) => (
            <path key={r.id} d={r.rects.map(rect).join('')} fill={TINTS[i % TINTS.length]}
              className={`vw-map-room${here === r.id ? ' is-here' : ''}`} onClick={() => goToPlan(plan, r.at[0], r.at[1])}>
              <title>{`${r.name}, ${r.area} m². Go there`}</title>
            </path>
          ))}
          <path d={plan.walls.map((w) => `M${w[0]} ${-w[1]}L${w[2]} ${-w[3]}`).join('')} stroke="#F6F1E7" strokeWidth={0.14} strokeLinecap="square" pointerEvents="none" />
          {plan.rooms.filter((r) => r.area >= 4).map((r) => (
            <text key={r.id} x={r.at[0]} y={-r.at[1]} className="vw-map-label">{r.name}</text>
          ))}
          <g ref={dot} pointerEvents="none">
            <path d="M0 0L2.2 -1.1A2.4 2.4 0 0 1 2.2 1.1Z" fill="rgba(255,255,255,0.28)" />
            <circle r="0.32" fill="#fff" stroke="#3364FF" strokeWidth="0.14" />
          </g>
        </svg>
      )}
    </div>
  );
}
