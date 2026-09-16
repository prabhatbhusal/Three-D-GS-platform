'use client';

import { useEffect, useRef, useState } from 'react';
import { SCENES } from '../lib/scenes';
import { useUiConfig } from '../lib/uiConfig';
import { useNavMode, setWalkEnabled } from '../lib/navMode';
import { TouchControls } from './TouchControls';
import { HotspotMarkers, HotspotPanel } from './HotspotMarkers';
import { EnquiryPanel } from './EnquiryPanel';
import type { ViewerState } from '../@types/app.types';
import './viewer.css';

interface ViewerProps {
  state: ViewerState | null;
  isTouch: boolean;
  autoStart?: boolean;
  tour?: boolean;
}

/**
 * The visitor experience. Deliberately thin: a scene switch, a viewpoint dock,
 * mobile sticks, a persistent CTA, and nothing else on screen. Reused
 * verbatim as the studio's Preview (with `autoStart` + `tour`).
 */
export function Viewer({ state, isTouch, autoStart = false, tour = false }: ViewerProps) {
  const ui = useUiConfig();
  const [enteredByUser, setEnteredByUser] = useState(false);
  const [openHs, setOpenHs] = useState<string | null>(null);
  const nav = useNavMode();
  const walking = nav.walkEnabled;
  const entered = autoStart || enteredByUser;

  const ready = !!state?.ready;
  const live = entered && ready;
  const controllable = live && !state?.flying;

  return (
    <div className="vw" data-touch={isTouch ? '' : undefined}>
      {state?.loading && <LoadingGate progress={state.progress} />}

      {!entered && <EnterGate brand={ui.brand} ready={ready} progress={state?.progress ?? 0} onEnter={() => setEnteredByUser(true)} />}

      {live && (
        <>
          {ui.showBrand && <div className="vw-brand">{ui.brand}</div>}
          <SceneSwitch state={state} />
          {!tour && (
            <button
              className={`vw-walk ${walking ? 'on' : ''}`}
              onClick={() => setWalkEnabled(!walking)}
              title={walking ? 'Back to viewpoints' : 'Walk this space freely'}
            >
              <span className="vw-walk-ic">{walking ? '🧭' : '🚶'}</span>
              <span className="vw-walk-nm">{walking ? 'Viewpoints' : 'Walk this space'}</span>
            </button>
          )}
          {tour
            ? <TourBar state={state} />
            : <ViewpointDock state={state} showLabels={ui.showLabels} />}
          {controllable && (
            <HotspotMarkers mode="view" onOpen={(id) => setOpenHs(id)} />
          )}
          {openHs && (
            <HotspotPanel
              sceneId={state.activeId}
              id={openHs}
              onClose={() => setOpenHs(null)}
              onPortal={(sid) => { setOpenHs(null); state.select(sid); }}
            />
          )}
          {!isTouch && controllable && <div className="vw-cross" />}
          {!isTouch && controllable && <FirstRunHint key={walking ? 'w' : 'v'} walking={walking} />}
          {isTouch && walking && <TouchControls visible={controllable} />}
        </>
      )}

      {/* CLAUDE.md §3 constraint 5: the CTA is never blocked by the 3D — it
       *  mounts whether or not the renderer ever reaches `ready` (WebGL2
       *  missing, a slow load, a failed one). It only needs a scene id, which
       *  App.jsx sets from lib/scenes.js before the SDK even starts loading. */}
      {state?.activeId && (
        <EnquiryPanel sceneId={state.activeId} sceneName={state.activeName} />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function LoadingGate({ progress }: { progress?: number }) {
  return (
    <div className="vw-load">
      <div className="vw-load-ring" style={{ '--p': `${Math.round((progress ?? 0) * 100)}` } as React.CSSProperties} />
    </div>
  );
}

interface EnterGateProps { brand: string; ready: boolean; progress: number; onEnter: () => void; }

function EnterGate({ brand, ready, progress, onEnter }: EnterGateProps) {
  const pct = Math.round((progress ?? 0) * 100);
  return (
    <div className="vw-enter">
      <div className="vw-enter-spot" />
      <div className="vw-enter-in">
        <p className="vw-enter-kicker">Virtual tour</p>
        <h1 className="vw-enter-mark">{brand}</h1>
        <button className="vw-enter-btn" onClick={onEnter} disabled={!ready}>
          <span>{ready ? 'Enter the space' : 'Preparing the space'}</span>
          {!ready && (
            <span className="vw-enter-prog" aria-hidden>
              <span style={{ '--p': pct } as React.CSSProperties} />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function SceneSwitch({ state }: { state: ViewerState }) {
  if (SCENES.length < 2) return null;
  return (
    <div className="vw-scenes">
      {SCENES.map((s) => (
        <button
          key={s.id}
          className={s.id === state.activeId ? 'on' : ''}
          disabled={state.loading}
          onClick={() => state.select(s.id)}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

function ViewpointDock({ state, showLabels }: { state: ViewerState; showLabels: boolean }) {
  const vps = state.viewpoints || [];
  const [active, setActive] = useState<string | null>(null);

  if (state.flying) {
    return (
      <div className="vw-dock">
        <button className="vw-stop" onClick={state.stopFly}>
          <span className="vw-stop-ic" /> Stop tour
        </button>
      </div>
    );
  }
  if (!vps.length) return null;

  return (
    <div className="vw-dock">
      <div className="vw-strip">
        {vps.map((vp) => (
          <button
            key={vp.id}
            className={`vw-card ${vp.id === active ? 'on' : ''}`}
            onClick={() => { setActive(vp.id); state.playViewport(vp); }}
            title={vp.label}
          >
            {vp.thumb
              ? <img className="vw-card-img" src={vp.thumb} alt="" />
              : <span className="vw-card-ph" data-l={(vp.label || '?').trim()[0]} />}
            <span className="vw-card-play">▶</span>
            {showLabels && <span className="vw-card-nm">{vp.label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function TourBar({ state }: { state: ViewerState }) {
  const vps = state.viewpoints || [];
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);

  const play = (from?: number) => {
    if (!vps.length) return;
    const start = from == null ? (idx < 0 ? 0 : idx) : from;
    setPlaying(true);
    const ordered = [...vps.slice(start), ...vps.slice(0, start)];
    state.editor.playSequence(ordered, { onIndex: (k) => setIdx((start + k) % vps.length) });
  };
  const stop = () => { state.editor.stopSequence(); setPlaying(false); };

  return (
    <div className="vw-dock">
      <div className="vw-tour">
        <button onClick={() => play(Math.max(0, idx - 1))} aria-label="previous">⏮</button>
        <button className="vw-tour-play" onClick={() => (playing ? stop() : play())}>
          {playing ? '⏸' : '▶'}
        </button>
        <button onClick={() => play((idx + 1) % Math.max(1, vps.length))} aria-label="next">⏭</button>
        <div className="vw-tour-seg">
          {vps.map((v, i) => (
            <span key={v.id} className={i === idx ? 'on' : ''} onClick={() => { setIdx(i); play(i); }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FirstRunHint({ walking }: { walking: boolean }) {
  const [gone, setGone] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    t.current = setTimeout(() => setGone(true), 4200);
    return () => clearTimeout(t.current);
  }, []);
  if (gone) return null;
  return (
    <div className="vw-hint">
      <span className="vw-hint-k">Click</span> to look around
      <span className="vw-hint-sep" />
      {walking
        ? <><span className="vw-hint-k">W A S D</span> to walk</>
        : <><span className="vw-hint-k">Walk this space</span> to move freely</>}
    </div>
  );
}
