'use client';

import { use, useCallback, useEffect, useState } from 'react';
import {
  getProperty, getReservations, setReservationStatus, type Reservation, type ReservationStatus, type SiteBooking
} from '../../../../lib/api';
import { useStudioSession } from '../../../../lib/useStudioSession';
import '../../../../components/editor.css';
import '../site/site-editor.css';

type Tab = 'reply' | 'upcoming' | 'past' | 'all';
const LABEL: Record<ReservationStatus, string> = { requested: 'Waiting for you', confirmed: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled' };

const dayName = (date: string, today: string) => {
  const diff = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  const long = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return diff === 0 ? `Today · ${long}` : diff === 1 ? `Tomorrow · ${long}` : long;
};

/**
 * A restaurant's table bookings (/studio/<project>/reservations), made on
 * its website's floor plan. New ones wait for a reply: Confirm or Decline
 * (the guest is emailed, if they left an address). Checks for new ones
 * every 30 seconds while it's open.
 */
export default function ReservationsPage({ params }: { params: Promise<{ property: string }> }) {
  const { property: id } = use(params);
  const ok = useStudioSession(`/studio/${id}/reservations`);
  const [title, setTitle] = useState('');
  const [list, setList] = useState<Reservation[] | null>(null);
  const [booking, setBooking] = useState<SiteBooking | null>(null);
  const [today, setToday] = useState('');
  const [tab, setTab] = useState<Tab>('reply');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => getReservations(id).then((r) => {
    if (!r) return;
    setList(r.reservations);
    setBooking(r.booking);
    setToday(r.today);
  }).catch((e: Error) => setError(e.message)), [id]);

  useEffect(() => {
    if (!ok) return;
    getProperty(id).then((p) => p && setTitle(p.theme?.brand || p.title)).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [ok, id, load]);

  if (!ok) return <div className="ed2-boot">Opening the studio…</div>;
  if (!list) return <div className="ed2-boot">{error || 'Loading reservations…'}</div>;

  const upcoming = (r: Reservation) => r.date >= today;
  const waiting = list.filter((r) => r.status === 'requested' && upcoming(r));
  const shown = (tab === 'reply' ? waiting
    : tab === 'upcoming' ? list.filter((r) => upcoming(r) && ['requested', 'confirmed'].includes(r.status))
      : tab === 'past' ? list.filter((r) => !upcoming(r)).reverse()
        : list);
  const days = [...new Set(shown.map((r) => r.date))];

  const set = async (r: Reservation, status: ReservationStatus) => {
    setBusy(r.id);
    setError('');
    try {
      const next = await setReservationStatus(id, r.id, status);
      if (next) setList((l) => l && l.map((x) => (x.id === r.id ? next : x)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const tableName = (r: Reservation) => r.tableLabel || booking?.tables.find((t) => t.id === r.table)?.label || r.table;

  return (
    <div className="ed2 se">
      <header className="se-bar">
        {/* plain <a>: the studio holds a page-singleton renderer and wants a full load */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/studio" className="se-back">← Projects</a>
        <div className="se-title"><b>Reservations</b><span>{title}</span></div>
        {error && <span className="se-err" role="alert">{error}</span>}
        <button onClick={load}>Refresh</button>
        <a className="se-open" href={`/studio/${encodeURIComponent(id)}/site`}>Table booking setup</a>
      </header>

      <main className="se-body">
        {!booking?.on && (
          <p className="se-warn">Table booking is off on the website. Turn it on under Website → Table booking, add your floor plan and tables, and publish.</p>
        )}
        <div className="rs-tabs" role="tablist">
          {([['reply', `Needs a reply${waiting.length ? ` (${waiting.length})` : ''}`], ['upcoming', 'Upcoming'], ['past', 'Past'], ['all', 'All']] as [Tab, string][]).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>

        {!shown.length && (
          <p className="se-hint">{tab === 'reply' ? 'Nothing waiting. New requests from the website appear here.' : 'No bookings here.'}</p>
        )}

        {days.map((d) => (
          <section key={d} className="se-card">
            <h2>{dayName(d, today)}</h2>
            <p className="se-hint">
              {shown.filter((r) => r.date === d && r.status !== 'declined' && r.status !== 'cancelled').reduce((a, r) => a + r.party, 0)} guests booked or waiting
            </p>
            {shown.filter((r) => r.date === d).map((r) => (
              <div key={r.id} className={`rs-item is-${r.status}`}>
                <div className="rs-when"><b>{r.time}</b><span>{r.party} {r.party === 1 ? 'guest' : 'guests'}</span></div>
                <div className="rs-who">
                  <b>{r.name}</b> <span className="rs-table">{tableName(r)}</span>
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
