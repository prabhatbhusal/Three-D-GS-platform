'use client';

import { useEffect, useState } from 'react';
import { getHereHall, getHereTables, requestHere, safeUrl, type Availability, type EventSession } from '../../lib/api';
import { bookingHref, nightsBetween, venueDay } from './booking';
import { countIntent } from '../../lib/stats';
import { useT } from '../../lib/i18n';
import type { Hotspot } from '../../@types/hotspot.types';

const Cal = () => (
  <svg viewBox="0 0 24 24" aria-hidden><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
const People = () => (
  <svg viewBox="0 0 24 24" aria-hidden><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.5-3.6 3-5.6 6-5.6s5.5 2 6 5.6" /><path d="M16 5.2a3 3 0 0 1 0 5.8M18 14.8c1.8.7 2.8 2.4 3 5.2" /></svg>
);
const Clock = () => (
  <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
const Table = () => (
  <svg viewBox="0 0 24 24" aria-hidden><ellipse cx="12" cy="9" rx="8.5" ry="3.5" /><path d="M12 12.5V20M8 20h8" /></svg>
);

const SESSIONS: [EventSession, string][] = [['day', 'Daytime'], ['evening', 'Evening'], ['full', 'Whole day']];
const OCCASIONS = ['Wedding', 'Reception', 'Birthday', 'Conference', 'Meeting', 'Other'];
const INTENT = { room: 'room', hall: 'event', table: 'table' } as const;
const seatsOf = (h: Hotspot) => h.payload?.capacity ?? 0;

/**
 * Book now on a room, hall or table hotspot, over the tour (2026-09-30):
 * what that kind of booking needs (the nights; the day and part of it; the
 * day and time), a name and a phone, one button. It works with nothing else
 * set up: the request lands in the studio's Reservations, where the team
 * confirms or declines it, and what's booked is the hotspot itself (its
 * name, price, deposit). With the hotel's own booking page on the hotspot,
 * the button goes there instead, the dates filled in.
 *
 * A table is one of many in its room, each its own hotspot (`tables`): the
 * card shows the times it's free (the table-booking hours, taken sittings
 * struck out), lets the visitor switch to any other table there, and offers
 * the ones free at their time when theirs isn't, or seats too few.
 */
export function HotspotBookCard({ project, space, hs, tables = [], preview = false, onClose }: {
  project: string; space: string; hs: Hotspot;
  /** Every table hotspot in this space, this one among them. */
  tables?: Hotspot[];
  /** The studio's Preview: nothing is sent. */
  preview?: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const kind = hs.type as 'room' | 'hall' | 'table';
  const pl = hs.payload ?? {};
  const own = safeUrl(pl.bookUrl);
  // a table's day and time start empty: the first day with a free sitting, and this table's first free time
  const [ask, setAsk] = useState({
    date: kind === 'table' ? '' : venueDay(kind === 'hall' ? 1 : 0), checkout: venueDay(1), time: kind === 'table' && own ? '19:00' : '',
    session: 'evening' as EventSession, occasion: '', guests: kind === 'hall' ? 100 : 2, table: hs.id
  });
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', website: '' });
  const [renderedAt] = useState(() => Date.now());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const set = (patch: Partial<typeof ask>) => { setAsk((a) => ({ ...a, ...patch })); setError(''); };

  // the path to a booking (monthly report): this card opened, in this space
  useEffect(() => { countIntent(space, INTENT[kind]); }, [space, kind]);

  // When this room's tables are free (published hotspots only). `fresh` reloads it after a send.
  const booksTables = kind === 'table' && !own;
  const [avail, setAvail] = useState<(Availability & { tables: string[] }) | null>(null);
  const [noTimes, setNoTimes] = useState(false);
  const [fresh, setFresh] = useState(0);
  useEffect(() => {
    if (!booksTables) return;
    let live = true;
    getHereTables(project, space, ask.date || undefined)
      .then((a) => { if (live) { setAvail(a); setNoTimes(false); } })
      .catch(() => { if (live) { setAvail(null); setNoTimes(true); } });
    return () => { live = false; };
  }, [booksTables, project, space, ask.date, fresh]);

  // A hall: the parts of the chosen day already asked for are struck out (the server refuses them anyway).
  const booksHall = kind === 'hall' && !own;
  const [hallTaken, setHallTaken] = useState<EventSession[]>([]);
  useEffect(() => {
    if (!booksHall || !ask.date) return;
    let live = true;
    getHereHall(project, space, hs.id, ask.date)
      .then((a) => { if (live) setHallTaken(a?.taken ?? []); })
      .catch(() => { if (live) setHallTaken([]); });
    return () => { live = false; };
  }, [booksHall, project, space, hs.id, ask.date, fresh]);

  const table = kind === 'table' ? tables.find((x) => x.id === ask.table) ?? hs : hs;
  // The times come from the hours; if they can't load, a time is typed instead (the server still checks it).
  const timed = booksTables && !!avail;
  const loading = booksTables && !avail && !noTimes;
  const slots = avail?.slots ?? [];
  const freeAt = (at: string) => slots.find((s) => s.time === at)?.free ?? [];
  // Taken, for a table the server knows. A draft's (the studio, before publishing) has only the hours.
  const takenAt = (id: string, at: string) => !!avail?.tables.includes(id) && !freeAt(at).includes(id);
  const day = ask.date || avail?.date || '';
  // the time they picked, else this table's first free one
  const time = !timed ? ask.time : slots.some((s) => s.time === ask.time) ? ask.time : slots.find((s) => !takenAt(table.id, s.time))?.time ?? '';
  const fits = (h: Hotspot) => !seatsOf(h) || seatsOf(h) >= ask.guests;
  // the other tables here that are free then and seat everyone
  const others = timed && time ? tables.filter((x) => x.id !== table.id && avail?.tables.includes(x.id) && freeAt(time).includes(x.id) && fits(x)) : [];

  const nights = nightsBetween(ask.date, ask.checkout);
  const problem = loading ? null
    : kind === 'room' && !(nights >= 1) ? t('Check-out has to be at least a day after check-in.')
      : !(ask.guests >= 1) ? t('How many guests?')
        : kind === 'table' && !time ? (!timed ? t('Pick a time.') : slots.length ? t('This table is taken all that day.') : t('We don’t take bookings that day. Pick another.'))
          : timed && takenAt(table.id, time) ? t('This table is taken at {time}.', { time })
            : kind === 'table' && !fits(table) ? t('This table seats {n}.', { n: seatsOf(table) })
              : null;
  const tp = table.payload ?? {};
  // a table's own line ("By the window"), as the visitor switches between them
  const line = kind === 'table' ? tp.text : '';
  const facts = [
    kind === 'table' && tp.capacity ? t('Seats {n}', { n: tp.capacity }) : '',
    kind === 'room' && pl.capacity ? t('Sleeps {n}', { n: pl.capacity }) : '',
    kind === 'hall' && pl.capacity ? t('Seats {n}', { n: pl.capacity }) : '',
    kind === 'hall' && pl.standing ? t('{n} standing', { n: pl.standing }) : '',
    kind !== 'table' ? pl.price ?? '' : ''
  ].filter(Boolean).join(' · ');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (problem || preview || loading) return;
    if (own) {
      // their own booking page, with the dates filled in
      window.open(bookingHref(own, { checkin: ask.date || venueDay(0), checkout: kind === 'room' ? ask.checkout : ask.date || venueDay(0), guests: ask.guests }), '_blank', 'noopener');
      return;
    }
    if (!form.name.trim() || !form.phone.trim()) return setError(t('Add your name and phone, so we can confirm.'));
    setSending(true);
    setError('');
    try {
      await requestHere(project, {
        space, hotspot: table.id, guests: ask.guests, date: kind === 'table' ? day : ask.date,
        ...(kind === 'room' ? { checkout: ask.checkout } : kind === 'hall' ? { session: ask.session, occasion: ask.occasion } : { time }),
        ...form, formRenderedAt: renderedAt
      });
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
      // someone may have just taken it: show the times as they are now
      if (booksTables) setFresh((n) => n + 1);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="vw-sheet-scrim" onClick={onClose} />
      <div className="vw-sheet vw-sheet-book vw-sheet-table" role="dialog" aria-label={table.label}>
        <button className="vw-sheet-x" onClick={onClose} aria-label={t('Close')}>✕</button>
        {done ? (
          <div className="vw-sheet-done">
            <span className="vw-sheet-tick" aria-hidden>✓</span>
            <h2>{t('Request sent')}</h2>
            <p className="vw-sheet-sub">{kind === 'table' ? `${table.label} · ${day} · ${time}` : table.label}</p>
            <p className="vw-sheet-fine">{t('We’ll confirm by phone or email. Nothing is booked until we do.')}</p>
            <button className="vw-sheet-go vw-sheet-go-quiet" onClick={onClose}>{t('Keep exploring')}</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2>{table.label}</h2>
            {(facts || pl.deposit || line) && (
              <p className="vw-sheet-sub">
                {facts}{facts && pl.deposit && <br />}{pl.deposit && `${t('Deposit')}: ${pl.deposit}`}
                {line && <>{facts && <br />}{line}</>}
              </p>
            )}

            <div className="vw-stay">
              {booksTables && tables.length > 1 && (
                <label className="vw-sheet-field">
                  <Table />
                  <span className="vw-sheet-field-txt">
                    <span>{t('Table')}</span>
                    <select value={table.id} onChange={(e) => set({ table: e.target.value })}>
                      {tables.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.label}{seatsOf(x) ? ` · ${t('Seats {n}', { n: seatsOf(x) })}` : ''}{timed && time && takenAt(x.id, time) ? ` · ${t('taken')}` : ''}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              )}
              <label className="vw-sheet-field">
                <Cal />
                <span className="vw-sheet-field-txt">
                  <span>{kind === 'room' ? t('Check in') : t('Day')}</span>
                  {booksTables ? (
                    <input type="date" value={day} min={avail?.dates[0]?.date ?? venueDay(0)} max={avail?.dates.at(-1)?.date}
                      onChange={(e) => e.target.value && set({ date: e.target.value })} />
                  ) : (
                    <input type="date" value={ask.date || venueDay(0)} min={venueDay(kind === 'hall' ? 1 : 0)}
                      onChange={(e) => set({ date: e.target.value, ...(kind === 'room' && e.target.value >= ask.checkout ? { checkout: e.target.value } : {}) })} />
                  )}
                </span>
              </label>
              {kind === 'room' && (
                <label className="vw-sheet-field">
                  <Cal />
                  <span className="vw-sheet-field-txt">
                    <span>{t('Check out')}</span>
                    <input type="date" value={ask.checkout} min={ask.date} onChange={(e) => set({ checkout: e.target.value })} />
                  </span>
                </label>
              )}
              {kind === 'table' && (
                <label className="vw-sheet-field">
                  <Clock />
                  <span className="vw-sheet-field-txt">
                    <span>{t('Time')}</span>
                    {timed ? (
                      <select value={time} onChange={(e) => set({ time: e.target.value })} disabled={!slots.length}>
                        {!time && <option value="">—</option>}
                        {slots.map((s) => (
                          <option key={s.time} value={s.time}>{s.time}{takenAt(table.id, s.time) ? ` · ${t('taken')}` : ''}</option>
                        ))}
                      </select>
                    ) : (
                      <input type="time" value={ask.time} step={900} onChange={(e) => set({ time: e.target.value })} />
                    )}
                  </span>
                </label>
              )}
              {kind === 'hall' && (
                <label className="vw-sheet-field">
                  <Clock />
                  <span className="vw-sheet-field-txt">
                    <span>{t('Part of the day')}</span>
                    <select value={ask.session} onChange={(e) => set({ session: e.target.value as EventSession })}>
                      {SESSIONS.map(([k, label]) => (
                        <option key={k} value={k} disabled={hallTaken.includes(k)}>{t(label)}{hallTaken.includes(k) ? ` · ${t('taken')}` : ''}</option>
                      ))}
                    </select>
                  </span>
                </label>
              )}
              <label className="vw-sheet-field">
                <People />
                <span className="vw-sheet-field-txt">
                  <span>{t('Guests')}</span>
                  <input type="number" inputMode="numeric" min={1} max={5000} value={ask.guests}
                    onChange={(e) => set({ guests: Math.round(Number(e.target.value)) })} />
                </span>
              </label>
              {kind === 'hall' && (
                <label className="vw-sheet-field">
                  <span className="vw-sheet-field-txt">
                    <span>{t('What kind of event')}</span>
                    <select value={ask.occasion} onChange={(e) => set({ occasion: e.target.value })}>
                      <option value="">{t('Choose one')}</option>
                      {OCCASIONS.map((k) => <option key={k} value={k}>{t(k)}</option>)}
                    </select>
                  </span>
                </label>
              )}
              {kind === 'room' && nights >= 1 && <p className="vw-sheet-fine">{nights === 1 ? t('1 night') : t('{n} nights', { n: nights })}</p>}
              {booksTables && noTimes && <p className="vw-sheet-fine">{t('Couldn’t load the free times. Type the time you’d like.')}</p>}
            </div>

            {problem && others.length > 0 && (
              <div className="vw-free-tables">
                <span>{t('Free then:')}</span>
                {others.map((x) => (
                  <button key={x.id} type="button" onClick={() => set({ table: x.id })}>
                    {x.label}{seatsOf(x) ? ` · ${seatsOf(x)}` : ''}
                  </button>
                ))}
              </div>
            )}

            {!own && (
              <>
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
              </>
            )}

            {(error || problem) && <p className="vw-sheet-err">{error || problem}</p>}
            <button className="vw-sheet-go" type="submit" disabled={sending || !!problem || preview || loading}>
              {preview ? t('Preview: bookings open once you publish') : own ? t('Continue to booking') : sending ? t('Sending…') : t('Send booking request')}
            </button>
            <p className="vw-sheet-fine vw-sheet-center">
              {own ? t('You’ll finish on our own booking page.') : t('We’ll confirm by phone or email. Nothing is booked until we do.')}
            </p>
          </form>
        )}
      </div>
    </>
  );
}
