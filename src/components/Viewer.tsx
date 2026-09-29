'use client';

import { useEffect, useReducer, useRef, useState } from 'react';
import { tourSpaces, visibleScenes, dayNightPair, sameTimeOfDay, SCENE_BY_ID, isPublicTour, hasPlaces, placesMap } from '../lib/scenes';
import { useUiConfig, setUiConfig } from '../lib/uiConfig';
import { useNavMode, setVisitorMode, visitorMode } from '../lib/navMode';
import { zoomOrbit, scaleFlySpeed, walkerCfg } from '../lib/walkerConfig';
import { bookingFor, sceneHasAudio, subscribeDoc } from '../lib/sceneDoc';
import { apiUrl, safeUrl, getSiteBooking, getSitePreview, getSiteStays, conciergeOn, type ConciergeShow, type SiteBooking, type SiteStays, type SiteTable, type StayRoom } from '../lib/api';
import { ConciergePanel } from './ConciergePanel';
import { TableBooking } from './TableBooking';
import { TableCard } from './TableCard';
import { RoomBooking } from './RoomBooking';
import { RoomCard } from './RoomCard';
import { setMuted, unlockAudio, useSound } from '../lib/audio';
import { countHotspot, countIntent, type Intent } from '../lib/stats';
import { FloorMap } from './FloorMap';
import { TouchControls } from './TouchControls';
import { HotspotMarkers, HotspotPanel } from './HotspotMarkers';
import { hotspotsFor } from '../lib/sceneDoc';
import { EnquiryPanel } from './EnquiryPanel';
import { BookingCard } from './BookingCard';
import { useT, setLang, LANGS, type Lang } from '../lib/i18n';
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
  const t = useT();
  const [enteredByUser, setEnteredByUser] = useState(false);
  const [openHs, setOpenHs] = useState<string | null>(null);
  // the last hotspot opened, and in which space: an enquiry reports it
  const [lastHs, setLastHs] = useState<{ sceneId: string; id: string; label: string } | null>(null);
  const [panel, setPanel] = useState<Panel>('views');
  // Book now and Ask about this space are two cards in the same place: one at a time.
  // 'table': the Reserve a table card (like Book now); 'plan': its floor plan, to pick by sight.
  // 'room': the Book a room card; 'rooms': every room and the site plan.
  const [sheet, setSheet] = useState<'book' | 'ask' | 'table' | 'plan' | 'room' | 'rooms' | 'concierge' | null>(null);
  const [concierge, setConcierge] = useState(false); // the AI concierge is on for this project
  // Table and room booking from the project's website: the published setup on
  // the tour, the saved draft in the studio's Preview (which never books). Null when off.
  const pid = state?.activeId ? SCENE_BY_ID[state.activeId]?.propertyId ?? null : null;
  const [tables, setTables] = useState<{ pid: string; booking: SiteBooking } | null>(null);
  const [stays, setStays] = useState<{ pid: string; stays: SiteStays } | null>(null);
  const [tableId, setTableId] = useState('');
  const [roomId, setRoomId] = useState('');
  useEffect(() => {
    if (!pid) { setTables(null); setStays(null); return; }
    let live = true;
    const load = isPublicTour()
      ? Promise.all([getSiteBooking(pid), getSiteStays(pid)])
      : getSitePreview(pid).then((s) => [s?.site.booking ?? null, s?.site.stays ?? null] as const).catch(() => [null, null] as const);
    conciergeOn(pid).then((yes) => { if (live) setConcierge(yes); });
    load.then(([booking, rooms]) => {
      if (!live) return;
      setTables(booking ? { pid, booking } : null);
      setStays(rooms ? { pid, stays: rooms } : null);
    });
    return () => { live = false; };
  }, [pid]);
  const reserve = (id = '') => { setTableId(id); setSheet('table'); };
  const showPlace = (s: ConciergeShow) => {
    if (!state) return;
    if (s.space !== state.activeId) { wanted.current = { space: s.space, view: s.view }; bumpWanted(); return; }
    const vp = s.view ? state.viewpoints?.find((v) => v.id === s.view) : undefined;
    if (vp) state.playViewport(vp);
    if (s.hotspot) setOpenHs(s.hotspot);
  };
  // The path to a booking (monthly report): which card a visitor opened, in which space.
  useEffect(() => {
    const intents: Partial<Record<NonNullable<typeof sheet>, Intent>> = { ask: 'enquire', book: 'book', table: 'table', plan: 'table', room: 'room', rooms: 'room' };
    const intent = sheet ? intents[sheet] : undefined; // the concierge isn't a booking card
    if (intent && state?.activeId) countIntent(state.activeId, intent);
  }, [sheet]); // eslint-disable-line react-hooks/exhaustive-deps -- counted as the card opens, in the space it opened in
  // The room this space shows, when it's one the hotel lets online: "Book this room".
  const hereRoom = stays?.stays.rooms.find((r) => r.space && r.space === state?.activeId)?.id ?? '';
  const bookRoom = (id = hereRoom) => { setRoomId(id); setSheet('room'); };
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
    // On a client's own website (this tour in their iframe), starting takes
    // it full screen, like a video: their page stays theirs, the 3D gets the
    // whole screen, and Esc or the full-screen button brings them back. Only
    // on a real tap (a message from the page has none), and only where the
    // browser can (not iPhone Safari: there it plays in place).
    if (window.self !== window.top && navigator.userActivation?.isActive) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
    setEntering(true);
    // The start screen dissolves (viewer.css .vw-enter.is-leaving) while the
    // arrival below is already under way, then it goes.
    setTimeout(() => setEnteredByUser(true), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700);
  };

  // Every space opens with an arrival: the view glides in from a step back
  // (App.tsx standBack/arrive) while the room pulls into focus (.vw-arrive).
  // On the first space it starts with the Start tap; after that, whenever a
  // new space is ready. A day/night switch keeps its view, so only focuses.
  const [arrivals, bumpArrivals] = useReducer((n: number) => n + 1, 0);
  const [arrived, setArrived] = useState(0); // the last arrival whose focus pull has finished
  const going = entering || entered;
  useEffect(() => {
    if (!going || !ready || !state) return;
    state.arrive();
    bumpArrivals();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per space load, not per state object
  }, [going, ready, state?.activeId]);

  // A project's website (/s/<project>) embeds this tour and can send it to a
  // room: { type: 'rcaas:view', space?, view? }. Only our own pages may. It
  // enters the tour if need be, opens the space, then flies to the view.
  const wanted = useRef<{ space?: string; view?: string } | null>(null);
  const [, bumpWanted] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== window.parent || e.data?.type !== 'rcaas:view') return;
      const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
      wanted.current = { space: str(e.data.space), view: str(e.data.view) };
      bumpWanted();
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);
  useEffect(() => {
    const w = wanted.current;
    if (!w || !state) return;
    if (!entered) { if (ready || failed) enter(); return; }
    if (w.space && w.space !== state.activeId) {
      if (!visibleScenes().some((s) => s.id === w.space)) wanted.current = null; // not in this tour
      else if (!state.loading) state.select(w.space);
      return;
    }
    if (!controllable) return;
    wanted.current = null;
    const vp = w.view ? state.viewpoints?.find((v) => v.id === w.view) : undefined;
    if (vp) state.playViewport(vp);
  });

  return (
    <div className="vw" data-touch={isTouch ? '' : undefined} data-tour={tour ? '' : undefined}>
      {state?.loading && entered && <LoadingGate progress={state.progress} />}
      {arrivals > arrived && <div key={arrivals} className="vw-arrive" aria-hidden onAnimationEnd={() => setArrived(arrivals)} />}

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
            bookOpen={sheet === 'book'} onBook={() => setSheet(sheet === 'book' ? null : 'book')}
            reserveOpen={sheet === 'table' || sheet === 'plan'}
            onReserve={tables ? () => (sheet === 'table' || sheet === 'plan' ? setSheet(null) : reserve()) : undefined}
            conciergeOpen={sheet === 'concierge'} onConcierge={concierge ? () => setSheet(sheet === 'concierge' ? null : 'concierge') : undefined}
            stayOpen={sheet === 'room' || sheet === 'rooms'} stayHere={!!hereRoom}
            onStay={stays ? () => (sheet === 'room' || sheet === 'rooms' ? setSheet(null) : bookRoom()) : undefined} />
          {sheet === 'table' && tables && (
            <TableCard key={tableId} project={tables.pid} booking={tables.booking} venue={ui.brand}
              initialTable={tableId} preview={!isPublicTour()} onClose={() => setSheet(null)}
              onOpenPlan={(id) => { setTableId(id); setSheet('plan'); }} />
          )}
          {sheet === 'plan' && tables && (
            <>
              <div className="vw-reserve-scrim" onClick={() => setSheet(null)} />
              <div className="vw-reserve tb-host" role="dialog" aria-label={t('Reserve a table')}>
                <button className="vw-sheet-x" onClick={() => setSheet(null)} aria-label={t('Close')}>✕</button>
                <h2>{t('Reserve a table')}</h2>
                <TableBooking key={tableId} project={tables.pid} booking={tables.booking} tourSpace={null}
                  preview={!isPublicTour()} initialTable={tableId}
                  onView={(tb: SiteTable) => {
                    const vp = state.viewpoints?.find((v) => v.id === tb.view);
                    if (!vp) return;
                    setSheet(null);
                    state.playViewport(vp);
                  }} />
              </div>
            </>
          )}
          {sheet === 'room' && stays && (
            <RoomCard key={roomId} project={stays.pid} stays={stays.stays} venue={ui.brand}
              initialRoom={roomId} preview={!isPublicTour()} onClose={() => setSheet(null)}
              onOpenAll={(id) => { setRoomId(id); setSheet('rooms'); }} />
          )}
          {sheet === 'rooms' && stays && (
            <>
              <div className="vw-reserve-scrim" onClick={() => setSheet(null)} />
              <div className="vw-reserve tb-host" role="dialog" aria-label={t('Book a room')}>
                <button className="vw-sheet-x" onClick={() => setSheet(null)} aria-label={t('Close')}>✕</button>
                <h2>{t('Book a room')}</h2>
                <RoomBooking key={roomId} project={stays.pid} stays={stays.stays} preview={!isPublicTour()} initialRoom={roomId}
                  onView={(r: StayRoom) => {
                    // Off to that room's space and view, the way the website's "View in 3D" sends the tour.
                    setSheet(null);
                    wanted.current = { space: r.space, view: r.view || undefined };
                    bumpWanted();
                  }} />
              </div>
            </>
          )}
          <NarrationCaption />
          {sheet === 'concierge' && pid && (
            <ConciergePanel project={pid} space={state.activeId} venue={ui.brand} onShow={showPlace} onClose={() => setSheet(null)} />
          )}
          {sheet === 'book' && bookingFor(state.activeId)?.enabled && (
            <BookingCard booking={bookingFor(state.activeId)!} place={state.activeName} onClose={() => setSheet(null)} />
          )}
          {failed && (
            <div className="vw-failed" role="alert">
              <h2>{t('{place} didn’t load', { place: state.activeName || t('This space') })}</h2>
              <p>
                {t('Its model couldn’t be fetched.')}{' '}
                {tourSpaces().length > 1 ? t('Pick another space, or come back later.') : t('Try again later.')}
              </p>
            </div>
          )}
          {ready && <ModeSlider mode={visitorMode(nav)} />}
          <LayersRail state={state} />
          {ready && <FloorMap assetId={SCENE_BY_ID[state.activeId]?.assetId} startOpen={!isTouch} />}
          {ready && <BottomChrome state={state} showLabels={ui.showLabels} mode={visitorMode(nav)}
            trayOpen={panel === 'views' && !(isTouch && walking)}
            onToggleTray={() => setPanel(panel === 'views' ? null : 'views')} />}
          {panel === 'spaces' && <SpacesPanel state={state} onClose={() => setPanel(null)} />}
          {panel === 'help' && <HelpPanel walking={walking} isTouch={isTouch} onClose={() => setPanel(null)} />}
          {controllable && (
            <HotspotMarkers sceneId={state.activeId} mode="view" onOpen={(id) => {
              setOpenHs(id);
              countHotspot(state.activeId, id);
              const hs = hotspotsFor(state.activeId).find((h) => h.id === id);
              setLastHs({ sceneId: state.activeId, id, label: hs?.label ?? id });
            }} />
          )}
          {openHs && (
            <HotspotPanel
              sceneId={state.activeId}
              id={openHs}
              onClose={() => setOpenHs(null)}
              onPortal={(sid) => { setOpenHs(null); state.select(sid); }}
              onReserve={tables ? (id) => { setOpenHs(null); reserve(id); } : undefined}
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
          hotspot={lastHs?.sceneId === state.activeId ? lastHs : null} whatsapp={ui.whatsapp}
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

/** A hero over the room itself: the scene streams in behind frosted glass
 *  (seen from a step back, App.tsx standBack), so by the time the button is
 *  live the visitor is already looking at the space. On Start the glass
 *  dissolves as the view glides in. */
function EnterGate({ brand, place, tagline, ready, progress, onEnter, entering }: EnterGateProps) {
  const pct = Math.round((progress ?? 0) * 100);
  const { logo } = useUiConfig(); // the project's own (per-project branding)
  const t = useT();
  return (
    <div className={`vw-enter${entering ? ' is-leaving' : ready ? '' : ' is-loading'}`}>
      <div className="vw-enter-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo && <img className="vw-enter-logo" src={logo} alt="" />}
        <p className="vw-enter-brand">{brand}</p>
        <h1 className="vw-enter-mark">{place ?? brand}</h1>
        {tagline && <p className="vw-enter-sub">{tagline}</p>}
        <button className="vw-enter-btn" onClick={onEnter} disabled={!ready || entering}>
          <span className="vw-enter-play" aria-hidden>{Icon.play}</span>
          <span>{ready ? t('Start virtual tour') : t('Preparing the space {pct}%', { pct })}</span>
        </button>
        {!ready && (
          <span className="vw-enter-prog" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
            style={{ '--p': pct } as React.CSSProperties}><span /></span>
        )}
        <LangPicker className="vw-enter-lang" />
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
  chat: <svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-5 4V5Z" /><path d="M8 9.5h8M8 12.5h5" /></svg>,
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
  exit: <svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6" /></svg>,
  moon: <svg viewBox="0 0 24 24"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" /></svg>
};

function IconBtn({ label, on, onClick, children }: { label: string; on?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`vw-ib ${on ? 'on' : ''}`} onClick={onClick} aria-label={label} aria-pressed={on} title={label}>
      {children}
    </button>
  );
}

function TopChrome({ state, showBrand, brand, hd, canExit, panel, setPanel, bookOpen, onBook, reserveOpen, onReserve, stayOpen, stayHere, onStay, conciergeOpen, onConcierge }: {
  state: ViewerState; showBrand: boolean; brand: string; hd: boolean; canExit: boolean;
  panel: Panel; setPanel: (p: Panel) => void; bookOpen: boolean; onBook: () => void;
  reserveOpen: boolean; onReserve?: () => void;
  /** Room booking on the website: its card is open; this space is one of its rooms. */
  stayOpen: boolean; stayHere: boolean; onStay?: () => void;
  /** The AI concierge, when it's on for this project. */
  conciergeOpen: boolean; onConcierge?: () => void;
}) {
  const [full, setFull] = useState(false);
  const { logo } = useUiConfig();
  const sound = useSound();
  const t = useT();
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const toggle = (p: Panel) => setPanel(panel === p ? null : p);
  const booking = bookingFor(state.activeId);
  const pair = dayNightPair(state.activeId);
  const atNight = pair?.night === state.activeId;
  // Rooms booked here, through the website, take over from a Book now link to the hotel's own page.
  const bookHref = booking?.enabled && !onStay ? safeUrl(booking.url) : null;

  return (
    <>
      <div className="vw-place">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {showBrand && logo && <img className="vw-place-logo" src={logo} alt={brand} />}
        {showBrand && <span className="vw-place-brand">{brand}</span>}
        <span className="vw-place-name">{state.activeName}</span>
        <PlacePicker state={state} />
      </div>

      <div className="vw-tr">
        {tourSpaces().length > 1 && (
          <span className="vw-phone-only">
            <IconBtn label={t('Spaces')} on={panel === 'spaces'} onClick={() => toggle('spaces')}>{Icon.spaces}</IconBtn>
          </span>
        )}
        {pair && (
          <IconBtn label={atNight ? t('Switch to day') : t('Switch to night')} on={atNight}
            onClick={() => { if (!state.loading) state.selectKeepingView(atNight ? pair.day : pair.night); }}>
            {Icon.moon}
          </IconBtn>
        )}
        {/* §6.3: always visible while this space has audio. */}
        {sceneHasAudio(state.activeId) && (
          <IconBtn label={sound.muted ? t('Turn sound on') : t('Turn sound off')} on={!sound.muted} onClick={() => setMuted(!sound.muted)}>
            {sound.muted ? Icon.soundOff : Icon.soundOn}
          </IconBtn>
        )}
        {onConcierge && <IconBtn label={t('Ask the concierge')} on={conciergeOpen} onClick={onConcierge}>{Icon.chat}</IconBtn>}
        <LangPicker className="vw-hd" />
        <button className={`vw-hd ${hd ? 'on' : ''}`} onClick={() => setHd(!hd)} aria-pressed={hd}
          title={hd ? t('Full resolution. Tap for a lighter view.') : t('Lighter view. Tap for full resolution.')}>HD</button>
        <IconBtn label={t('Controls')} on={panel === 'help'} onClick={() => toggle('help')}>{Icon.help}</IconBtn>
        <IconBtn label={full ? t('Leave full screen') : t('Full screen')} onClick={() => {
          if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
          else document.documentElement.requestFullscreen?.().catch(() => { });
        }}>{full ? Icon.unfull : Icon.full}</IconBtn>
        {bookHref && (
          // Opens the booking card; the card links on to the hotel's own page.
          <button className={`vw-book ${bookOpen ? 'on' : ''}`} onClick={onBook} aria-expanded={bookOpen}>
            {booking!.label.trim() || t('Book now')}
          </button>
        )}
        {onStay && (
          // The project's room booking, over the tour (RoomCard); in a room that's for let, that room.
          <button className={`vw-book ${stayOpen ? 'on' : ''}`} onClick={onStay} aria-expanded={stayOpen}>
            {stayHere ? t('Book this room') : t('Book a room')}
          </button>
        )}
        {onReserve && (
          // The project's table booking, over the tour (TableBooking).
          <button className={`vw-book vw-book-alt ${reserveOpen ? 'on' : ''}`} onClick={onReserve} aria-expanded={reserveOpen}>
            {t('Reserve a table')}
          </button>
        )}
        {canExit && (
          <a className="vw-exit" href="/gallery" aria-label={t('Exit 3D')}>
            <span>{t('Exit 3D')}</span>{Icon.exit}
          </a>
        )}
      </div>
    </>
  );
}

/** English, नेपाली or 中文 for the tour's own words (lib/i18n.ts). */
function LangPicker({ className }: { className: string }) {
  const t = useT();
  return (
    <select className={`vw-lang ${className}`} value={t.lang} onChange={(e) => setLang(e.target.value as Lang)}
      aria-label={t('Language')} title={t('Language')}>
      {LANGS.map(([l, name]) => <option key={l} value={l} lang={l}>{name}</option>)}
    </select>
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
  const t = useT();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const step = (k: number) => {
    const j = (k + MODES.length) % MODES.length;
    setVisitorMode(MODES[j][0]);
    refs.current[j]?.focus();
  };

  return (
    <div
      className="vw-rail" role="radiogroup" aria-label={t('How to move')}
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
            <span className="vw-rail-name">{t(label)}</span>
            {k === i && <span className="vw-rail-promise">{t(promise)}</span>}
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
  const t = useT();
  const exit = mode === 'fly' ? t('Exit fly mode') : t('Exit orbit');
  const boost = walkerCfg.flyBoost;
  return (
    <div className="vw-flybar" role="group" aria-label={mode === 'fly' ? t('Fly controls') : t('Orbit controls')}>
      {mode === 'fly' ? (
        <>
          <button className="vw-tb" onClick={() => { scaleFlySpeed(1 / 1.5); bump(); }} aria-label={t('Fly slower')} title={t('Slower')}>{Icon.minus}</button>
          <span className="vw-speed" aria-live="polite">{boost >= 1 ? boost.toFixed(boost < 10 ? 1 : 0) : boost.toFixed(2)}×</span>
          <button className="vw-tb" onClick={() => { scaleFlySpeed(1.5); bump(); }} aria-label={t('Fly faster')} title={t('Faster')}>{Icon.plus}</button>
        </>
      ) : (
        <>
          <button className="vw-tb" onClick={() => zoomOrbit(1.25)} aria-label={t('Zoom out')} title={t('Zoom out')}>{Icon.minus}</button>
          <button className="vw-tb" onClick={() => zoomOrbit(0.8)} aria-label={t('Zoom in')} title={t('Zoom in')}>{Icon.plus}</button>
        </>
      )}
      <button className="vw-tb vw-tb-wide" onClick={() => state.flyReset()} aria-label={t('Reset view')}>{Icon.recenter}<span>{t('Reset view')}</span></button>
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
  const t = useT();
  const here = dayNightPair(state.activeId)?.day ?? state.activeId; // a night version shows as its day space
  // On a site with buildings or floors, the rail lists this floor's spaces; PlacePicker changes floor.
  const spaces = hasPlaces()
    ? tourSpaces().filter((s) => (s.building ?? '') === (SCENE_BY_ID[here]?.building ?? '') && (s.floor ?? '') === (SCENE_BY_ID[here]?.floor ?? ''))
    : tourSpaces();
  if (spaces.length < 2) return null;
  const at = Math.max(0, spaces.findIndex((s) => s.id === here));
  return (
    <nav className="vw-layers" aria-label={t('Spaces')} style={{ '--at': at } as React.CSSProperties}>
      <span className="vw-layers-head">{t('Spaces')}</span>
      <span className="vw-layers-list">
        {/* the spine, and the accent marker that glides to where you are */}
        <span className="vw-layers-spine" aria-hidden />
        <span className="vw-layers-marker" aria-hidden />
        {spaces.map((s, i) => {
          const on = s.id === here;
          return (
            <button
              key={s.id} className={`vw-layer ${on ? 'on' : ''} ${on && state.loading ? 'is-loading' : ''}`}
              aria-current={on ? 'true' : undefined}
              disabled={state.loading && !on} onClick={() => !on && state.select(sameTimeOfDay(state.activeId, s.id))} title={s.name}
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
  const t = useT();


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
                ? <img className="vw-card-img" src={apiUrl(vp.thumb)!} alt="" loading="lazy" />
                : <span className="vw-card-ph" aria-hidden>{Icon.views}</span>}
              {showLabels && <span className="vw-card-nm">{vp.label}</span>}
            </button>
          ))}
        </div>
      )}

      {/* The tour bar: ‹ Scenes, start over | play/pause › */}
      <div className={`vw-tourbar ${playing ? 'is-playing' : ''}`} role="toolbar" aria-label={t('Tour')}>
        <button className="vw-tourbar-btn" onClick={() => go(idx < 0 ? vps.length - 1 : idx - 1)} aria-label={t('Previous scene')} title={t('Previous scene')}>{Icon.chevL}</button>
        <button className={`vw-tourbar-views ${trayOpen ? 'on' : ''}`} onClick={onToggleTray} aria-pressed={trayOpen} title={t('Scenes')}>
          {Icon.views}<span>{t('Scenes')}</span>
        </button>
        <button className="vw-tourbar-btn" onClick={() => go(0)} aria-label={t('Start over')} title={t('Start over')}>{Icon.restart}</button>
        <span className="vw-tourbar-sep" aria-hidden />
        <button className="vw-tourbar-btn vw-tourbar-play" onClick={() => (playing ? pause() : playAll())}
          aria-label={playing ? t('Pause') : t('Play the tour')} title={playing ? t('Pause') : t('Play the tour')}>
          {playing ? Icon.pause : Icon.play}
        </button>
        <button className="vw-tourbar-btn" onClick={() => go(idx + 1)} aria-label={t('Next scene')} title={t('Next scene')}>{Icon.chevR}</button>
      </div>
    </div>
  );
}

/**
 * Buildings and floors (2026-09-28), for campuses and large hotels: which
 * building you're in (a choice when there are several) and its floors as
 * lift buttons, top floor first. Picking one goes to that floor's first
 * space, at the same time of day. Hidden on a site that has neither.
 */
function PlacePicker({ state }: { state: ViewerState }) {
  const t = useT();
  if (!hasPlaces()) return null;
  const here = dayNightPair(state.activeId)?.day ?? state.activeId;
  const map = placesMap();
  const b = map.find((x) => x.name === (SCENE_BY_ID[here]?.building ?? '')) ?? map[0];
  const floor = SCENE_BY_ID[here]?.floor ?? '';
  const go = (to?: { id: string }) => { if (to && to.id !== here && !state.loading) state.select(sameTimeOfDay(state.activeId, to.id)); };
  return (
    <span className="vw-places" aria-label={t('Where you are')}>
      {map.length > 1 && (
        <select value={b.name} aria-label={t('Building')} disabled={state.loading}
          onChange={(e) => go(map.find((x) => x.name === e.target.value)?.floors[0]?.spaces[0])}>
          {map.map((x) => <option key={x.name} value={x.name}>{x.name || t('Other spaces')}</option>)}
        </select>
      )}
      {b.floors.length > 1 && (
        <span className="vw-floors" role="group" aria-label={t('Floors')}>
          {[...b.floors].reverse().map((f) => (
            <button key={f.name} type="button" className={f.name === floor ? 'on' : ''} aria-current={f.name === floor ? 'true' : undefined}
              disabled={state.loading} onClick={() => go(f.spaces[0])}>{f.name || t('Other spaces')}</button>
          ))}
        </span>
      )}
    </span>
  );
}

/** A view's narration, in words, while it plays: for everyone, sound on or off. */
function NarrationCaption() {
  const sound = useSound();
  if (!sound.playing || !sound.caption) return null;
  return <p className="vw-caption" role="status" aria-live="polite">{sound.caption}</p>;
}

function SpacesPanel({ state, onClose }: { state: ViewerState; onClose: () => void }) {
  const t = useT();
  return (
    <div className="vw-pop vw-pop-spaces" role="dialog" aria-label={t('Spaces')}>
      <p className="vw-pop-title">{t('Spaces')}</p>
      {placesMap().flatMap((b) => b.floors.map((f) => (
        <div key={`${b.name}/${f.name}`} className="vw-space-group">
          {hasPlaces() && (b.name || f.name) && <p className="vw-space-where">{[b.name, f.name].filter(Boolean).join(' · ')}</p>}
          {f.spaces.map((s) => (
            <button key={s.id} className={`vw-space ${s.id === (dayNightPair(state.activeId)?.day ?? state.activeId) ? 'on' : ''}`}
              disabled={state.loading} onClick={() => { state.select(sameTimeOfDay(state.activeId, s.id)); onClose(); }}>
              <span className="vw-space-tile" aria-hidden>{s.name.trim()[0]}</span>
              <span className="vw-space-txt">
                <span className="vw-space-nm">{s.name}</span>
                {s.tagline && <span className="vw-space-sub">{s.tagline}</span>}
              </span>
            </button>
          ))}
        </div>
      )))}
    </div>
  );
}

function HelpPanel({ walking, isTouch, onClose }: { walking: boolean; isTouch: boolean; onClose: () => void }) {
  const t = useT();
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
    <div className="vw-pop vw-pop-help" role="dialog" aria-label={t('Controls')}>
      <p className="vw-pop-title">{t('Controls')}</p>
      {rows.map(([k, v]) => (
        <p key={k} className="vw-help-row"><span className="vw-help-k">{t(k)}</span><span>{t(v)}</span></p>
      ))}
      <button className="vw-pop-close" onClick={onClose}>{t('Close')}</button>
    </div>
  );
}

function FirstRunHint({ walking, aerial, fly }: { walking: boolean; aerial: boolean; fly: boolean }) {
  const [gone, setGone] = useState(false);
  const tr = useT();
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
          <span className="vw-hint-k">W A S D</span> {tr('fly')}<span className="vw-hint-sep" />
          <span className="vw-hint-k">E</span> {tr('up')} <span className="vw-hint-k">Q</span> {tr('down')}<span className="vw-hint-sep" />
          <span className="vw-hint-k">Shift</span> {tr('faster')}<span className="vw-hint-sep" />
          <span className="vw-hint-k">{tr('Drag')}</span> {tr('to look')}<span className="vw-hint-sep" />
          <span className="vw-hint-k">{tr('Scroll')}</span> {tr('speed')}
        </>
      ) : aerial ? (
        <><span className="vw-hint-k">{tr('Drag')}</span> {tr('to circle the space')}<span className="vw-hint-sep" /><span className="vw-hint-k">{tr('Scroll')}</span> {tr('to zoom')}</>
      ) : (<>
      <span className="vw-hint-k">{tr('Drag')}</span> {tr('to look around')}
      <span className="vw-hint-sep" />
      {walking
        ? <><span className="vw-hint-k">W A S D</span> {tr('to walk')}</>
        : <><span className="vw-hint-k">{tr('Walk')}</span> {tr('to move freely')}</>}
      </>)}
    </div>
  );
}
