'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  API_BASE_URL, getPreviewStayCalendar, getStayCalendar, requestStay, type SiteStays, type StayCalendar, type StayRoom
} from '../lib/api';
import { freeForStay, nightsBetween, roomsNeeded } from '../lib/booking';

import { WaitlistForm } from './WaitlistForm';
import './table-booking.css';

gsap.registerPlugin(useGSAP);

type RoomState = 'free' | 'full' | 'small';

const asset = (p: string) => `${API_BASE_URL}/api/assets/${p}`;
const utc = (d: string) => new Date(`${d}T12:00:00Z`);
const fmt = (d: string, o: Intl.DateTimeFormatOptions) => utc(d).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
const shortDay = (d: string) => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The days of a month (YYYY-MM), and how many blank cells come first in a Monday-first week. */
function monthGrid(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
  return { lead, days: Array.from({ length: count }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`) };
}
const shiftMonth = (ym: string, by: number) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

/**
 * Book a room (the website's #stay), the rooms' counterpart of TableBooking:
 * the dates on a calendar, how many guests, and the room, picked from the
 * hotel's room cards or on its site plan. The calendar shows what's possible
 * as you go (nights with nothing free are struck through, and so is any
 * check-out past the first full night); the rooms show how many are left
 * for those nights. A party bigger than a room sleeps takes more rooms of
 * it. Requests wait for the hotel to confirm, like table bookings.
 */
export function RoomBooking({ project, stays, tour = false, preview = false, initialRoom = '', onView }: {
  project: string; stays: SiteStays;
  /** The website has its live tour on the page (#ws-tour), to show a room in. */
  tour?: boolean;
  /** The studio's preview: the draft's rooms, against real bookings; nothing is sent. */
  preview?: boolean;
  /** A room already chosen ("Book this room" in the tour, or on a website chapter). */
  initialRoom?: string;
  /** Show a room in 3D; inside the tour it flies there itself. Else the website's embedded tour. */
  onView?: (r: StayRoom) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const zoom = useRef<HTMLDivElement>(null);
  const [cal, setCal] = useState<StayCalendar | null>(null);
  const [month, setMonth] = useState('');
  const [checkin, setCheckin] = useState('');
  const [checkout, setCheckout] = useState('');
  const [hoverDay, setHoverDay] = useState('');
  const [guests, setGuests] = useState(2);
  const [room, setRoom] = useState(initialRoom);
  const [side, setSide] = useState<'rooms' | 'plan'>('rooms');
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', website: '' });
  const [renderedAt] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ label: string; rooms: number; checkin: string; checkout: string; guests: number; email: boolean } | null>(null);

  const load = () => (preview ? getPreviewStayCalendar : getStayCalendar)(project)
    .then((c) => { if (c) { setCal(c); setMonth((m) => m || c.today.slice(0, 7)); } })
    .catch((e: Error) => setError(e.message));
  useEffect(() => { load(); }, [project]); // eslint-disable-line react-hooks/exhaustive-deps -- once per project

  // "Book this room" on a website chapter picks the room here.
  useEffect(() => {
    const pick = (e: Event) => { const id = (e as CustomEvent<string>).detail; if (stays.rooms.some((r) => r.id === id)) setRoom(id); };
    window.addEventListener('rcaas:stay', pick);
    return () => window.removeEventListener('rcaas:stay', pick);
  }, [stays.rooms]);

  const byId = (id: string) => stays.rooms.find((r) => r.id === id);
  const at = (d: string) => cal?.dates.indexOf(d) ?? -1;
  const need = (r: StayRoom) => roomsNeeded(guests, r.sleeps);
  const fits = (r: StayRoom) => need(r) <= r.units;
  const nights = checkin && checkout ? nightsBetween(checkin, checkout) : 0;
  // A night is open when the chosen room (else any room) has enough free for the party.
  const openOn = (d: string, r?: StayRoom) => {
    const i = at(d);
    if (i < 0 || !cal) return false;
    const ok = (x: StayRoom) => fits(x) && (cal.free[x.id]?.[i] ?? 0) >= need(x);
    return r ? ok(r) : stays.rooms.some(ok);
  };
  const leftFor = (r: StayRoom) => (cal && nights ? freeForStay(cal.dates, cal.free[r.id], checkin, checkout) : null);
  const stateOf = (r: StayRoom): RoomState => {
    if (!fits(r)) return 'small';
    const left = leftFor(r);
    return left === null || left >= need(r) ? 'free' : 'full';
  };
  const chosen = room && byId(room) && stateOf(byId(room)!) === 'free' ? byId(room)! : null;
  const ready = !!(cal && nights >= 1 && chosen);

  // The latest check-out: open nights in a row from check-in, up to the longest stay.
  const lastOut = (() => {
    if (!cal || !checkin || checkout) return '';
    const from = at(checkin);
    let k = 0;
    while (k < stays.maxNights && from + k + 1 < cal.dates.length && openOn(cal.dates[from + k], chosen ?? undefined)) k += 1;
    return k ? cal.dates[from + k] : '';
  })();
  const canOut = (d: string) => !!lastOut && d > checkin && d <= lastOut && nightsBetween(checkin, d) >= stays.minNights;
  const canIn = (d: string) => !!cal && d >= cal.today && d <= cal.lastCheckin && openOn(d, chosen ?? undefined);

  const tapDay = (d: string) => {
    setError('');
    if (checkin && !checkout && canOut(d)) return setCheckout(d);
    if (canIn(d)) { setCheckin(d); setCheckout(''); }
  };

  /* ---- motion ---- */
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const onScreen = (sel: string) => gsap.utils.toArray<Element>(sel, root.current);
  const { contextSafe } = useGSAP({ scope: root });

  // A new month slides in.
  useGSAP(() => {
    const days = onScreen('.rb-day');
    if (!reduce() && days.length) gsap.from(days, { opacity: 0, y: 6, duration: 0.3, stagger: { each: 0.008 }, ease: 'power2.out' });
  }, { scope: root, dependencies: [month] });

  // The stay fills in from check-in to check-out.
  useGSAP(() => {
    const range = onScreen('.rb-day.is-range, .rb-day.is-out');
    if (!reduce() && range.length) gsap.fromTo(range, { scale: 0.7 }, { scale: 1, duration: 0.45, stagger: 0.035, ease: 'back.out(2.5)' });
  }, { scope: root, dependencies: [checkout] });

  // Rooms ripple as what's possible changes.
  useGSAP(() => {
    if (reduce()) return;
    const free = onScreen('.rb-room.is-free:not(.is-on), .rb-pin.is-free:not(.is-on)');
    if (free.length) gsap.fromTo(free, { scale: 0.94 }, { scale: 1, duration: 0.55, ease: 'back.out(2)', stagger: { each: 0.04, from: 'start' } });
  }, { scope: root, dependencies: [cal, checkout, guests, side], revertOnUpdate: false });

  // The plan glides to the chosen room's pin, and back out to the whole site.
  useEffect(() => {
    const el = zoom.current;
    if (!el) return;
    const quick = reduce();
    if (!chosen?.pin) {
      gsap.to(el, { scale: 1, x: 0, y: 0, duration: quick ? 0 : 0.8, ease: 'power3.inOut' });
      return;
    }
    const s = 1.6, w = el.offsetWidth, h = el.offsetHeight;
    const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));
    gsap.to(el, {
      scale: s, transformOrigin: '50% 50%',
      x: clamp((0.5 - chosen.x) * w * s, (w * (s - 1)) / 2), y: clamp((0.5 - chosen.y) * h * s, (h * (s - 1)) / 2),
      duration: quick ? 0 : 0.9, ease: 'power3.inOut'
    });
  }, [chosen, side]);

  const pick = contextSafe((id: string) => {
    setRoom(id === room ? '' : id);
    setError('');
    if (id === room || reduce()) return;
    for (const el of onScreen(`[data-room="${id}"]`)) gsap.fromTo(el, { scale: 0.9 }, { scale: 1, duration: 0.8, ease: 'elastic.out(1, 0.5)' });
  });

  // The details slide open once the dates and a room are chosen; the tick draws itself on success.
  // On a phone the form sits under the room list, so the page goes down to it.
  useGSAP(() => {
    const details = onScreen('.tb-details');
    if (!ready || !details.length) return;
    if (!reduce()) gsap.from(details, { height: 0, opacity: 0, duration: 0.5, ease: 'power2.out' });
    if (matchMedia('(max-width: 860px)').matches) details[0].scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth', block: 'center' });
  }, { scope: root, dependencies: [ready] });
  useGSAP(() => {
    if (!done) return;
    const tick = root.current?.querySelector<SVGPathElement>('.tb-tick path');
    if (tick && !reduce()) {
      const len = tick.getTotalLength();
      gsap.fromTo(tick, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.7, delay: 0.25, ease: 'power2.out' });
      const card = onScreen('.tb-done');
      if (card.length) gsap.from(card, { y: 20, opacity: 0, scale: 0.97, duration: 0.6, ease: 'power3.out' });
    }
  }, { scope: root, dependencies: [done] });

  const viewIn3D = (r: StayRoom) => {
    if (onView) return onView(r);
    const frame = document.getElementById('ws-tour') as HTMLIFrameElement | null;
    if (!frame) return;
    frame.scrollIntoView({ behavior: 'smooth', block: 'center' });
    frame.contentWindow?.postMessage({ type: 'rcaas:view', space: r.space, view: r.view }, location.origin);
  };
  const canView = (r: StayRoom) => !!r.space && (!!onView || tour);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || !chosen || preview) return;
    if (!form.name.trim() || !form.phone.trim()) return setError('Add your name and phone, so we can confirm.');
    setSending(true);
    setError('');
    try {
      const r = await requestStay(project, { room: chosen.id, checkin, checkout, guests, formRenderedAt: renderedAt, ...form });
      setDone({ label: r?.roomLabel || chosen.label, rooms: r?.rooms ?? need(chosen), checkin, checkout, guests, email: !!form.email.trim() });
      setCheckin('');
      setCheckout('');
      setRoom(''); // the plan zooms back out to the whole site
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
      load(); // show what's free now, including anything taken meanwhile
    }
  };

  if (error && !cal) return <p className="tb-note">{error}</p>;
  const pinned = stays.plan ? stays.rooms.filter((r) => r.pin) : [];
  const showPlan = pinned.length > 0 && side === 'plan';
  const grid = month ? monthGrid(month) : null;
  const firstMonth = cal?.today.slice(0, 7) ?? '';
  const lastMonth = cal?.lastCheckin.slice(0, 7) ?? '';
  const rangeEnd = checkout || (checkin && hoverDay && canOut(hoverDay) ? hoverDay : '');
  const status = (r: StayRoom) => {
    const st = stateOf(r), left = leftFor(r), n = need(r);
    if (st === 'small') return `Sleeps ${r.sleeps * r.units} at most`;
    if (st === 'full') return n > 1 && (left ?? 0) > 0 ? `Only ${left} free for these nights; you need ${n}` : 'Full on these dates';
    if (left === null) return n > 1 ? `${n} rooms for ${guests} guests` : 'Pick your dates to see what’s free';
    return `${n > 1 ? `${n} rooms for ${guests} guests · ` : ''}${left} left`;
  };

  return (
    <div className="tb rb" ref={root}>
      <div className="tb-panel">
        {done ? (
          <div className="tb-done" role="status">
            <svg className="tb-tick" viewBox="0 0 52 52" aria-hidden><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
            <h3>Request sent</h3>
            <p>{done.rooms > 1 ? `${done.rooms} × ${done.label}` : done.label}, {shortDay(done.checkin)} to {shortDay(done.checkout)}, {plural(nightsBetween(done.checkin, done.checkout), 'night')}, for {done.guests}.</p>
            <p className="tb-dim">We&apos;ll confirm by phone{done.email ? ' or email' : ''} shortly. Nothing is booked until we do.</p>
            <button type="button" className="tb-ghost" onClick={() => setDone(null)}>Book another room</button>
          </div>
        ) : (
          <>
            <Step n={1} done={nights >= 1} title={checkin && !checkout ? 'Check-out' : 'Dates'} />
            <div className="rb-cal" onPointerLeave={() => setHoverDay('')}>
              <div className="rb-cal-head">
                <button type="button" aria-label="Previous month" disabled={!month || month <= firstMonth} onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
                <b aria-live="polite">{month ? fmt(`${month}-01`, { month: 'long', year: 'numeric' }) : 'Loading…'}</b>
                <button type="button" aria-label="Next month" disabled={!month || month >= lastMonth} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
              </div>
              <div className="rb-week" aria-hidden>{['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <span key={d}>{d}</span>)}</div>
              <div className="rb-days" role="grid" aria-label="Dates">
                {grid && Array.from({ length: grid.lead }, (_, i) => <span key={`b${i}`} />)}
                {grid?.days.map((d) => {
                  const choosingOut = !!checkin && !checkout;
                  const usable = choosingOut ? canOut(d) || canIn(d) : canIn(d);
                  const past = !cal || d < cal.today || at(d) < 0;
                  const cls = [
                    'rb-day',
                    d === checkin && 'is-in', d === checkout && 'is-out',
                    checkin && rangeEnd && d > checkin && d < rangeEnd && (checkout ? 'is-range' : 'is-preview'),
                    !checkout && d === rangeEnd && 'is-preview',
                    !past && !openOn(d, chosen ?? undefined) && !(choosingOut && canOut(d)) && 'is-full',
                    d === cal?.today && 'is-today'
                  ].filter(Boolean).join(' ');
                  return (
                    <button key={d} type="button" className={cls} disabled={past || !usable || !!done}
                      aria-pressed={d === checkin || d === checkout}
                      aria-label={`${fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}${d === checkin ? ', check-in' : d === checkout ? ', check-out' : ''}`}
                      onClick={() => tapDay(d)} onPointerEnter={() => setHoverDay(d)}>
                      {Number(d.slice(8))}
                    </button>
                  );
                })}
              </div>
              <p className="rb-cal-foot tb-dim">
                {nights >= 1 ? <>{shortDay(checkin)} → {shortDay(checkout)} · <b>{plural(nights, 'night')}</b></>
                  : checkin ? `Check-in ${shortDay(checkin)}. Now pick your check-out.`
                    : `Pick your check-in. Check-in from ${stays.checkin}, check-out by ${stays.checkout}.`}
              </p>
            </div>

            <Step n={2} done title="Guests" />
            <div className="tb-party">
              <button type="button" aria-label="One fewer" disabled={guests <= 1} onClick={() => setGuests((g) => Math.max(1, g - 1))}>−</button>
              <output aria-live="polite">{plural(guests, 'guest')}</output>
              <button type="button" aria-label="One more" disabled={guests >= stays.maxGuests} onClick={() => setGuests((g) => Math.min(stays.maxGuests, g + 1))}>+</button>
            </div>

            <Step n={3} done={!!chosen} title="Room" />
            <div className="tb-choice">
              {chosen ? (
                <div className="tb-card">
                  <b>{need(chosen) > 1 ? `${need(chosen)} × ${chosen.label}` : chosen.label}</b>
                  <span>{[`Sleeps ${chosen.sleeps}`, chosen.area, chosen.price && `${chosen.price} ${chosen.per}`.trim()].filter(Boolean).join(' · ')}</span>
                  {canView(chosen) && <button type="button" className="tb-link" onClick={() => viewIn3D(chosen)}>See this room in 3D →</button>}
                </div>
              ) : (
                <p className="tb-dim">Pick a room{pinned.length ? ', from the list or on the site plan' : ''}.</p>
              )}
            </div>
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
              <label><span>Anything we should know? <em>optional</em></span><textarea rows={2} value={form.notes} maxLength={500} placeholder="Arriving late, an extra bed, an anniversary…" onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
              {/* honeypot: hidden from people, filled by bots */}
              <label className="tb-hp" aria-hidden="true"><span>Leave empty</span><input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
              <button className="tb-go" type="submit" disabled={sending || preview}>
                {preview ? 'Preview: bookings open once you publish' : sending ? 'Sending…' : `Request ${chosen.label} · ${plural(nights, 'night')}`}
              </button>
            </form>
          )}
          {/* Dates picked, rooms that sleep them, all taken: they can wait for one to open up. */}
          {nights >= 1 && !stays.rooms.some((r) => stateOf(r) === 'free') && stays.rooms.some(fits) && (
            <WaitlistForm key={`${checkin}-${checkout}-${guests}-${room}`} project={project} preview={preview}
              what={`${byId(room)?.label ?? 'a room'}, ${shortDay(checkin)} to ${shortDay(checkout)}`}
              request={{ of: 'room', checkin, checkout, party: guests, ...(byId(room) ? { room } : {}) }} />
          )}
          {error && <p className="tb-err" role="alert">{error}</p>}
          {stays.note && <p className="tb-dim tb-fine">{stays.note}</p>}
        </div>
      )}

      <div className="rb-side">
        {pinned.length > 0 && (
          <div className="rb-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={side === 'rooms'} className={side === 'rooms' ? 'is-on' : ''} onClick={() => setSide('rooms')}>Rooms</button>
            <button type="button" role="tab" aria-selected={side === 'plan'} className={side === 'plan' ? 'is-on' : ''} onClick={() => setSide('plan')}>Site plan</button>
          </div>
        )}
        {showPlan ? (
          <div className="tb-map rb-map">
            <div className="tb-view">
              <div className="tb-zoom" ref={zoom}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the hotel's own site plan */}
                <img src={asset(stays.plan)} alt="Site plan" />
                {pinned.map((r) => {
                  const st = stateOf(r);
                  return (
                    <button key={r.id} type="button" data-room={r.id} className={`rb-pin is-${st}${chosen?.id === r.id ? ' is-on' : ''}`}
                      style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%` }} disabled={st !== 'free' || !!done}
                      aria-pressed={chosen?.id === r.id} aria-label={`${r.label}: ${status(r)}`} onClick={() => pick(r.id)}>
                      <i aria-hidden /><span>{r.label}</span>
                    </button>
                  );
                })}
              </div>
              {chosen?.pin && <button type="button" className="tb-whole" onClick={() => setRoom('')}>Show the whole site</button>}
            </div>
            <ul className="tb-legend" aria-hidden>
              <li><i className="is-free" />Free</li>
              <li><i className="is-on" />Yours</li>
              <li><i className="is-taken" />Full</li>
              <li><i className="is-small" />Too small</li>
            </ul>
          </div>
        ) : (
          <div className="rb-rooms">
            {stays.rooms.map((r) => {
              const st = stateOf(r);
              const on = chosen?.id === r.id;
              return (
                <article key={r.id} data-room={r.id} className={`rb-room is-${st}${on ? ' is-on' : ''}`}>
                  <button type="button" className="rb-room-pick" disabled={st !== 'free' || !!done} aria-pressed={on} onClick={() => pick(r.id)}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- the hotel's photo */}
                    {r.image ? <img src={asset(r.image)} alt="" loading="lazy" /> : <span className="rb-room-ph" aria-hidden />}
                    <span className="rb-room-txt">
                      <b>{r.label}</b>
                      <span className="tb-dim">{[`Sleeps ${r.sleeps}`, r.area].filter(Boolean).join(' · ')}</span>
                      {r.price && <span className="rb-price"><b>{r.price}</b> {r.per}</span>}
                      {r.deposit && <span className="tb-dim">Deposit: {r.deposit}</span>}
                      {r.features && <span className="rb-feats">{r.features.split(/\s*[·,]\s*/).filter(Boolean).slice(0, 4).map((f) => <em key={f}>{f}</em>)}</span>}
                      <span className={`rb-left is-${st}`}>{status(r)}</span>
                    </span>
                    {on && <span className="rb-check" aria-hidden>✓</span>}
                  </button>
                  {canView(r) && <button type="button" className="tb-link rb-3d" onClick={() => viewIn3D(r)}>See it in 3D →</button>}
                </article>
              );
            })}
          </div>
        )}
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
