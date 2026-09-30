'use client';

import { useEffect, useState } from 'react';
import {
  getPreviewStayCalendar, getStayCalendar, requestStay, type SiteStays, type StayCalendar
} from '../lib/api';
import { freeForStay, nightsBetween, roomsNeeded, stayProblem } from '../lib/booking';
import { useT } from '../lib/i18n';

const Cal = () => (
  <svg viewBox="0 0 24 24" aria-hidden><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
const People = () => (
  <svg viewBox="0 0 24 24" aria-hidden><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.5-3.6 3-5.6 6-5.6s5.5 2 6 5.6" /><path d="M16 5.2a3 3 0 0 1 0 5.8M18 14.8c1.8.7 2.8 2.4 3 5.2" /></svg>
);
const Bed = () => (
  <svg viewBox="0 0 24 24" aria-hidden><path d="M3 18V7M3 13h18v5M21 13v-2a3 3 0 0 0-3-3h-7v5" /><circle cx="7" cy="10.5" r="1.8" /></svg>
);

const LOCALE = { en: 'en-GB', ne: 'ne-NP', zh: 'zh-CN' } as const;

/**
 * Book a room, over the tour: the dates, how many guests, the room (the one
 * this space shows, when it's one the hotel lets online), a name and a
 * phone, and one button. The same request as the website's room booking;
 * all the rooms with their photos and the site plan are a link away
 * (RoomBooking).
 */
export function RoomCard({ project, stays, venue, initialRoom = '', preview = false, onClose, onOpenAll }: {
  project: string; stays: SiteStays; venue: string;
  initialRoom?: string;
  /** The studio's Preview: the draft's setup, never sends. */
  preview?: boolean;
  onClose: () => void;
  /** Open every room (RoomBooking) with this one, or none, chosen. */
  onOpenAll: (roomId: string) => void;
}) {
  const t = useT();
  const [cal, setCal] = useState<StayCalendar | null>(null);
  const [stay, setStay] = useState({ checkin: '', checkout: '', guests: 2 });
  const [room, setRoom] = useState(initialRoom);
  const [form, setForm] = useState({ name: '', phone: '', email: '', website: '' });
  const [renderedAt] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ label: string; checkin: string; checkout: string; guests: number } | null>(null);

  const load = () => (preview ? getPreviewStayCalendar : getStayCalendar)(project)
    .then((c) => {
      if (!c) return;
      setCal(c);
      // Start from the first night this room (else any room) is free, for the shortest stay.
      setStay((s) => {
        if (s.checkin) return s;
        const i = c.dates.findIndex((d, k) => d <= c.lastCheckin && stays.rooms.some((r) => (!initialRoom || r.id === initialRoom) && (c.free[r.id]?.[k] ?? 0) > 0));
        const from = i < 0 ? 0 : i;
        return { ...s, checkin: c.dates[from], checkout: c.dates[Math.min(from + stays.minNights, c.dates.length - 1)] };
      });
    })
    .catch((e: Error) => setError(e.message));
  useEffect(() => { load(); }, [project]); // eslint-disable-line react-hooks/exhaustive-deps -- once per project

  const nights = nightsBetween(stay.checkin, stay.checkout);
  const leftOf = (id: string) => (cal ? freeForStay(cal.dates, cal.free[id], stay.checkin, stay.checkout) : 0);
  const okFor = (r: SiteStays['rooms'][number]) => roomsNeeded(stay.guests, r.sleeps) <= Math.min(r.units, leftOf(r.id));
  const open = stays.rooms.filter(okFor);
  const chosen = stays.rooms.find((r) => r.id === room && okFor(r)) ?? open[0] ?? null;
  const need = chosen ? roomsNeeded(stay.guests, chosen.sleeps) : 1;
  const problem = !cal ? null
    : stayProblem(stay, cal.today)
      ?? (nights < stays.minNights ? t('The shortest stay is {n} nights.', { n: stays.minNights }) : null)
      ?? (nights > stays.maxNights ? t('For more than {n} nights, please call us.', { n: stays.maxNights }) : null)
      ?? (chosen ? null : t('No room is free for these dates.'));
  const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(LOCALE[t.lang], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const set = (patch: Partial<typeof stay>) => setStay((s) => {
    const next = { ...s, ...patch };
    // Moving check-in past check-out drags check-out along.
    if (patch.checkin && cal && !(nightsBetween(next.checkin, next.checkout) >= 1)) {
      next.checkout = cal.dates[cal.dates.indexOf(next.checkin) + Math.max(1, stays.minNights)] ?? next.checkout;
    }
    return next;
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen || problem || preview) return;
    if (!form.name.trim() || !form.phone.trim()) return setError(t('Add your name and phone, so we can confirm.'));
    setSending(true);
    setError('');
    try {
      const r = await requestStay(project, { room: chosen.id, ...stay, formRenderedAt: renderedAt, ...form });
      setDone({ label: (r?.rooms ?? need) > 1 ? `${r?.rooms ?? need} × ${chosen.label}` : chosen.label, ...stay });
    } catch (err) {
      setError((err as Error).message);
      load(); // someone may have just taken it
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="vw-sheet-scrim" onClick={onClose} />
      <div className="vw-sheet vw-sheet-book vw-sheet-table" role="dialog" aria-label={t('Book a room')}>
        <button className="vw-sheet-x" onClick={onClose} aria-label={t('Close')}>✕</button>
        {done ? (
          <div className="vw-sheet-done">
            <span className="vw-sheet-tick" aria-hidden>✓</span>
            <h2>{t('Request sent')}</h2>
            <p className="vw-sheet-sub">
              {[done.label, `${day(done.checkin)} → ${day(done.checkout)}`, t(done.guests === 1 ? '{n} guest' : '{n} guests', { n: done.guests })].join(' · ')}
            </p>
            <p className="vw-sheet-fine">{t('We’ll confirm by phone or email. Nothing is booked until we do.')}</p>
            <button className="vw-sheet-go vw-sheet-go-quiet" onClick={onClose}>{t('Keep exploring')}</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2>{t('Book a room')}</h2>
            <p className="vw-sheet-sub">{venue}</p>

            <div className="vw-stay">
              <label className="vw-sheet-field">
                <Cal />
                <span className="vw-sheet-field-txt">
                  <span>{t('Check in')}</span>
                  <input type="date" value={stay.checkin} disabled={!cal} min={cal?.today} max={cal?.lastCheckin}
                    onChange={(e) => set({ checkin: e.target.value })} />
                </span>
              </label>
              <label className="vw-sheet-field">
                <Cal />
                <span className="vw-sheet-field-txt">
                  <span>{t('Check out')}</span>
                  <input type="date" value={stay.checkout} disabled={!cal} min={stay.checkin} max={cal?.dates[cal.dates.length - 1]}
                    onChange={(e) => set({ checkout: e.target.value })} />
                </span>
              </label>
              <label className="vw-sheet-field">
                <People />
                <span className="vw-sheet-field-txt">
                  <span>{t('Guests')}</span>
                  <select value={stay.guests} onChange={(e) => set({ guests: Number(e.target.value) })}>
                    {Array.from({ length: stays.maxGuests }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>{t(n === 1 ? '{n} guest' : '{n} guests', { n })}</option>
                    ))}
                  </select>
                </span>
              </label>
              <label className="vw-sheet-field">
                <Bed />
                <span className="vw-sheet-field-txt">
                  <span>{t('Room')}</span>
                  <select value={chosen?.id ?? ''} disabled={!cal} onChange={(e) => setRoom(e.target.value)}>
                    {!chosen && <option value="">{cal ? t('No room is free for these dates.') : t('Loading…')}</option>}
                    {stays.rooms.map((r) => {
                      const ok = okFor(r);
                      return (
                        <option key={r.id} value={r.id} disabled={!ok}>
                          {[r.label, t('sleeps {n}', { n: r.sleeps }), r.price && `${r.price} ${r.per}`.trim(),
                            ok ? t('{n} left', { n: leftOf(r.id) }) : t('Full on these dates')].filter(Boolean).join(' · ')}
                        </option>
                      );
                    })}
                  </select>
                </span>
              </label>
              {nights >= 1 && (
                <p className="vw-sheet-fine">
                  {nights === 1 ? t('1 night') : t('{n} nights', { n: nights })}
                  {need > 1 && chosen ? ` · ${t('{n} rooms', { n: need })}` : ''}
                  {chosen?.deposit ? ` · ${t('Deposit')}: ${chosen.deposit}` : ''}
                  {' · '}{t('Check-in from {a}, check-out by {b}', { a: stays.checkin, b: stays.checkout })}
                </p>
              )}
              <button type="button" className="vw-sheet-link" onClick={() => onOpenAll(chosen?.id ?? '')}>{t('See all rooms')} →</button>
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

            {(error || problem) && <p className="vw-sheet-err">{error || t(problem!)}</p>}
            <button className="vw-sheet-go" type="submit" disabled={sending || !!problem || !chosen || preview}>
              {preview ? t('Preview: bookings open once you publish') : sending ? t('Sending…') : t('Request room')}
            </button>
            <p className="vw-sheet-fine vw-sheet-center">{t('We’ll confirm by phone or email. Nothing is booked until we do.')}</p>
          </form>
        )}
      </div>
    </>
  );
}
