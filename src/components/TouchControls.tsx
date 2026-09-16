'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { touch } from '../lib/mobileInput';
import { walkerCfg } from '../lib/walkerConfig';

/**
 * Mobile controls. A floating thumb-stick in the bottom-left zone (it springs up
 * wherever your thumb lands) plus Jump / Run. Look is the walker's own canvas
 * drag listener — these overlays sit on top of the canvas so touches that start
 * here never become a look-drag.
 *
 * All state goes through the plain `touch` module (no React re-renders at
 * 60fps); only the knob position is component state, for the visual.
 */
const RADIUS = 46; // px of thumb travel

interface Knob { ox: number; oy: number; kx: number; ky: number; }

export function TouchControls({ visible }: { visible: boolean }) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const idRef = useRef<number | null>(null);
  const [knob, setKnob] = useState<Knob | null>(null);
  const [run, setRun] = useState(false);

  useEffect(() => { touch.run = run; }, [run]);
  useEffect(() => () => { touch.move.x = 0; touch.move.y = 0; touch.run = false; }, []);

  const apply = useCallback((dx: number, dy: number) => {
    const len = Math.hypot(dx, dy) || 1;
    const cl = len > RADIUS ? RADIUS / len : 1;
    const kx = dx * cl, ky = dy * cl;
    setKnob((k) => (k ? { ...k, kx, ky } : k));
    touch.move.x = kx / RADIUS;
    touch.move.y = -ky / RADIUS; // screen-down is +y; forward is -y
  }, []);

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (idRef.current != null) return;
    idRef.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    originRef.current = { x: e.clientX, y: e.clientY };
    setKnob({ ox: e.clientX, oy: e.clientY, kx: 0, ky: 0 });
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== idRef.current || !originRef.current) return;
    apply(e.clientX - originRef.current.x, e.clientY - originRef.current.y);
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== idRef.current) return;
    idRef.current = null;
    setKnob(null);
    touch.move.x = 0;
    touch.move.y = 0;
  };

  if (!visible) return null;
  const orbit = walkerCfg.mode === 'orbit';

  return (
    <div className="tc">
      <div
        ref={zoneRef}
        className="tc-zone"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {knob && (
          <>
            <span className="tc-base" style={{ left: knob.ox, top: knob.oy }} />
            <span className="tc-knob" style={{ left: knob.ox + knob.kx, top: knob.oy + knob.ky }} />
          </>
        )}
        {!knob && <span className="tc-hintdot">move</span>}
      </div>

      <div className="tc-btns">
        <button
          className={`tc-b ${run ? 'on' : ''}`}
          onPointerDown={(e) => { e.preventDefault(); setRun((v) => !v); }}
        >
          {orbit ? 'Dolly' : 'Run'}
        </button>
        <button
          className="tc-b tc-b-jump"
          onPointerDown={(e) => { e.preventDefault(); touch.jump = true; }}
        >
          {orbit ? '＋' : 'Jump'}
        </button>
      </div>
    </div>
  );
}
