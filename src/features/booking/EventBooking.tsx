'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  API_BASE_URL, getEventCalendar, requestEvent, type EventCalendar, type EventHall, type EventSession, type SiteEvents
} from '../../lib/api';
import './table-booking.css';

const asset = (p: string) => `${API_BASE_URL}/api/assets/${p}`;
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const SESSIONS: [EventSession, string][] = [['day', 'Daytime'], ['evening', 'Evening'], ['full', 'Whole day']];
/** The whole day clashes with either half (server/src/events.js). */
const clash = (a: EventSession, b: EventSession) => a === 'full' || b === 'full' || a === b;
const holds = (h: EventHall) => [h.seated && `Seats ${h.seated}`, h.standing && `${h.standing} standing`, h.area].filter(Boolean).join(' · ');

/**
 * Plan an event (the website's #events, and the tour's Plan an event): the
 * venue's halls, as cards like the rooms, then the day, the part of the day,
 * how many and what kind of event. A hall already taken then can't be
 * picked. Requests wait for the venue to confirm, like any booking.
 */
export function EventBooking({ project, events, preview = false, initialHall = '', onView, tour = false }: {
  project: string; events: SiteEvents;
  /** The studio's preview: nothing is sent. */
  preview?: boolean;
  /** A hall already chosen ("Book this hall" in its 3D space). */
  initialHall?: string;
  /** Show a hall in 3D: inside the tour it flies there itself; on the website, its embedded tour. */
  onView?: (h: EventHall) => void;
  tour?: boolean;
}) {
  const [cal, setCal] = useState<EventCalendar | null>(null);
  const [hall, setHall] = useState(events.halls.some((h) => h.id === initialHall) ? initialHall : '');
  // A website chapter's "Book this hall" (SiteParts BookThisHall) picks it here.
  useEffect(() => {
    const pick = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (events.halls.some((h) => h.id === id)) setHall(id); };
    window.addEventListener('rcaas:hall', pick);
    return () => window.removeEventListener('rcaas:hall', pick);
  }, [events.halls]);
  const [date, setDate] = useState('');
  const [session, setSession] = useState<EventSession | ''>('');
  const [guests, setGuests] = useState('');
  const [occasion, setOccasion] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', website: '' });
  const [renderedAt] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ hall: string; date: string; session: string; occasion: string; email: boolean } | null>(null);

  const load = useCallback(() => {
    if (!preview) getEventCalendar(project).then(setCal).catch(() => setCal(null));
  }, [project, preview]);
  useEffect(load, [load]);

  const chosen = events.halls.find((h) => h.id === hall) ?? null;
  const held = (hallId: string) => (date ? cal?.taken[hallId]?.[date] ?? [] : []);
  const free = (hallId: string, s: EventSession) => !held(hallId).some((x) => clash(x, s));
  const most = chosen ? Math.max(chosen.seated, chosen.standing) : 0;
  const n = Number(guests);
  const ready = !!chosen && !!date && !!session && free(chosen.id, session) && Number.isInteger(n) && n >= 1 && n <= most && !!occasion;

  const view = (h: EventHall) => {
    if (onView) return onView(h);
    const frame = document.getElementById('ws-tour') as HTMLIFrameElement | null;
    if (!frame) return;
    frame.scrollIntoView({ behavior: 'smooth', block: 'center' });
    frame.contentWindow?.postMessage({ type: 'rcaas:view', space: h.space, view: h.view }, location.origin);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || !chosen || !session || preview) return;
    if (!form.name.trim() || !form.phone.trim()) return setError('Add your name and phone, so we can confirm.');
    setSending(true);
    setError('');
    try {
      await requestEvent(project, { hall: chosen.id, date, session, guests: n, occasion, formRenderedAt: renderedAt, ...form });
      setDone({ hall: chosen.label, date, session: SESSIONS.find(([k]) => k === session)![1], occasion, email: !!form.email.trim() });
      setDate('');
      setSession('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
      load(); // what's taken now, including anything booked meanwhile
    }
  };

  return (
    <div className="tb rb eb">
      <div className="tb-panel">
        {done ? (
          <div className="tb-done" role="status">
            <svg className="tb-tick" viewBox="0 0 52 52" aria-hidden><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
            <h3>Request sent</h3>
            <p>{done.occasion} in {done.hall}, {day(done.date)} ({done.session.toLowerCase()}).</p>
            <p className="tb-dim">We&apos;ll be in touch by phone{done.email ? ' or email' : ''} shortly. Nothing is booked until we confirm.</p>
            <button type="button" className="tb-ghost" onClick={() => setDone(null)}>Plan another event</button>
          </div>
        ) : (
          <>
            <Step n={1} done={!!chosen} title="Hall" />
            <div className="tb-choice">
              {chosen ? (
                <div className="tb-card">
                  <b>{chosen.label}</b>
                  <span>{holds(chosen)}</span>
                  {chosen.space && (onView || tour) && <button type="button" className="tb-link" onClick={() => view(chosen)}>See this hall in 3D →</button>}
                </div>
              ) : <p className="tb-dim">Pick a hall from the list.</p>}
            </div>

            <Step n={2} done={!!date && !!session} title="Day" />
            <label className="eb-field">
              <span className="tb-dim">The day of your event</span>
              <input type="date" value={date} min={cal?.first} max={cal?.last} onChange={(e) => { setDate(e.target.value); setError(''); }} />
            </label>
            <div className="eb-sessions" role="group" aria-label="Part of the day">
              {SESSIONS.map(([k, label]) => {
                const open = !chosen || !date || free(chosen.id, k);
                return (
                  <button key={k} type="button" aria-pressed={session === k} className={session === k ? 'is-on' : ''}
                    disabled={!open} onClick={() => setSession(k)}>{label}{!open && <small>taken</small>}</button>
                );
              })}
            </div>

            <Step n={3} done={Number.isInteger(n) && n >= 1 && !!occasion} title="Guests and event" />
            <div className="tb-row">
              <label className="eb-field">
                <span className="tb-dim">How many guests{most ? ` (up to ${most})` : ''}</span>
                <input type="number" inputMode="numeric" min={1} max={most || undefined} value={guests} onChange={(e) => setGuests(e.target.value)} />
              </label>
              <label className="eb-field">
                <span className="tb-dim">What kind of event</span>
                <select value={occasion} onChange={(e) => setOccasion(e.target.value)}>
                  <option value="">Choose one</option>
                  {events.kinds.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
            </div>
            {chosen && n > most && <p className="tb-err">{chosen.label} takes {most} at most. Pick a bigger hall, or call us.</p>}
          </>
        )}
      </div>

      {!done && (
        <div className="tb-form">
          {ready && chosen && (
            <form className="tb-details" onSubmit={submit} noValidate>
              <div className="tb-row">
                <label><span>Name</span><input value={form.name} maxLength={100} autoComplete="name" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label><span>Phone</span><input type="tel" value={form.phone} maxLength={30} autoComplete="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              </div>
              <label><span>Email <em>optional, for the confirmation</em></span><input type="email" value={form.email} maxLength={200} autoComplete="email" onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label><span>Tell us about it <em>optional</em></span><textarea rows={2} value={form.notes} maxLength={500} placeholder="Catering, decoration, a stage, the timings…" onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
              {/* honeypot: hidden from people, filled by bots */}
              <label className="tb-hp" aria-hidden="true"><span>Leave empty</span><input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
              <button className="tb-go" type="submit" disabled={sending || preview}>
                {preview ? 'Preview: bookings open once you publish' : sending ? 'Sending…' : `Request ${chosen.label} · ${day(date)}`}
              </button>
            </form>
          )}
          {error && <p className="tb-err" role="alert">{error}</p>}
          {events.note && <p className="tb-dim tb-fine">{events.note}</p>}
        </div>
      )}

      <div className="rb-side">
        <div className="rb-rooms">
          {events.halls.map((h) => {
            const on = hall === h.id;
            const open = SESSIONS.filter(([k]) => free(h.id, k)).map(([, label]) => label);
            const takenAll = !!date && !open.length;
            return (
              <article key={h.id} className={`rb-room is-${takenAll ? 'full' : 'free'}${on ? ' is-on' : ''}`}>
                <button type="button" className="rb-room-pick" disabled={!!done} aria-pressed={on} onClick={() => { setHall(h.id); setError(''); }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- the venue's photo */}
                  {h.image ? <img src={asset(h.image)} alt="" loading="lazy" /> : <span className="rb-room-ph" aria-hidden />}
                  <span className="rb-room-txt">
                    <b>{h.label}</b>
                    <span className="tb-dim">{holds(h)}</span>
                    {h.price && <span className="rb-price"><b>{h.price}</b></span>}
                    {h.deposit && <span className="tb-dim">Deposit: {h.deposit}</span>}
                    {h.features && <span className="rb-feats">{h.features.split(/\s*[·,]\s*/).filter(Boolean).slice(0, 4).map((f) => <em key={f}>{f}</em>)}</span>}
                    {date && (
                      <span className={`rb-left is-${takenAll ? 'full' : 'free'}`}>
                        {takenAll ? `Taken on ${day(date)}` : open.length === SESSIONS.length ? 'Free that day' : `${open.join(', ')} free`}
                      </span>
                    )}
                  </span>
                  {on && <span className="rb-check" aria-hidden>✓</span>}
                </button>
                {h.space && (onView || tour) && <button type="button" className="tb-link rb-3d" onClick={() => view(h)}>See it in 3D →</button>}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, done }: { n: number; title: string; done: boolean }) {
  return (
    <p className={`tb-step${done ? ' is-done' : ''}`}>
      <span aria-hidden>{done ? '✓' : n}</span>{title}
    </p>
  );
}
