'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { visibleScenes, SCENE_BY_ID } from '../lib/scenes';
import { useUiConfig, setUiConfig } from '../lib/uiConfig';
import { useNavMode, setVisitorMode, visitorMode } from '../lib/navMode';
import { zoomOrbit, scaleFlySpeed, walkerCfg } from '../lib/walkerConfig';
import { bookingFor, sceneHasAudio, subscribeDoc } from '../lib/sceneDoc';
import { safeUrl } from '../lib/api';
import { setMuted, unlockAudio, useSound } from '../lib/audio';
import { closeCurtain, openCurtain } from './Curtain';
import { TouchControls } from './TouchControls';
import { HotspotMarkers, HotspotPanel } from './HotspotMarkers';
import { EnquiryPanel } from './EnquiryPanel';
import { BookingCard } from './BookingCard';
import type { ViewerState } from '../@types/app.types';
import './viewer.css';

interface ViewerProps {
  state: ViewerState | null;
  isTouch: boolean;
  autoStart?: boolean;
  tour?: boolean;
}

/**
 * The visitor experience. The room is the interface (§10.2): the place name,
 * a few icon buttons, the mode switch, the views bar and the enquiry button,
 * and nothing else until the visitor acts. Reused verbatim as the studio's
 * Preview (with `autoStart` + `tour`).
 */
export function Viewer({ state, isTouch, autoStart = false, tour = false }: ViewerProps) {
  const ui = useUiConfig();
  const [enteredByUser, setEnteredByUser] = useState(false);
  const [openHs, setOpenHs] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>('views');
  // Book now and Ask about this space are two cards in the same place: one at a time.
  const [sheet, setSheet] = useState<'book' | 'ask' | null>(null);
  const [, bump] = useReducer((n) => n + 1, 0);
  useEffect(() => subscribeDoc(bump), []); // booking + hotspot audio arrive with the scene doc
  const nav = useNavMode();
  const walking = nav.walkEnabled;
  const entered = autoStart || enteredByUser;

  const ready = !!state?.ready;
  const failed = !!state?.failed;
  // Once the tour has shown, keep its chrome up through later loads (switching
  // space), and up for a failed space, so the visitor can always pick another.
  const [seenReady, setSeenReady] = useState(false);
  useEffect(() => { if (ready) setSeenReady(true); }, [ready]);
  const live = entered && (ready || failed || seenReady);
  const controllable = entered && ready && !state?.flying;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
      if (e.key === '?') {
        setPanel((p) => (p === 'help' ? null : 'help'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const [entering, setEntering] = useState(false);
  const enter = () => {
    if (entering) return;
    unlockAudio(); // §6.3: the enter tap is the gesture — resume the context here, synchronously
    setEntering(true);
    // a curtain closes over the start screen and opens on the room
    closeCurtain().then(() => {
      setEnteredByUser(true);
      requestAnimationFrame(openCurtain);
    });
  };

  return (
    <div className="vw" data-touch={isTouch ? '' : undefined}>
      {state?.loading && entered && <LoadingGate progress={state.progress} />}

      {!entered && (
        <EnterGate
          brand={ui.brand}
          place={state?.activeName}
          tagline={state?.activeId ? SCENE_BY_ID[state.activeId]?.tagline : undefined}
          ready={ready || failed}
          progress={state?.progress ?? 0}
          onEnter={enter}
          entering={entering}
        />
      )}

      {live && state && (
        <>
          <TopChrome state={state} showBrand={ui.showBrand} brand={ui.brand}
            hd={ui.hd !== false} canExit={!tour && !isEmbed()}
            panel={panel} setPanel={setPanel}
            bookOpen={sheet === 'book'} onBook={() => setSheet(sheet === 'book' ? null : 'book')} />
          {sheet === 'book' && bookingFor(state.activeId)?.enabled && (
            <BookingCard booking={bookingFor(state.activeId)!} place={state.activeName} onClose={() => setSheet(null)} />
          )}
          {failed && (
            <div className="vw-failed" role="alert">
              <h2>{state.activeName || 'This space'} didn&apos;t load</h2>
              <p>
                Its model couldn&apos;t be fetched.
                {visibleScenes().length > 1 ? ' Pick another space, or come back later.' : ' Try again later.'}
              </p>
            </div>
          )}
          {ready && <ModeSlider mode={visitorMode(nav)} />}
          <LayersRail state={state} />
          {ready && <BottomChrome state={state} showLabels={ui.showLabels} mode={visitorMode(nav)}
            trayOpen={panel === 'views' && !(isTouch && walking)}
            onToggleTray={() => setPanel(panel === 'views' ? null : 'views')} />}
          {panel === 'spaces' && <SpacesPanel state={state} onClose={() => setPanel(null)} />}
          {panel === 'help' && <HelpPanel walking={walking} isTouch={isTouch} onClose={() => setPanel(null)} />}
          {controllable && (
            <HotspotMarkers sceneId={state.activeId} mode="view" onOpen={(id) => setOpenHs(id)} />
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
          {!isTouch && controllable && <FirstRunHint key={visitorMode(nav)} walking={walking} aerial={nav.orbitEnabled} fly={nav.flyEnabled} />}
          {isTouch && (walking || nav.flyEnabled) && <TouchControls visible={controllable} />}
        </>
      )}

      {/* CLAUDE.md §3 constraint 5: the CTA is never blocked by the 3D — it
       *  mounts whether or not the renderer ever reaches `ready` (WebGL2
       *  missing, a slow load, a failed one). It only needs a scene id, which
       *  App.tsx sets from lib/scenes.ts before the SDK even starts loading. */}
      {state?.activeId && (
        <EnquiryPanel sceneId={state.activeId} sceneName={state.activeName}
          open={sheet === 'ask'} onOpenChange={(o) => setSheet(o ? 'ask' : null)} />
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

interface EnterGateProps {
  brand: string;
  place?: string;
  tagline?: string;
  ready: boolean;
  progress: number;
  onEnter: () => void;
  entering: boolean;
}

/** A hero over the room itself: the scene streams in behind it, so by the
 *  time the button is live the visitor is already looking at the space. */
function EnterGate({ brand, place, tagline, ready, progress, onEnter, entering }: EnterGateProps) {
  const pct = Math.round((progress ?? 0) * 100);
  // arrived behind the home page's curtain: open it on this screen
  useEffect(() => { openCurtain(); }, []);
  return (
    <div className="vw-enter">
      <div className="vw-enter-in">
        <p className="vw-enter-brand">{brand}</p>
        <h1 className="vw-enter-mark">{place ?? brand}</h1>
        {tagline && <p className="vw-enter-sub">{tagline}</p>}
        <button className="vw-enter-btn" onClick={onEnter} disabled={!ready || entering}>
          <span className="vw-enter-play" aria-hidden>{Icon.play}</span>
          <span>{ready ? 'Start virtual tour' : `Preparing the space ${pct}%`}</span>
        </button>
      </div>
    </div>
  );
}

/** Inside a client's iframe there is nowhere to exit to. */
const isEmbed = () => typeof location !== 'undefined' && new URLSearchParams(location.search).get('embed') === '1';

/* ------------------------------------------------------------------ */
/* Chrome: place name top-left, actions top-right, the mode switch and */
/* the views bar along the bottom. Everything else stays off the room. */
/* ------------------------------------------------------------------ */

type Panel = 'views' | 'spaces' | 'help' | null;

const Icon = {
  spaces: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></svg>,
  views: <svg viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5-9-5Z" /><path d="m3 13 9 5 9-5" /></svg>,
  walk: <svg viewBox="0 0 24 24"><circle cx="13" cy="4" r="2" /><path d="m9 21 2-6 3 3v4M7 12l3-4 4 1 2 4M11 8l-1 7" /></svg>,
  pin: <svg viewBox="0 0 24 24"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></svg>,
  fly: <svg viewBox="0 0 24 24"><path d="M3 18c4-9 9-12 18-12" /><path d="M16 3l5 3-3 5" /></svg>,
  orbit: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.5" /><path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v4h-4" /></svg>,
  plus: <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>,
  close: <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>,
  chevL: <svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7" /></svg>,
  chevR: <svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7" /></svg>,
  minus: <svg viewBox="0 0 24 24"><path d="M5 12h14" /></svg>,
  recenter: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>,
  full: <svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>,
  unfull: <svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>,
  help: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01" /></svg>,
  soundOn: <svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>,
  soundOff: <svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="m17 9 5 6M22 9l-5 6" /></svg>,
  prev: <svg viewBox="0 0 24 24"><path d="M6 5v14M18 5 9 12l9 7V5Z" /></svg>,
  next: <svg viewBox="0 0 24 24"><path d="M18 5v14M6 5l9 7-9 7V5Z" /></svg>,
  play: <svg viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5-12-7.5Z" /></svg>,
  pause: <svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14" /></svg>,
  restart: <svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" /><path d="M3 3v5h5" /></svg>,
  exit: <svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6" /></svg>
};

function IconBtn({ label, on, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`vw-ib ${on ? 'on' : ''}`} onClick={onClick} aria-label={label} aria-pressed={on} title={label}>
      {children}
    </button>
  );
}

function TopChrome({ state, showBrand, brand, hd, canExit, panel, setPanel, bookOpen, onBook }: {
  state: ViewerState; showBrand: boolean; brand: string; hd: boolean; canExit: boolean;
  panel: Panel; setPanel: (p: Panel) => void; bookOpen: boolean; onBook: () => void;
}) {
  const [full, setFull] = useState(false);
  const sound = useSound();
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);
  const booking = bookingFor(state.activeId);
  const bookHref = booking?.enabled ? safeUrl(booking.url) : null;

  return (
    <>
      <div className="vw-place">
        {showBrand && <span className="vw-place-brand">{brand}</span>}
        <span className="vw-place-name">{state.activeName}</span>
      </div>

      <div className="vw-tr">
        {visibleScenes().length > 1 && (
          <span className="vw-phone-only">
            <IconBtn label="Spaces" on={panel === 'spaces'} onClick={() => toggle('spaces')}>{Icon.spaces}</IconBtn>
          </span>
        )}
        {/* §6.3: always visible while this space has audio. */}
        {sceneHasAudio(state.activeId) && (
          <IconBtn label={sound.muted ? 'Turn sound on' : 'Turn sound off'} on={!sound.muted} onClick={() => setMuted(!sound.muted)}>
            {sound.muted ? Icon.soundOff : Icon.soundOn}
          </IconBtn>
        )}
        <button className={`vw-hd ${hd ? 'on' : ''}`} onClick={() => setHd(!hd)} aria-pressed={hd}
          title={hd ? 'Full resolution. Tap for a lighter view.' : 'Lighter view. Tap for full resolution.'}>HD</button>
        <IconBtn label="Controls" on={panel === 'help'} onClick={() => toggle('help')}>{Icon.help}</IconBtn>
        <IconBtn label={full ? 'Leave full screen' : 'Full screen'} onClick={() => {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
          else document.documentElement.requestFullscreen?.().catch(() => { });
        }}>{full ? Icon.unfull : Icon.full}</IconBtn>
        {bookHref && (
          // Opens the booking card; the card links on to the hotel's own page.
          <button className={`vw-book ${bookOpen ? 'on' : ''}`} onClick={onBook} aria-expanded={bookOpen}>
            {booking!.label.trim() || 'Book now'}
          </button>
        )}
        {canExit && (
          <a className="vw-exit" href="/gallery" aria-label="Exit 3D">
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

/** Viewpoints (default), Walk, Fly (free flight) or Orbit (circle the room
 *  at eye level) — §6.1. Floor plan is deliberately not here. Each carries a
 *  one-line promise of what it's for, in the visitor's terms. */
const MODES = [
  ['viewpoints', 'Viewpoints', Icon.pin, 'Glide between the best spots'],
  ['walk', 'Walk', Icon.walk, 'Move freely, as if you’re there'],
  ['fly', 'Fly', Icon.fly, 'Soar anywhere with W A S D'],
  ['orbit', 'Orbit', Icon.orbit, 'Circle the room at eye level']
] as const;

/**
 * The mode rail, right edge, halfway down: all four modes as round icon
 * buttons in a column, so every choice is one tap and none is hidden behind
 * an arrow. The current one sits in a gold ring that glides to the mode you
 * pick, and its name and promise show beside it; hovering another shows its
 * name. Arrow keys up/down step between them (a radio group).
 */
function ModeSlider({ mode }: { mode: string }) {
  const i = Math.max(0, MODES.findIndex(([m]) => m === mode));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const step = (k: number) => {
    const j = (k + MODES.length) % MODES.length;
    setVisitorMode(MODES[j][0]);
    refs.current[j]?.focus();
  };

  return (
    <div
      className="vw-rail" role="radiogroup" aria-label="How to move"
      style={{ '--i': i } as React.CSSProperties}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); step(i + 1); }
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); step(i - 1); }
      }}
    >
      <b className="vw-rail-ring" aria-hidden />
      {MODES.map(([m, label, icon, promise], k) => (
        <button
          key={m} ref={(b) => { refs.current[k] = b; }}
          type="button" role="radio" aria-checked={k === i} tabIndex={k === i ? 0 : -1}
          className={`vw-rail-btn${k === i ? ' on' : ''}`}
          onClick={(e) => { e.currentTarget.blur(); setVisitorMode(m); }}
        >
          {icon}
          <span className="vw-rail-tip">
            <span className="vw-rail-name">{label}</span>
            {k === i && <span className="vw-rail-promise">{promise}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Orbit and Fly's own controls, in place of the views bar: the views are
 *  fixed stops, which mean nothing while circling the room. */
function FlyBar({ state, mode }: { state: ViewerState; mode: 'orbit' | 'fly' }) {
  const [, bump] = useReducer((n) => n + 1, 0);
  // The wheel changes the speed too, inside the walker; keep the readout honest.
  useEffect(() => {
    if (mode !== 'fly') return;
    const id = setInterval(bump, 250);
    return () => clearInterval(id);
  }, [mode]);
  const exit = mode === 'fly' ? 'Exit fly mode' : 'Exit orbit';
  const boost = walkerCfg.flyBoost;
  return (
    <div className="vw-flybar" role="group" aria-label={mode === 'fly' ? 'Fly controls' : 'Orbit controls'}>
      {mode === 'fly' ? (
        <>
          <button className="vw-tb" onClick={() => { scaleFlySpeed(1 / 1.5); bump(); }} aria-label="Fly slower" title="Slower">{Icon.minus}</button>
          <span className="vw-speed" aria-live="polite">{boost >= 1 ? boost.toFixed(boost < 10 ? 1 : 0) : boost.toFixed(2)}×</span>
          <button className="vw-tb" onClick={() => { scaleFlySpeed(1.5); bump(); }} aria-label="Fly faster" title="Faster">{Icon.plus}</button>
        </>
      ) : (
        <>
          <button className="vw-tb" onClick={() => zoomOrbit(1.25)} aria-label="Zoom out" title="Zoom out">{Icon.minus}</button>
          <button className="vw-tb" onClick={() => zoomOrbit(0.8)} aria-label="Zoom in" title="Zoom in">{Icon.plus}</button>
        </>
      )}
      <button className="vw-tb vw-tb-wide" onClick={() => state.flyReset()} aria-label="Reset view">{Icon.recenter}<span>Reset view</span></button>
      <button className="vw-tb vw-tb-wide" onClick={() => setVisitorMode('viewpoints')} aria-label={exit}>{Icon.close}<span>{exit}</span></button>
    </div>
  );
}

/**
 * Layers: this project's spaces down the left edge, like a building's floor
 * picker. One tap switches space; in Fly mode you stay up in the air.
 * Phones use the Spaces button instead — there's no room for a rail.
 */
function LayersRail({ state }: { state: ViewerState }) {
  const spaces = visibleScenes();
  if (spaces.length < 2) return null;
  const at = Math.max(0, spaces.findIndex((s) => s.id === state.activeId));
  return (
    <nav className="vw-layers" aria-label="Spaces" style={{ '--at': at } as React.CSSProperties}>
      <span className="vw-layers-head">Spaces</span>
      <span className="vw-layers-list">
        {/* the spine, and the accent marker that glides to where you are */}
        <span className="vw-layers-spine" aria-hidden />
        <span className="vw-layers-marker" aria-hidden />
        {spaces.map((s, i) => {
          const on = s.id === state.activeId;
          return (
            <button
              key={s.id} className={`vw-layer ${on ? 'on' : ''} ${on && state.loading ? 'is-loading' : ''}`}
              aria-current={on ? 'true' : undefined}
              disabled={state.loading && !on} onClick={() => !on && state.select(s.id)} title={s.name}
            >
              <span className="vw-layer-node" aria-hidden />
              <span className="vw-layer-no" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
              <span className="vw-layer-name">{s.name}</span>
            </button>
          );
        })}
      </span>
    </nav>
  );
}

/**
 * The scene tray and, under it, the tour bar: ‹ Scenes, start over | play ›.
 */
function BottomChrome({ state, showLabels, mode, trayOpen, onToggleTray }: {
  state: ViewerState; showLabels: boolean; mode: string; trayOpen: boolean; onToggleTray: () => void;
}) {
  const vps = state.viewpoints || [];
  const [idx, setIdx] = useState(-1);
  const [auto, setAuto] = useState(false);


  const go = (i: number) => {
    const k = (i + vps.length) % vps.length;
    setIdx(k); setAuto(false);
    state.editor.stopSequence();
    state.playViewport(vps[k]);
  };
  const playAll = () => {
    const start = idx < 0 ? 0 : idx;
    setAuto(true);
    state.editor.playSequence([...vps.slice(start), ...vps.slice(0, start)], {
      onIndex: (k) => setIdx((start + k) % vps.length),
      // any interruption (a drag, a key, pause) ends the autoplay
      onEnd: () => setAuto(false)
    });
  };
  const pause = () => { state.editor.stopSequence(); state.stopFly(); setAuto(false); };
  // Playing across the short pauses between views too — otherwise the button
  // flips to "Play" in the gap, and pressing it restarts the tour.
  const playing = state.flying || auto;

  // One centred column: views tray, transport, progress. Orbit and Fly swap
  // them for their own controls. The mode switch is the rail on the right edge (ModeSlider).
  if (mode === 'fly' || mode === 'orbit') {
    return (
      <div className="vw-bottom">
        <FlyBar state={state} mode={mode} />
      </div>
    );
  }

  if (!vps.length) return null;

  return (
    <div className="vw-bottom">
      {/* The filmstrip: one photo card per scene, the current one outlined in the accent. */}
      {trayOpen && (
        <div className="vw-tray" role="list">
          {vps.map((vp, i) => (
            <button key={vp.id} role="listitem" className={`vw-card ${i === idx ? 'on' : ''}`}
              aria-current={i === idx ? 'true' : undefined} onClick={() => go(i)} title={vp.label}>
              {vp.thumb
                ? <img className="vw-card-img" src={vp.thumb} alt="" />
                : <span className="vw-card-ph" aria-hidden>{Icon.views}</span>}
              {showLabels && <span className="vw-card-nm">{vp.label}</span>}
            </button>
          ))}
        </div>
      )}

      {/* The tour bar: ‹ Scenes, start over | play/pause › */}
      <div className={`vw-tourbar ${playing ? 'is-playing' : ''}`} role="toolbar" aria-label="Tour">
        <button className="vw-tourbar-btn" onClick={() => go(idx < 0 ? vps.length - 1 : idx - 1)} aria-label="Previous scene" title="Previous scene">{Icon.chevL}</button>
        <button className={`vw-tourbar-views ${trayOpen ? 'on' : ''}`} onClick={onToggleTray} aria-pressed={trayOpen} title="Scenes">
          {Icon.views}<span>Scenes</span>
        </button>
        <button className="vw-tourbar-btn" onClick={() => go(0)} aria-label="Start over" title="Start over">{Icon.restart}</button>
        <span className="vw-tourbar-sep" aria-hidden />
        <button className="vw-tourbar-btn vw-tourbar-play" onClick={() => (playing ? pause() : playAll())}
          aria-label={playing ? 'Pause' : 'Play the tour'} title={playing ? 'Pause' : 'Play the tour'}>
          {playing ? Icon.pause : Icon.play}
        </button>
        <button className="vw-tourbar-btn" onClick={() => go(idx + 1)} aria-label="Next scene" title="Next scene">{Icon.chevR}</button>
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
    ? [['Drag', 'Look around'], ['Tap a card', 'Fly to that view'], ['Tap a ring', 'Open what’s there'], ['Walk', 'Move with the joystick']]
    : [
      ['Drag', 'Look around'],
      ['Card or segment', 'Fly to that view'],
      ['Ring or label', 'Open what’s there'],
      ...(walking ? [['W A S D', 'Walk'], ['Shift', 'Walk faster']] as [string, string][] : [['Walk', 'Move freely']] as [string, string][]),
      ['Orbit', 'Circle the room at eye level'],
      ['Fly: W A S D', 'Fly where you look'],
      ['Fly: E / Q', 'Up / down'],
      ['Fly: drag, scroll', 'Look around, change speed'],
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

function FirstRunHint({ walking, aerial, fly }: { walking: boolean; aerial: boolean; fly: boolean }) {
  const [gone, setGone] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    t.current = setTimeout(() => setGone(true), fly ? 9000 : 4200); // Fly has more to learn
    return () => clearTimeout(t.current);
  }, [fly]);
  if (gone) return null;
  return (
    <div className="vw-hint">
      {fly ? (
        <>
          <span className="vw-hint-k">W A S D</span> fly<span className="vw-hint-sep" />
          <span className="vw-hint-k">E</span> up <span className="vw-hint-k">Q</span> down<span className="vw-hint-sep" />
          <span className="vw-hint-k">Shift</span> faster<span className="vw-hint-sep" />
          <span className="vw-hint-k">Drag</span> to look<span className="vw-hint-sep" />
          <span className="vw-hint-k">Scroll</span> speed
        </>
      ) : aerial ? (
        <><span className="vw-hint-k">Drag</span> to circle the space<span className="vw-hint-sep" /><span className="vw-hint-k">Scroll</span> to zoom</>
      ) : (<>
      <span className="vw-hint-k">Drag</span> to look around
      <span className="vw-hint-sep" />
      {walking
        ? <><span className="vw-hint-k">W A S D</span> to walk</>
        : <><span className="vw-hint-k">Walk</span> to move freely</>}
      </>)}
    </div>
  );
}
