'use client';

import { useEffect, useState } from 'react';
import {
  getAvailability, getPreviewAvailability, reserveTable, type Availability, type SiteBooking
} from '../lib/api';
import { useT } from '../lib/i18n';

const Cal = () => (
  <svg viewBox="0 0 24 24" aria-hidden><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
const Clock = () => (
  <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
const People = () => (
  <svg viewBox="0 0 24 24" aria-hidden><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.5-3.6 3-5.6 6-5.6s5.5 2 6 5.6" /><path d="M16 5.2a3 3 0 0 1 0 5.8M18 14.8c1.8.7 2.8 2.4 3 5.2" /></svg>
);
const Seat = () => (
  <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="4" r="1.6" /><circle cx="12" cy="20" r="1.6" /><circle cx="4" cy="12" r="1.6" /><circle cx="20" cy="12" r="1.6" /></svg>
);

const LOCALE = { en: 'en-GB', ne: 'ne-NP', zh: 'zh-CN' } as const;

/**
 * Reserve a table, the way Book now books a room (§7.6): one card over the
 * tour — day, time, guests, the table (best available, or the one a table
 * hotspot named), a name and a phone, and one button. The full floor plan is
 * a link away for guests who want to pick by sight (TableBooking).
 */
export function TableCard({ project, booking, venue, places, onPlace, initialTable = '', preview = false, onClose, onOpenPlan }: {
  project: string; booking: SiteBooking; venue: string;
  /** More than one dining place (a restaurant and a café): which one, in words, and switching. */
  places?: { id: string; name: string }[]; onPlace?: (id: string) => void;
  initialTable?: string;
  /** The studio's Preview: the draft's setup, never sends. */
  preview?: boolean;
  onClose: () => void;
  /** Open the floor plan (TableBooking) with this table, or none, chosen. */
  onOpenPlan: (tableId: string) => void;
}) {
  const t = useT();
  const [avail, setAvail] = useState<Availability | null>(null);
  const [party, setParty] = useState(2);
  const [time, setTime] = useState('');
  const [choice, setTable] = useState(initialTable); // '' = best available
  const [form, setForm] = useState({ name: '', phone: '', email: '', website: '' });
  const [renderedAt] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ label: string; date: string; time: string; party: number } | null>(null);

  const load = (date?: string) =>
    (preview ? getPreviewAvailability : getAvailability)(project, date, booking.outlet)
      .then((a) => { if (a) setAvail(a); })
      .catch((e: Error) => setError(e.message));
  useEffect(() => { load(); }, [project]); // eslint-disable-line react-hooks/exhaustive-deps -- once per project

  const byId = (id: string) => booking.tables.find((x) => x.id === id);
  const fits = (id: string) => (byId(id)?.seats ?? 0) >= party;
  // A chosen table too small for the party now falls back to the best available.
  const table = choice && fits(choice) ? choice : '';
  // Times that work: the chosen table free and big enough, or any table that is.
  const slots = (avail?.slots ?? []).filter((s) => (table ? s.free.includes(table) && fits(table) : s.free.some(fits)));
  const pickedTime = slots.some((s) => s.time === time) ? time : slots[0]?.time ?? '';
  const slot = avail?.slots.find((s) => s.time === pickedTime);
  const freeTables = booking.tables.filter((x) => x.seats >= party && slot?.free.includes(x.id));
  const chosen = table ? byId(table) : null;
  const best = [...freeTables].sort((a, b) => a.seats - b.seats)[0];
  const day = (d: string, o: Intl.DateTimeFormatOptions) =>
    new Date(`${d}T12:00:00Z`).toLocaleDateString(LOCALE[t.lang], { ...o, timeZone: 'UTC' });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!avail || !pickedTime || preview) return;
    if (!form.name.trim() || !form.phone.trim()) return setError(t('Add your name and phone, so we can confirm.'));
    setSending(true);
    setError('');
    try {
      const r = await reserveTable(project, { outlet: booking.outlet,
        table: table || 'any', date: avail.date, time: pickedTime, party, formRenderedAt: renderedAt, ...form
      });
      setDone({ label: r?.tableLabel || chosen?.label || best?.label || '', date: avail.date, time: pickedTime, party });
    } catch (err) {
      setError((err as Error).message);
      load(avail.date); // someone may have just taken it
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="vw-sheet-scrim" onClick={onClose} />
      <div className="vw-sheet vw-sheet-book vw-sheet-table" role="dialog" aria-label={t('Reserve a table')}>
        <button className="vw-sheet-x" onClick={onClose} aria-label={t('Close')}>✕</button>
        {done ? (
          <div className="vw-sheet-done">
            <span className="vw-sheet-tick" aria-hidden>✓</span>
            <h2>{t('Request sent')}</h2>
            <p className="vw-sheet-sub">
              {[done.label, `${day(done.date, { weekday: 'long', day: 'numeric', month: 'long' })} ${done.time}`, t('{n} guests', { n: done.party })].filter(Boolean).join(' · ')}
            </p>
            <p className="vw-sheet-fine">{t('We’ll confirm by phone or email. Nothing is booked until we do.')}</p>
            <button className="vw-sheet-go vw-sheet-go-quiet" onClick={onClose}>{t('Keep exploring')}</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2>{t('Reserve a table')}</h2>
            {places && onPlace ? (
              <label className="vw-sheet-field vw-sheet-field-wide">
                <span className="vw-sheet-field-txt">
                  <span>{t('Place')}</span>
                  <select value={booking.outlet ?? ''} onChange={(e) => onPlace(e.target.value)}>
                    {places.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </span>
              </label>
            ) : <p className="vw-sheet-sub">{venue}</p>}

            <div className="vw-stay">
              <label className="vw-sheet-field">
                <Cal />
                <span className="vw-sheet-field-txt">
                  <span>{t('Day')}</span>
                  <select value={avail?.date ?? ''} disabled={!avail} onChange={(e) => { setTime(''); load(e.target.value); }}>
                    {avail?.dates.filter((d) => !d.closed).map((d) => (
                      <option key={d.date} value={d.date}>
                        {d.date === avail.today ? `${t('Today')}, ` : ''}{day(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="vw-sheet-field">
                <People />
                <span className="vw-sheet-field-txt">
                  <span>{t('Guests')}</span>
                  <select value={party} onChange={(e) => setParty(Number(e.target.value))}>
                    {Array.from({ length: booking.maxParty }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{t(n === 1 ? '{n} guest' : '{n} guests', { n })}</option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="vw-sheet-field">
                <Clock />
                <span className="vw-sheet-field-txt">
                  <span>{t('Time')}</span>
                  <select value={pickedTime} disabled={!slots.length} onChange={(e) => setTime(e.target.value)}>
                    {slots.length ? slots.map((s) => <option key={s.time} value={s.time}>{s.time}</option>)
                      : <option value="">{avail ? t('No times left this day.') : t('Loading…')}</option>}
                  </select>
                </span>
              </label>
              <label className="vw-sheet-field">
                <Seat />
                <span className="vw-sheet-field-txt">
                  <span>{t('Table')}</span>
                  <select value={table} onChange={(e) => setTable(e.target.value)}>
                    <option value="">{best ? t('Best available ({label})', { label: best.label }) : t('Best available')}</option>
                    {booking.tables.filter((x) => x.seats >= party).map((x) => (
                      <option key={x.id} value={x.id} disabled={!!slot && !slot.free.includes(x.id)}>
                        {[x.label, t('seats {n}', { n: x.seats }), x.area].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </select>
                </span>
              </label>
              <button type="button" className="vw-sheet-link" onClick={() => onOpenPlan(table)}>{t('See the floor plan')} →</button>
            </div>

            <div className="vw-sheet-grid">
              <label className="vw-sheet-input">
                <span>{t('Name')}</span>
                <input value={form.name} maxLength={100} autoComplete="name" onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </label>
              <label className="vw-sheet-input">
                <span>{t('Phone')}</span>
                <input type="tel" value={form.phone} maxLength={30} autoComplete="tel" onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
              <label className="vw-sheet-input vw-span-2">
                <span>{t('Email')} <em>{t('optional')}</em></span>
                <input type="email" value={form.email} maxLength={200} autoComplete="email" onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
            </div>
            {/* honeypot: hidden from people, filled by bots */}
            <label className="vw-cta-hp" aria-hidden="true">
              <span>Leave this field empty</span>
              <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </label>

            {error && <p className="vw-sheet-err">{error}</p>}
            <button className="vw-sheet-go" type="submit" disabled={sending || !pickedTime || preview}>
              {preview ? t('Preview: bookings open once you publish') : sending ? t('Sending…') : t('Request table')}
            </button>
            <p className="vw-sheet-fine vw-sheet-center">{t('We’ll confirm by phone or email. Nothing is booked until we do.')}</p>
          </form>
        )}
      </div>
    </>
  );
}
