'use client';

import { Fragment, useEffect, useReducer, useState } from 'react';
import { projected } from '../lib/hotspotProjector';
import { hotspotsFor, subscribeDoc } from '../lib/sceneDoc';
import { SCENE_BY_ID } from '../lib/scenes';
import { cardBox, nearestIds, showsCard } from '../lib/hotspotLayout';
import { apiUrl, resolveAsset, safeUrl, type EventHall, type SiteBooking, type StayRoom } from '../lib/api';
import { bookableTable } from '../lib/booking';
import { playClip, setMuted, stopClip, unlockAudio, useSound } from '../lib/audio';
import type { Hotspot, HotspotType, ProjectedHotspot } from '../@types/hotspot.types';
import { useT } from '../lib/i18n';
import './hotspots.css';

const ICON: Record<HotspotType, string> = { image: '▣', video: '▶', text: 'i', link: '↗', portal: '⤢', audio: '♪', table: '◎', room: '⌂', hall: '◇' };
/** How many hotspots show their card at once; the rest are rings until hovered. */
const CARDS_AT_ONCE = 4;

const Speaker = () => (
  <svg className="hs-spk" viewBox="0 0 24 24" aria-hidden>
    <path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
  </svg>
);

/** One line of context under a card's title. */
function blurbFor(h: Hotspot): string {
  const p = h.payload ?? {};
  if (h.type === 'portal') return p.sceneId ? `Go to ${SCENE_BY_ID[p.sceneId]?.name ?? 'another space'}` : '';
  return p.caption || p.text || p.transcript || '';
}

const sig = (list: ProjectedHotspot[]) =>
  list.map((m) => `${m.id}:${m.x | 0}:${m.y | 0}`).join('|');

interface HotspotMarkersProps {
  sceneId: string;
  mode?: 'view' | 'edit';
  selId?: string;
  onSelect?: (id: string) => void;
  onOpen?: (id: string) => void;
}

/**
 * Hotspots drawn over the scene as callouts: a ring on the spot, a leader
 * line, and a card with a thumbnail, the title and one line of text. Works
 * the same in every camera mode — walk, fly, orbit or a viewpoint — because
 * it only reads the per-frame screen projection (hotspotProjector.ts).
 * Shared by the tour (tap = open) and the studio (tap = select).
 */
export function HotspotMarkers({ sceneId, mode = 'view', selId, onSelect, onOpen }: HotspotMarkersProps) {
  const [marks, setMarks] = useState<ProjectedHotspot[]>([]);
  const [hover, setHover] = useState<string | null>(null);
  const [, bump] = useReducer((n) => n + 1, 0);
  useEffect(() => subscribeDoc(bump), []); // a label or image edited in the studio

  useEffect(() => {
    let raf: number, last = 0, prevSig = '';
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < 33) return;
      last = t;
      const next = projected.list.filter((m) => m.onScreen);
      const s = sig(next);
      if (s === prevSig) return; // nothing moved -> no re-render
      prevSig = s;
      setMarks(next);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const w = window.innerWidth;
  const h = window.innerHeight;
  const byId = new Map(hotspotsFor(sceneId).map((x) => [x.id, x]));
  const carded = nearestIds(marks, CARDS_AT_ONCE);
  const activate = (id: string) => {
    if (mode === 'edit') { onSelect?.(id); return; }
    unlockAudio(); // still inside the tap, so iOS will let the clip play
    onOpen?.(id);
  };

  const shown = marks.map((m) => {
    const hs = byId.get(m.id);
    const showCard = showsCard(hs?.payload?.reveal, m.dist, carded.has(m.id)) || hover === m.id || (mode === 'edit' && m.id === selId);
    return { m, hs, box: showCard ? cardBox(m.x, m.y, w, h) : null };
  });

  return (
    <div className="hs-layer">
      <svg className="hs-lines" width={w} height={h} aria-hidden>
        {shown.map(({ m, box }) => box && (
          <line key={m.id} x1={m.x} y1={m.y} x2={box.lineX} y2={box.lineY} />
        ))}
      </svg>

      {shown.map(({ m, hs, box }) => {
        const sel = mode === 'edit' && m.id === selId;
        const p = hs?.payload ?? {};
        const thumb = hs?.type === 'image' ? resolveAsset(p.url) : null;
        const blurb = hs ? blurbFor(hs) : '';
        return (
          <Fragment key={m.id}>
            <button
              className={`hs-ring ${sel ? 'hs-sel' : ''}`}
              style={{ transform: `translate(${m.x.toFixed(1)}px, ${m.y.toFixed(1)}px) translate(-50%, -50%)` }}
              onClick={() => activate(m.id)}
              onMouseEnter={() => setHover(m.id)}
              onMouseLeave={() => setHover((v) => (v === m.id ? null : v))}
              aria-label={m.label}
            >
              <span className="hs-ring-dot" />
            </button>

            {box && (
              <button
                className={`hs-card ${sel ? 'hs-sel' : ''}`}
                style={{ transform: `translate(${box.left.toFixed(1)}px, ${box.top.toFixed(1)}px)` }}
                onClick={() => activate(m.id)}
                onMouseEnter={() => setHover(m.id)}
                onMouseLeave={() => setHover((v) => (v === m.id ? null : v))}
              >
                {thumb
                  ? <img className="hs-card-img" src={thumb} alt="" loading="lazy" decoding="async" />
                  : <span className="hs-card-ic" aria-hidden>{ICON[m.type] ?? '•'}</span>}
                <span className="hs-card-txt">
                  <span className="hs-card-title">{m.label}{p.audio && <Speaker />}</span>
                  {blurb && <span className="hs-card-blurb">{blurb}</span>}
                </span>
              </button>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * The panel a visitor opens by tapping a hotspot. Plays its audio straight
 * away if they already have sound on; otherwise offers Listen. The
 * transcript is always there, so a muted visitor misses nothing (§6.3).
 */
interface HotspotPanelProps {
  sceneId: string;
  id: string;
  onClose: () => void;
  onPortal?: (sceneId: string) => void;
  /** A table hotspot's Reserve this table (at its dining place); absent while the project takes no table bookings. */
  onReserve?: (tableId: string, outlet: string) => void;
  /** The dining places taking table bookings, so a table books only at its own place (booking.ts bookableTable). */
  places?: SiteBooking[];
  /** A room hotspot's room types and Book this room; absent while the project takes no room bookings. */
  rooms?: StayRoom[];
  onBookRoom?: (roomId: string) => void;
  /** A hall hotspot's halls and Book this hall; absent while the project takes no event bookings. */
  halls?: EventHall[];
  onBookHall?: (hallId: string) => void;
  /** Book now on the hotspot itself (HotspotBookCard): for a room, hall or table the website doesn't take bookings for. */
  onBookHere?: (hotspotId: string) => void;
}

const photo = (path: string) => apiUrl(`/api/assets/${path}`)!;

export function HotspotPanel({ sceneId, id, onClose, onPortal, onReserve, places, rooms, onBookRoom, halls, onBookHall, onBookHere }: HotspotPanelProps) {
  const [, bump] = useReducer((n) => n + 1, 0);
  useEffect(() => subscribeDoc(bump), []);
  const sound = useSound();
  const t = useT();

  const hs = hotspotsFor(sceneId).find((h) => h.id === id);
  const pl = hs?.payload ?? {};
  const audioUrl = resolveAsset(pl.audio);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Sound already on: the tap that opened this is the gesture, so just play.
  // Leaving the hotspot always stops its clip.
  useEffect(() => {
    if (audioUrl && !sound.muted) playClip(audioUrl);
    return () => stopClip();
  }, [audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps -- mute state at open time only

  if (!hs) return null;
  const media = resolveAsset(pl.url);
  const link = safeUrl(pl.url);
  const playing = !!audioUrl && sound.playing === audioUrl;
  const loadingClip = !!audioUrl && sound.loading === audioUrl;

  const listen = () => {
    if (!audioUrl) return;
    if (playing || loadingClip) { stopClip(); return; }
    if (sound.muted) setMuted(false); // asking to listen is asking for sound
    playClip(audioUrl);
  };

  return (
    <>
      <div className="hs-scrim" onClick={onClose} />
      <div className="hs-panel" role="dialog" aria-label={hs.label}>
        <button className="hs-panel-x" onClick={onClose} aria-label={t('Close')}>✕</button>
        <div className="hs-panel-title">{hs.label}</div>

        {audioUrl && (
          <div className="hs-audio">
            <button className={`hs-listen ${playing ? 'on' : ''}`} onClick={listen} aria-pressed={playing}>
              <Speaker />
              <span>{loadingClip ? t('Loading…') : playing ? t('Stop') : t('Listen')}</span>
            </button>
            {sound.error && <span className="hs-audio-note">{t(sound.error)}</span>}
          </div>
        )}

        {hs.type === 'image' && media && (
          <img className="hs-panel-img" src={media} alt={pl.caption || hs.label} />
        )}
        {hs.type === 'image' && pl.caption && <p className="hs-panel-body">{pl.caption}</p>}

        {hs.type === 'video' && media && (
          <video className="hs-panel-img" src={media} controls playsInline />
        )}

        {hs.type === 'text' && <p className="hs-panel-body">{pl.text || t('No text yet.')}</p>}

        {hs.type === 'link' && link && (
          <a className="hs-panel-link" href={link} target="_blank" rel="noopener noreferrer">
            {pl.text || t('Open')}
          </a>
        )}

        {hs.type === 'portal' && (
          <button
            className="hs-panel-link"
            onClick={() => { if (pl.sceneId) onPortal?.(pl.sceneId); onClose(); }}
          >
            {t('Go to {place}', { place: SCENE_BY_ID[pl.sceneId ?? '']?.name ?? t('the next space') })}
          </button>
        )}

        {(hs.type === 'table' || hs.type === 'room' || hs.type === 'hall') && (() => {
          // The website's booking, with live availability, when it takes bookings for this very item;
          // otherwise the hotspot's own details and Book now (a request the team confirms).
          const room = hs.type === 'room' && onBookRoom ? rooms?.find((x) => x.id === pl.roomId) : undefined;
          const hall = hs.type === 'hall' && onBookHall ? halls?.find((x) => x.id === pl.hallId) : undefined;
          const table = hs.type === 'table' && onReserve ? bookableTable(places, pl.outlet, pl.tableId) : null;
          const img = room?.image || hall?.image;
          const facts = room ? [room.label, t('Sleeps {n}', { n: room.sleeps }), room.area]
            : hall ? [hall.label, hall.seated && t('Seats {n}', { n: hall.seated }), hall.standing && t('{n} standing', { n: hall.standing }), hall.area]
              : [hs.type === 'room' && pl.capacity ? t('Sleeps {n}', { n: pl.capacity }) : '', hs.type !== 'room' && pl.capacity ? t('Seats {n}', { n: pl.capacity }) : '',
                hs.type === 'hall' && pl.standing ? t('{n} standing', { n: pl.standing }) : ''];
          const price = room?.price ? `${room.price} ${room.per}`.trim() : hall?.price || (hs.type !== 'table' ? pl.price : '');
          const deposit = room?.deposit || hall?.deposit || (hs.type !== 'table' ? pl.deposit : '');
          const book = room ? () => onBookRoom!(room.id) : hall ? () => onBookHall!(hall.id) : table ? () => onReserve!(table.tableId, table.outlet)
            : onBookHere ? () => onBookHere(hs.id) : null;
          const label = hs.type === 'table' ? t('Reserve this table') : hs.type === 'room' ? t('Book this room') : t('Book this hall');
          return (
            <>
              {img && <img className="hs-panel-img hs-book-img" src={photo(img)} alt="" />}
              {pl.text && <p className="hs-panel-body">{pl.text}</p>}
              {facts.some(Boolean) && <p className="hs-panel-body hs-book-facts">{facts.filter(Boolean).join(' · ')}</p>}
              {price && <p className="hs-book-price"><b>{price}</b></p>}
              {deposit && <p className="hs-panel-body hs-book-facts">{t('Deposit')}: {deposit}</p>}
              {book ? <button className="hs-panel-link" onClick={book}>{label}</button>
                : <p className="hs-panel-body">{t('Ask about this space to book it.')}</p>}
            </>
          );
        })()}

        {(audioUrl || hs.type === 'audio') && pl.transcript && (
          <details className="hs-transcript" open={sound.muted || !audioUrl}>
            <summary>{t('Transcript')}</summary>
            <p>{pl.transcript}</p>
          </details>
        )}
      </div>
    </>
  );
}
