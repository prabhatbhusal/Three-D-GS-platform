'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  API_BASE_URL, getAvailability, getPreviewAvailability, reserveTable, type Availability, type SiteBooking, type SiteTable
} from '../lib/api';

import { WaitlistForm } from './WaitlistForm';
import './table-booking.css';

gsap.registerPlugin(useGSAP);

type TableState = 'free' | 'small' | 'taken';

const dayParts = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' });
  return { wd: f({ weekday: 'short' }), day: f({ day: 'numeric' }), month: f({ month: 'short' }), long: f({ weekday: 'long', day: 'numeric', month: 'long' }) };
};

/** Where a table's chairs sit, in table-units from its centre, by its shape. */
function chairs(t: SiteTable): [number, number][] {
  const n = t.seats;
  if (t.shape === 'long') {
    const top = Math.ceil(n / 2), bottom = n - top, len = Math.max(top, 2) * 2.6;
    const row = (k: number, y: number) => Array.from({ length: k }, (_, i) => [(-len / 2) + (len / k) * (i + 0.5), y] as [number, number]);
    return [...row(top, -2.6), ...row(bottom, 2.6)];
  }
  const r = t.shape === 'square' ? 3.9 : 3.7;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}
const longWidth = (t: SiteTable) => Math.max(Math.ceil(t.seats / 2), 2) * 2.6;

/**
 * Book a table (the website's #reserve): the day, how many, the time — and
 * the table itself, picked on the restaurant's own floor plan. The plan
 * shows what's possible as you go: free tables, ones too small for the
 * party, ones booked at that time. Picking one zooms to it and pops its
 * chairs in (GSAP); "Let us choose" leaves it to the restaurant. Either order
 * works: pick a time and see the free tables, or pick a table and see its times.
 */
export function TableBooking({ project, booking, tourSpace, preview = false, initialTable = '', onView }: {
  project: string; booking: SiteBooking; tourSpace: string | null;
  /** The studio's preview: the draft's tables and hours, against real bookings; nothing is sent. */
  preview?: boolean;
  /** A table already chosen (a table hotspot in the tour). */
  initialTable?: string;
  /** Show the view from a table; inside the tour it flies there itself. Else the website's embedded tour. */
  onView?: (t: SiteTable) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const zoom = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [party, setParty] = useState(2);
  const [time, setTime] = useState('');
  const [table, setTable] = useState(initialTable); // a table id, 'any', or none yet
  const [hover, setHover] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', website: '' });
  const [renderedAt] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ label: string; date: string; time: string; party: number; email: boolean } | null>(null);

  const load = (date?: string) =>
    (preview ? getPreviewAvailability : getAvailability)(project, date, booking.outlet).then((a) => { if (a) setAvail(a); }).catch((e: Error) => setError(e.message));
  useEffect(() => { load(); }, [project]); // eslint-disable-line react-hooks/exhaustive-deps -- once per project

  const byId = (id: string) => booking.tables.find((t) => t.id === id);
  const slots = avail?.slots ?? [];
  const slot = slots.find((s) => s.time === time);
  const fits = (id: string) => (byId(id)?.seats ?? 0) >= party;
  // A time works if the chosen table (or, with none chosen, any table that seats everyone) is free then.
  const timeWorks = (s: { free: string[] }) =>
    table && table !== 'any' ? s.free.includes(table) && fits(table) : s.free.some(fits);
  const stateOf = (t: SiteTable): TableState => {
    if (t.seats < party) return 'small';
    if (slot) return slot.free.includes(t.id) ? 'free' : 'taken';
    return slots.some((s) => s.free.includes(t.id)) ? 'free' : 'taken'; // no time yet: free at some point today
  };
  // What's chosen, if it still makes sense after the day, time or party changed.
  const pickedTable = table === 'any' ? 'any' : table && byId(table) && stateOf(byId(table)!) === 'free' ? table : '';
  const pickedTime = slot && timeWorks(slot) ? time : '';
  const chosen = pickedTable && pickedTable !== 'any' ? byId(pickedTable)! : null;
  const ready = !!(avail && pickedTime && pickedTable);
  const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  // What's on screen right now, in this panel: GSAP warns about an empty target, and the
  // free tables, times or form are often not there yet (loading, nothing free).
  const onScreen = (sel: string) => gsap.utils.toArray<Element>(sel, root.current);

  /* ---- motion ---- */
  const { contextSafe } = useGSAP({ scope: root });

  // Tables ripple as what's possible changes.
  useGSAP(() => {
    if (reduce()) return;
    const free = onScreen('.tb-table.is-free:not(.is-on)');
    if (free.length) gsap.fromTo(free, { scale: 0.82 }, { scale: 1, duration: 0.6, ease: 'back.out(2.2)', stagger: { each: 0.03, from: 'random' } });
  }, { scope: root, dependencies: [avail?.date, pickedTime, party], revertOnUpdate: false });

  // A new day's times arrive one after another.
  useGSAP(() => {
    if (reduce()) return;
    const times = onScreen('.tb-time');
    if (times.length) gsap.from(times, { y: 12, opacity: 0, duration: 0.4, stagger: 0.03, ease: 'power2.out' });
  }, { scope: root, dependencies: [avail?.date] });

  // The plan glides to the chosen table, and back out to the whole room.
  useEffect(() => {
    const el = zoom.current;
    if (!el) return;
    const quick = reduce();
    if (!chosen) {
      gsap.to(el, { scale: 1, x: 0, y: 0, duration: quick ? 0 : 0.8, ease: 'power3.inOut' });
      return;
    }
    const s = 1.7, w = el.offsetWidth, h = el.offsetHeight;
    const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));
    gsap.to(el, {
      scale: s, transformOrigin: '50% 50%',
      x: clamp((0.5 - chosen.x) * w * s, (w * (s - 1)) / 2),
      y: clamp((0.5 - chosen.y) * h * s, (h * (s - 1)) / 2),
      duration: quick ? 0 : 0.9, ease: 'power3.inOut'
    });
  }, [chosen]);

  const pick = contextSafe((id: string) => {
    setTable(id === table ? '' : id);
    setError('');
    if (id === table || reduce()) return;
    const el = root.current?.querySelector(`[data-table="${id}"]`);
    if (!el) return;
    gsap.fromTo(el, { scale: 0.55 }, { scale: 1, duration: 0.9, ease: 'elastic.out(1, 0.45)' });
    gsap.fromTo(el.querySelectorAll('.tb-chair'), { scale: 0 }, { scale: 1, duration: 0.35, stagger: 0.05, delay: 0.25, ease: 'back.out(3)' });
  });

  // The details slide open once a time and a table are chosen; the tick draws itself on success.
  useGSAP(() => {
    const details = onScreen('.tb-details');
    if (ready && !reduce() && details.length) gsap.from(details, { height: 0, opacity: 0, duration: 0.5, ease: 'power2.out' });
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

  const viewFrom = (t: SiteTable) => {
    if (onView) return onView(t);
    const frame = document.getElementById('ws-tour') as HTMLIFrameElement | null;
    if (!frame || !tourSpace) return;
    frame.scrollIntoView({ behavior: 'smooth', block: 'center' });
    frame.contentWindow?.postMessage({ type: 'rcaas:view', space: tourSpace, view: t.view }, location.origin);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!avail || !ready || preview) return;
    if (!form.name.trim() || !form.phone.trim()) return setError('Add your name and phone, so we can confirm.');
    setSending(true);
    setError('');
    try {
      const r = await reserveTable(project, { outlet: booking.outlet,
        table: pickedTable, date: avail.date, time: pickedTime, party, formRenderedAt: renderedAt, ...form
      });
      setDone({ label: r?.tableLabel || chosen?.label || 'a table', date: avail.date, time: pickedTime, party, email: !!form.email.trim() });
      setTable('');
      setTime('');
      load(avail.date); // the plan now shows it taken
    } catch (err) {
      setError((err as Error).message);
      load(avail.date); // someone may have just taken it: show what's free now
    } finally {
      setSending(false);
    }
  };

  if (error && !avail) return <p className="tb-note">{error}</p>;
  const tip = hover ? byId(hover) : null;
  const say: Record<TableState, string> = { free: 'Free', small: `Too small for ${party}`, taken: pickedTime ? `Booked at ${pickedTime}` : 'Booked all day' };

  return (
    <div className="tb" ref={root}>
      <div className="tb-panel">
        {done ? (
          <div className="tb-done" role="status">
            <svg className="tb-tick" viewBox="0 0 52 52" aria-hidden><circle cx="26" cy="26" r="24" /><path d="M15 27l7 7 15-16" /></svg>
            <h3>Request sent</h3>
            <p>{done.label}, {dayParts(done.date).long} at {done.time}, for {done.party}.</p>
            <p className="tb-dim">We&apos;ll confirm by phone{done.email ? ' or email' : ''} shortly. Nothing is booked until we do.</p>
            <button type="button" className="tb-ghost" onClick={() => setDone(null)}>Book another table</button>
          </div>
        ) : (
          <>
            <Step n={1} done={!!avail} title="Day" />
            <div className="tb-days" role="listbox" aria-label="Day">
              {avail?.dates.slice(0, 21).map((d) => {
                const p = dayParts(d.date);
                return (
                  <button key={d.date} type="button" role="option" aria-selected={d.date === avail.date}
                    className={`tb-day${d.date === avail.date ? ' is-on' : ''}`} disabled={d.closed}
                    onClick={() => { if (d.date !== avail.date) load(d.date); }}>
                    <small>{d.date === avail.today ? 'Today' : p.wd}</small><b>{p.day}</b><small>{d.closed ? 'Closed' : p.month}</small>
                  </button>
                );
              })}
            </div>

            <Step n={2} done title="Guests" />
            <div className="tb-party">
              <button type="button" aria-label="One fewer" disabled={party <= 1} onClick={() => setParty((p) => Math.max(1, p - 1))}>−</button>
              <output aria-live="polite">{party} {party === 1 ? 'guest' : 'guests'}</output>
              <button type="button" aria-label="One more" disabled={party >= booking.maxParty} onClick={() => setParty((p) => Math.min(booking.maxParty, p + 1))}>+</button>
            </div>

            <Step n={3} done={!!pickedTime} title="Time" />
            <div className="tb-times">
              {slots.length ? slots.map((s) => {
                const ok = timeWorks(s);
                return (
                  <button key={s.time} type="button" className={`tb-time${s.time === pickedTime ? ' is-on' : ''}`} disabled={!ok}
                    aria-pressed={s.time === pickedTime} title={ok ? undefined : 'Nothing free for you then'}
                    onClick={() => setTime(s.time === time ? '' : s.time)}>{s.time}</button>
                );
              }) : <p className="tb-dim">{avail ? 'Nothing left to book this day. Try another.' : 'Loading…'}</p>}
            </div>

            <Step n={4} done={!!pickedTable} title="Table" />
            <div className="tb-choice">
              {chosen ? (
                <div className="tb-card">
                  <b>{chosen.label || 'Your table'}</b>
                  <span>{[`Seats ${chosen.seats}`, chosen.area].filter(Boolean).join(' · ')}</span>
                  {chosen.view && (tourSpace || onView) && (
                    <button type="button" className="tb-link" onClick={() => viewFrom(chosen)}>See the view from this table in 3D →</button>
                  )}
                </div>
              ) : pickedTable === 'any' ? (
                <div className="tb-card"><b>Any good table</b><span>We&apos;ll seat you at the best free table for {party}.</span></div>
              ) : (
                <p className="tb-dim">Pick a table on the plan{pickedTime ? '' : ', or choose a time first to see what’s free'}.</p>
              )}
              <button type="button" className={`tb-ghost${pickedTable === 'any' ? ' is-on' : ''}`}
                onClick={() => setTable(pickedTable === 'any' ? '' : 'any')}>
                {pickedTable === 'any' ? 'I’ll pick one myself' : 'Let us choose'}
              </button>
            </div>

          </>
        )}
      </div>

      {!done && (
        <div className="tb-form">
          {ready && (
            <form className="tb-details" onSubmit={submit} noValidate>
              <div className="tb-row">
                <label><span>Name</span><input value={form.name} maxLength={100} autoComplete="name" onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label><span>Phone</span><input type="tel" value={form.phone} maxLength={30} autoComplete="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              </div>
              <label><span>Email <em>optional, for the confirmation</em></span><input type="email" value={form.email} maxLength={200} autoComplete="email" onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <label><span>Anything we should know? <em>optional</em></span><textarea rows={2} value={form.notes} maxLength={500} placeholder="A birthday, a high chair, an allergy…" onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
              {/* honeypot: hidden from people, filled by bots */}
              <label className="tb-hp" aria-hidden="true"><span>Leave empty</span><input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></label>
              <button className="tb-go" type="submit" disabled={sending || preview}>
                {preview ? 'Preview: bookings open once you publish' : sending ? 'Sending…' : `Request ${chosen ? chosen.label || 'this table' : 'a table'} · ${dayParts(avail!.date).wd} ${pickedTime}`}
              </button>
            </form>
          )}
          {/* Every time that day taken for this party: they can wait for one to open up. */}
          {avail && slots.length > 0 && !slots.some((s) => s.free.some(fits)) && (
            <WaitlistForm key={`${avail.date}-${party}`} project={project} preview={preview}
              what={`a table for ${party} on ${dayParts(avail.date).long}`} request={{ of: 'table', date: avail.date, party, outlet: booking.outlet }} />
          )}
          {error && <p className="tb-err" role="alert">{error}</p>}
          {booking.note && <p className="tb-dim tb-fine">{booking.note}</p>}
        </div>
      )}

      <div className="tb-map">
        <div className="tb-view">
          <div className="tb-zoom" ref={zoom}>
            {/* eslint-disable-next-line @next/next/no-img-element -- the restaurant's own floor plan */}
            <img src={`${API_BASE_URL}/api/assets/${booking.plan}`} alt="Floor plan of the restaurant" />
            {booking.tables.map((t) => {
              const st = stateOf(t);
              const on = pickedTable === t.id;
              return (
                <button key={t.id} type="button" data-table={t.id}
                  className={`tb-table is-${st} shape-${t.shape}${on ? ' is-on' : ''}`}
                  style={{ left: `${t.x * 100}%`, top: `${t.y * 100}%`, '--len': longWidth(t) } as React.CSSProperties}
                  disabled={st !== 'free' || !!done} aria-pressed={on}
                  aria-label={`${t.label || 'Table'}, seats ${t.seats}${t.area ? `, ${t.area}` : ''}: ${say[st]}`}
                  onClick={() => pick(t.id)}
                  onPointerEnter={() => setHover(t.id)} onPointerLeave={() => setHover('')}
                  onFocus={() => setHover(t.id)} onBlur={() => setHover('')}>
                  {chairs(t).map(([x, y], i) => (
                    <i key={i} className="tb-chair" style={{ '--x': x, '--y': y } as React.CSSProperties} />
                  ))}
                  <span className="tb-top" />
                  {t.label && <span className="tb-label">{t.label}</span>}
                </button>
              );
            })}
            {tip && (
              <div className="tb-tip" style={{ left: `${tip.x * 100}%`, top: `${tip.y * 100}%` }} aria-hidden>
                <b>{tip.label || 'Table'}</b> seats {tip.seats}{tip.area ? ` · ${tip.area}` : ''}<br /><em>{say[stateOf(tip)]}</em>
              </div>
            )}
          </div>
          {chosen && <button type="button" className="tb-whole" onClick={() => setTable('')}>Show the whole room</button>}
        </div>
        <ul className="tb-legend" aria-hidden>
          <li><i className="is-free" />Free</li>
          <li><i className="is-on" />Yours</li>
          <li><i className="is-small" />Too small</li>
          <li><i className="is-taken" />Booked</li>
        </ul>
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
