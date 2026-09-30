'use client';

import { use, useCallback, useEffect, useState } from 'react';
import {
  getProperty, getReservations, setReservationStatus, type Reservation, type ReservationStatus, type SiteBooking, type SiteEvents, type SiteStays
} from '../../../../lib/api';
import { useStudioSession } from '../../../../lib/useStudioSession';
import '../../../../components/editor.css';
import '../site/site-editor.css';

type Tab = 'reply' | 'upcoming' | 'past' | 'all' | 'waitlist';
const LABEL: Record<ReservationStatus, string> = {
  requested: 'Waiting for you', confirmed: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled',
  waiting: 'On the waitlist', notified: 'Told it may be free', removed: 'Removed'
};

const dayName = (date: string, today: string) => {
  const diff = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  const long = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return diff === 0 ? `Today · ${long}` : diff === 1 ? `Tomorrow · ${long}` : long;
};
const shortDay = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const isStay = (r: Reservation) => r.kind === 'stay';
const isEvent = (r: Reservation) => r.kind === 'event';
/** Tables, rooms or events: the inbox's filter. */
type Kind = 'tables' | 'rooms' | 'events';
/** Book now on a hotspot in the tour (kind 'request'): a room, a hall or a table, with nothing else set up. */
const asked = (r: Reservation, of: 'room' | 'hall' | 'table') => r.kind === 'request' && r.of === of;
/** Held by the night (a stay, or a room asked for from the tour); by the part of a day (an event, or a hall asked for). */
const nightly = (r: Reservation) => isStay(r) || asked(r, 'room');
const eventish = (r: Reservation) => isEvent(r) || asked(r, 'hall');
const kindOf = (r: Reservation): Kind => (nightly(r) ? 'rooms' : eventish(r) ? 'events' : 'tables');
const SESSION: Record<string, string> = { day: 'Daytime', evening: 'Evening', full: 'Whole day' };

/**
 * A place's bookings (/studio/<project>/reservations): tables, picked on
 * its website's floor plan, rooms, listed on the day guests arrive, and
 * events, listed on their day. New
 * ones wait for a reply: Confirm or Decline (the guest is emailed, if they
 * left an address). Checks for new ones every 30 seconds while it's open.
 */
export default function ReservationsPage({ params }: { params: Promise<{ property: string }> }) {
  const { property: id } = use(params);
  const ok = useStudioSession(`/studio/${id}/reservations`);
  const [title, setTitle] = useState('');
  const [list, setList] = useState<Reservation[] | null>(null);
  const [booking, setBooking] = useState<SiteBooking | null>(null);
  const [stays, setStays] = useState<SiteStays | null>(null);
  const [events, setEvents] = useState<SiteEvents | null>(null);
  const [today, setToday] = useState('');
  const [tab, setTab] = useState<Tab>('reply');
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [staff, setStaff] = useState(false); // the client's staff: no setup to go to
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => getReservations(id).then((r) => {
    if (!r) return;
    setList(r.reservations);
    setBooking(r.booking);
    setStays(r.stays);
    setEvents(r.events ?? null);
    setToday(r.today);
  }).catch((e: Error) => setError(e.message)), [id]);

  useEffect(() => {
    if (!ok) return;
    getProperty(id).then((p) => { if (p) { setTitle(p.theme?.brand || p.title); setStaff(p.access === 'staff'); } }).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [ok, id, load]);

  if (!ok) return <div className="ed2-boot">Opening the studio…</div>;
  if (!list) return <div className="ed2-boot">{error || 'Loading reservations…'}</div>;

  // A stay is upcoming until its guests have left.
  const upcoming = (r: Reservation) => (nightly(r) ? (r.checkout ?? r.date) > today : r.date >= today);
  // The waitlist has its own tab; the other tabs are bookings.
  const waitlist = list.filter((r) => r.kind === 'wait' && (r.of === 'room' ? (r.checkout ?? r.date) > today : r.date >= today));
  const bookings = list.filter((r) => r.kind !== 'wait');
  const kinds = [...new Set(bookings.map(kindOf))];
  const both = kinds.length > 1;
  const ofKind = bookings.filter((r) => kind === 'all' || kindOf(r) === kind);
  const waiting = ofKind.filter((r) => r.status === 'requested' && upcoming(r));
  const stillWaiting = waitlist.filter((r) => r.status === 'waiting').length;
  const shown = (tab === 'waitlist' ? waitlist.filter((r) => r.status !== 'removed')
    : tab === 'reply' ? waiting
    : tab === 'upcoming' ? ofKind.filter((r) => upcoming(r) && ['requested', 'confirmed'].includes(r.status))
      : tab === 'past' ? ofKind.filter((r) => !upcoming(r)).reverse()
        : ofKind);
  const days = [...new Set(shown.map((r) => r.date))];

  const set = async (r: Reservation, status: ReservationStatus) => {
    setBusy(r.id);
    setError('');
    try {
      const next = await setReservationStatus(id, r.id, status);
      if (next) setList((l) => l && l.map((x) => (x.id === r.id ? next : x)));
      if (next?.waitlistTold) { setError(''); load(); window.alert(`${next.waitlistTold} ${next.waitlistTold === 1 ? 'guest' : 'guests'} on the waitlist can now book, and ${next.waitlistTold === 1 ? 'has' : 'have'} been told.`); }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  // a table at one of the site's other dining places says which
  const tableName = (r: Reservation) => {
    const table = r.tableLabel || (r.outlet ? '' : booking?.tables.find((t) => t.id === r.table)?.label) || r.table;
    return r.outletName ? `${r.outletName} · ${table}` : table;
  };
  const roomName = (r: Reservation) => {
    const name = r.roomLabel || stays?.rooms.find((x) => x.id === r.room)?.label || r.room || 'Room';
    return (r.rooms ?? 1) > 1 ? `${r.rooms} × ${name}` : name;
  };
  const hallName = (r: Reservation) => r.hallLabel || events?.halls.find((h) => h.id === r.hall)?.label || r.hall || 'Hall';
  // What a day adds up to: guests at tables, rooms for guests arriving, and events.
  const dayTotal = (d: string) => {
    const live = shown.filter((r) => r.date === d && r.status !== 'declined' && r.status !== 'cancelled');
    const guests = live.filter((r) => kindOf(r) === 'tables').reduce((a, r) => a + r.party, 0);
    const rooms = live.filter(isStay).reduce((a, r) => a + (r.rooms ?? 1), 0);
    const evts = live.filter(isEvent).length;
    return [guests && `${guests} ${guests === 1 ? 'guest' : 'guests'} at tables`, rooms && `${rooms} ${rooms === 1 ? 'room' : 'rooms'} for arrivals`,
      evts && `${evts} ${evts === 1 ? 'event' : 'events'}`]
      .filter(Boolean).join(' · ') || 'Nothing booked or waiting';
  };

  return (
    <div className="ed2 se">
      <header className="se-bar">
        {/* plain <a>: the studio holds a page-singleton renderer and wants a full load */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/studio" className="se-back">← Projects</a>
        <div className="se-title"><b>Reservations</b><span>{title}</span></div>
        {error && <span className="se-err" role="alert">{error}</span>}
        <button onClick={load}>Refresh</button>
        {!staff && <a className="se-open" href={`/studio/${encodeURIComponent(id)}/site`}>Booking setup</a>}
      </header>

      <main className="se-body">
        {!booking?.on && !stays?.on && !events?.on && !list.some((r) => r.kind === 'request') && (
          <p className="se-warn">{staff
            ? 'Online booking isn’t switched on for this place yet. Ask whoever runs its website to turn it on.'
            : 'Booking is off on the website. Turn on Table, Room or Event booking under Website, set it up, and publish.'}</p>
        )}
        <div className="rs-tabs" role="tablist">
          {([['reply', `Needs a reply${waiting.length ? ` (${waiting.length})` : ''}`], ['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All'], ['waitlist', `Waitlist${stillWaiting ? ` (${stillWaiting})` : ''}`]] as [Tab, string][]).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
          {both && tab !== 'waitlist' && (
            <span className="rs-kinds">
              {([['all', 'All'], ['tables', 'Tables'], ['rooms', 'Rooms'], ['events', 'Events']] as const).filter(([k]) => k === 'all' || kinds.includes(k)).map(([k, label]) => (
                <button key={k} aria-pressed={kind === k} className={kind === k ? 'is-on' : ''} onClick={() => setKind(k)}>{label}</button>
              ))}
            </span>
          )}
        </div>

        {!shown.length && (
          <p className="se-hint">{tab === 'reply' ? 'Nothing waiting. New requests from the website appear here.'
            : tab === 'waitlist' ? 'No one is waiting. When a day or dates are full, guests can join the waitlist; if you decline or cancel a booking, the ones who now fit are told by text and email.'
              : 'No bookings here.'}</p>
        )}

        {days.map((d) => (
          <section key={d} className="se-card">
            <h2>{dayName(d, today)}</h2>
            <p className="se-hint">{dayTotal(d)}</p>
            {shown.filter((r) => r.date === d).map((r) => r.kind === 'wait' ? (
              <div key={r.id} className={`rs-item is-${r.status}`}>
                <div className="rs-when">
                  <b>{r.of === 'room' ? `${r.nights} ${r.nights === 1 ? 'night' : 'nights'}` : r.time || 'Any time'}</b>
                  <span>{r.party} {r.party === 1 ? 'guest' : 'guests'}</span>
                </div>
                <div className="rs-who">
                  <b>{r.name}</b> <span className="rs-table">{r.of === 'room' ? r.roomLabel || 'Any room' : 'A table'}</span>
                  {r.of === 'room' && <p className="rs-stay">{shortDay(r.date)} → {shortDay(r.checkout ?? r.date)}</p>}
                  <div className="rs-contact">
                    <a href={`tel:${r.phone}`}>{r.phone}</a>
                    {r.email && <a href={`mailto:${r.email}`}>{r.email}</a>}
                  </div>
                  {r.notifiedAt && <p className="se-hint">Told {new Date(r.notifiedAt).toLocaleString()}</p>}
                </div>
                <div className="rs-act">
                  <span className={`rs-status is-${r.status}`}>{LABEL[r.status]}</span>
                  <button disabled={busy === r.id} onClick={() => set(r, 'notified')}>{r.status === 'notified' ? 'Tell again' : 'Tell them it’s free'}</button>
                  <button disabled={busy === r.id} onClick={() => set(r, 'removed')}>Remove</button>
                </div>
              </div>
            ) : (
              <div key={r.id} className={`rs-item is-${r.status}`}>
                {nightly(r) ? (
                  <div className="rs-when"><b>{r.nights} {r.nights === 1 ? 'night' : 'nights'}</b><span>{r.party} {r.party === 1 ? 'guest' : 'guests'}</span></div>
                ) : eventish(r) ? (
                  <div className="rs-when"><b>{SESSION[r.session ?? ''] ?? r.session}</b><span>{r.party} guests</span></div>
                ) : (
                  <div className="rs-when"><b>{r.time}</b><span>{r.party} {r.party === 1 ? 'guest' : 'guests'}</span></div>
                )}
                <div className="rs-who">
                  <b>{r.name}</b> <span className="rs-table">{r.kind === 'request' ? [r.item, r.occasion].filter(Boolean).join(' · ')
                    : isStay(r) ? roomName(r) : isEvent(r) ? `${r.occasion} · ${hallName(r)}` : tableName(r)}</span>
                  {nightly(r) && <p className="rs-stay">{shortDay(r.checkin ?? r.date)} → {shortDay(r.checkout ?? r.date)}</p>}
                  {r.kind === 'request' && (
                    <p className="se-hint">{[`Book now in the tour (${r.spaceTitle})`, r.price, r.deposit && `deposit ${r.deposit}`].filter(Boolean).join(' · ')}</p>
                  )}
                  <div className="rs-contact">
                    <a href={`tel:${r.phone}`}>{r.phone}</a>
                    {r.email && <a href={`mailto:${r.email}`}>{r.email}</a>}
                  </div>
                  {r.notes && <p className="rs-notes">“{r.notes}”</p>}
                  {r.delivery && !r.delivery.sent && <p className="se-hint">Not emailed to you: {r.delivery.reason}</p>}
                </div>
                <div className="rs-act">
                  <span className={`rs-status is-${r.status}`}>{LABEL[r.status]}</span>
                  {r.status === 'requested' && (
                    <>
                      <button className="se-main" disabled={busy === r.id} onClick={() => set(r, 'confirmed')}>Confirm</button>
                      <button disabled={busy === r.id} onClick={() => set(r, 'declined')}>Decline</button>
                    </>
                  )}
                  {r.status === 'confirmed' && <button disabled={busy === r.id} onClick={() => set(r, 'cancelled')}>Cancel</button>}
                  {(r.status === 'declined' || r.status === 'cancelled') && upcoming(r) && (
                    <button disabled={busy === r.id} onClick={() => set(r, 'requested')}>Reopen</button>
                  )}
                </div>
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
