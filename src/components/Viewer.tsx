'use client';

import { useEffect, useRef, useState } from 'react';
import { visibleScenes } from '../lib/scenes';
import { useUiConfig, setUiConfig } from '../lib/uiConfig';
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
  const [panel, setPanel] = useState<Panel>('views');
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
          <TopChrome state={state} walking={walking} showBrand={ui.showBrand} brand={ui.brand}
            hd={ui.hd !== false} canExit={!tour && !isEmbed()}
            panel={panel} setPanel={setPanel} />
          <BottomChrome state={state} showLabels={ui.showLabels} trayOpen={panel === 'views' && !(isTouch && walking)} />
          {panel === 'spaces' && <SpacesPanel state={state} onClose={() => setPanel(null)} />}
          {panel === 'help' && <HelpPanel walking={walking} isTouch={isTouch} onClose={() => setPanel(null)} />}
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
          <span>{ready ? 'Enter immersive 3D view' : 'Preparing the space'}</span>
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

/** Inside a client's iframe there is nowhere to exit to. */
const isEmbed = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('embed') === '1';

/* ------------------------------------------------------------------ */
/* Chrome: icon column top-left, actions top-right, views + progress   */
/* along the bottom. Everything else stays off the room.               */
/* ------------------------------------------------------------------ */

type Panel = 'views' | 'spaces' | 'help' | null;

const Icon = {
  spaces: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></svg>,
  views: <svg viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m3 13 9 5 9-5" /></svg>,
  walk: <svg viewBox="0 0 24 24"><circle cx="13" cy="4" r="2" /><path d="m9 21 2-6 3 3v4M7 12l3-4 4 1 2 4M11 8l-1 7" /></svg>,
  full: <svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>,
  unfull: <svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>,
  help: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" /></svg>,
  prev: <svg viewBox="0 0 24 24"><path d="M6 5v14M18 5 9 12l9 7V5Z" /></svg>,
  next: <svg viewBox="0 0 24 24"><path d="M18 5v14M6 5l9 7-9 7V5Z" /></svg>,
  play: <svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5-12-7.5Z" /></svg>,
  pause: <svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" /></svg>,
  exit: <svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
};

function IconBtn({ label, on, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`vw-ib ${on ? 'on' : ''}`} onClick={onClick} aria-label={label} aria-pressed={on} title={label}>
      {children}
    </button>
  );
}

function TopChrome({ state, walking, showBrand, brand, hd, canExit, panel, setPanel }: {
  state: ViewerState; walking: boolean; showBrand: boolean; brand: string; hd: boolean; canExit: boolean;
  panel: Panel; setPanel: (p: Panel) => void;
}) {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);

  return (
    <>
      <div className="vw-tl">
        {visibleScenes().length > 1 && <IconBtn label="Spaces" on={panel === 'spaces'} onClick={() => toggle('spaces')}>{Icon.spaces}</IconBtn>}
        <IconBtn label="Views" on={panel === 'views'} onClick={() => toggle('views')}>{Icon.views}</IconBtn>
        <IconBtn label={walking ? 'Back to viewpoints' : 'Walk freely'} on={walking} onClick={() => setWalkEnabled(!walking)}>{Icon.walk}</IconBtn>
      </div>

      <div className="vw-place">
        {showBrand && <span className="vw-place-brand">{brand}</span>}
        <span className="vw-place-name">{state.activeName}</span>
      </div>

      <div className="vw-tr">
        <button className={`vw-hd ${hd ? 'on' : ''}`} onClick={() => setHd(!hd)} aria-pressed={hd}
          title={hd ? 'Full resolution. Tap for a lighter view.' : 'Lighter view. Tap for full resolution.'}>HD</button>
        <IconBtn label="Controls" on={panel === 'help'} onClick={() => toggle('help')}>{Icon.help}</IconBtn>
        <IconBtn label={full ? 'Leave full screen' : 'Full screen'} onClick={() => {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
          else document.documentElement.requestFullscreen?.().catch(() => {});
        }}>{full ? Icon.unfull : Icon.full}</IconBtn>
        {canExit && (
          <a className="vw-exit" href="/gallery">
            <span>Exit 3D</span>{Icon.exit}
          </a>
        )}
      </div>
    </>
  );
}

function setHd(on: boolean) {
  try { localStorage.setItem('threedview.hd', on ? '1' : '0'); } catch { /* private mode */ }
  setUiConfig({ hd: on });
}

/**
 * The view tray and the segmented progress bar. One segment per camera track;
 * the one playing fills over its own flight time, the ones before it are full.
 */
function BottomChrome({ state, showLabels, trayOpen }: { state: ViewerState; showLabels: boolean; trayOpen: boolean }) {
  const vps = state.viewpoints || [];
  const [idx, setIdx] = useState(-1);
  const [auto, setAuto] = useState(false);
  const [run, setRun] = useState(0); // restarts the fill animation

  // Any interruption (a drag, a key) ends the flight — and the autoplay.
  useEffect(() => { if (!state.flying && auto) setAuto(false); }, [state.flying]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!vps.length) return null;

  const go = (i: number) => {
    const k = (i + vps.length) % vps.length;
    setIdx(k); setRun((n) => n + 1); setAuto(false);
    state.editor.stopSequence();
    state.playViewport(vps[k]);
  };
  const playAll = () => {
    const start = idx < 0 ? 0 : idx;
    setAuto(true);
    state.editor.playSequence([...vps.slice(start), ...vps.slice(0, start)], {
      onIndex: (k) => { setIdx((start + k) % vps.length); setRun((n) => n + 1); }
    });
  };
  const pause = () => { state.editor.stopSequence(); state.stopFly(); setAuto(false); };
  const playing = state.flying;

  return (
    <div className="vw-bottom">
      {trayOpen && (
        <div className="vw-tray" role="list">
          {vps.map((vp, i) => (
            <button key={vp.id} role="listitem" className={`vw-card ${i === idx ? 'on' : ''}`} onClick={() => go(i)} title={vp.label}>
              {vp.thumb
                ? <img className="vw-card-img" src={vp.thumb} alt="" />
                : <span className="vw-card-ph" data-l={(vp.label || '?').trim()[0]} />}
              {showLabels && <span className="vw-card-nm">{vp.label}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="vw-bar">
        <div className="vw-transport">
          <button className="vw-tb" onClick={() => go(idx - 1)} aria-label="Previous view">{Icon.prev}</button>
          <button className="vw-tb vw-tb-main" onClick={() => (playing ? pause() : playAll())} aria-label={playing ? 'Pause' : 'Play the tour'}>
            {playing ? Icon.pause : Icon.play}
          </button>
          <button className="vw-tb" onClick={() => go(idx + 1)} aria-label="Next view">{Icon.next}</button>
          {idx >= 0 && <span className="vw-now">{vps[idx]?.label}</span>}
        </div>
        <div className="vw-segs">
          {vps.map((vp, i) => (
            <button key={vp.id} className="vw-seg" onClick={() => go(i)} aria-label={`Go to ${vp.label}`} title={vp.label}>
              <span
                key={i === idx ? `run-${run}` : 'idle'}
                className={`vw-seg-fill ${i < idx ? 'done' : ''} ${i === idx ? (playing ? 'live' : 'done') : ''}`}
                style={{ '--dur': `${vp.seconds || 4}s` } as React.CSSProperties}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function SpacesPanel({ state, onClose }: { state: ViewerState; onClose: () => void }) {
  return (
    <div className="vw-pop vw-pop-spaces" role="dialog" aria-label="Spaces">
      <p className="vw-pop-title">Spaces</p>
      {visibleScenes().map((s) => (
        <button key={s.id} className={`vw-space ${s.id === state.activeId ? 'on' : ''}`}
          disabled={state.loading} onClick={() => { state.select(s.id); onClose(); }}>
          <span className="vw-space-tile" aria-hidden>{s.name.trim()[0]}</span>
          <span className="vw-space-txt">
            <span className="vw-space-nm">{s.name}</span>
            {s.tagline && <span className="vw-space-sub">{s.tagline}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

function HelpPanel({ walking, isTouch, onClose }: { walking: boolean; isTouch: boolean; onClose: () => void }) {
  const rows: [string, string][] = isTouch
    ? [['Drag', 'Look around'], ['Tap a card', 'Fly to that view'], ['Walk button', 'Move with the joystick']]
    : [
        ['Drag', 'Look around'],
        ['Card or segment', 'Fly to that view'],
        ...(walking ? [['W A S D', 'Walk'], ['Shift', 'Walk faster']] as [string, string][] : [['Walk button', 'Move freely']] as [string, string][]),
        ['Any key or click', 'Stop a flythrough']
      ];
  return (
    <div className="vw-pop vw-pop-help" role="dialog" aria-label="Controls">
      <p className="vw-pop-title">Controls</p>
      {rows.map(([k, v]) => (
        <p key={k} className="vw-help-row"><span className="vw-help-k">{k}</span><span>{v}</span></p>
      ))}
      <button className="vw-pop-close" onClick={onClose}>Close</button>
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
