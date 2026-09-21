'use client';

import { useState } from 'react';
import { safeUrl } from '../lib/api';
import { bookingHref, isoDay, nightsBetween, stayProblem, type Stay } from '../lib/booking';
import type { Booking } from '../@types/scene.types';

const Cal = () => (
  <svg viewBox="0 0 24 24" aria-hidden><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
const People = () => (
  <svg viewBox="0 0 24 24" aria-hidden><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.5-3.6 3-5.6 6-5.6s5.5 2 6 5.6" /><path d="M16 5.2a3 3 0 0 1 0 5.8M18 14.8c1.8.7 2.8 2.4 3 5.2" /></svg>
);

/**
 * The Book now card (§7.6): the room, the dates and party size if the hotel
 * wants them, the price the hotel typed, and one button that continues on the
 * hotel's own booking page with those choices filled in. We never take a
 * booking or a payment here.
 */
export function BookingCard({ booking, place, onClose }: { booking: Booking; place: string; onClose: () => void }) {
  const [stay, setStay] = useState<Stay>(() => ({ checkin: isoDay(1), checkout: isoDay(3), guests: 2 }));
  const set = (patch: Partial<Stay>) => setStay((s) => {
    const next = { ...s, ...patch };
    // Moving check-in past check-out drags check-out along, one night on.
    if (patch.checkin && !(nightsBetween(next.checkin, next.checkout) >= 1)) {
      next.checkout = isoDay(1, new Date(`${next.checkin}T12:00:00`));
    }
    return next;
  });

  const problem = booking.askDates ? stayProblem(stay) : null;
  const href = safeUrl(bookingHref(booking.url, booking.askDates ? stay : null));
  const nights = nightsBetween(stay.checkin, stay.checkout);
  let host = '';
  try { host = href ? new URL(href).hostname.replace(/^www\./, '') : ''; } catch { /* not a URL */ }

  return (
    <>
      <div className="vw-sheet-scrim" onClick={onClose} />
      <div className="vw-sheet vw-sheet-book" role="dialog" aria-label={booking.label || 'Book now'}>
        <button className="vw-sheet-x" onClick={onClose} aria-label="Close">✕</button>
        <h2>{booking.title?.trim() || place}</h2>
        {booking.subtitle?.trim() && <p className="vw-sheet-sub">{booking.subtitle}</p>}

        {booking.askDates && (
          <div className="vw-stay">
            <label className="vw-sheet-field">
              <Cal />
              <span className="vw-sheet-field-txt">
                <span>Check in</span>
                <input type="date" value={stay.checkin} min={isoDay(0)} onChange={(e) => set({ checkin: e.target.value })} />
              </span>
            </label>
            <label className="vw-sheet-field">
              <Cal />
              <span className="vw-sheet-field-txt">
                <span>Check out</span>
                <input type="date" value={stay.checkout} min={stay.checkin ? isoDay(1, new Date(`${stay.checkin}T12:00:00`)) : isoDay(1)} onChange={(e) => set({ checkout: e.target.value })} />
              </span>
            </label>
            <label className="vw-sheet-field">
              <People />
              <span className="vw-sheet-field-txt">
                <span>Guests</span>
                <select value={stay.guests} onChange={(e) => set({ guests: Number(e.target.value) })}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>{n} {n === 1 ? 'adult' : 'adults'}</option>
                  ))}
                </select>
              </span>
            </label>
            {nights >= 1 && <p className="vw-sheet-fine">{nights === 1 ? '1 night' : `${nights} nights`}</p>}
          </div>
        )}

        {booking.price?.trim() && (
          <p className="vw-price">
            <b>{booking.price}</b>{booking.priceUnit?.trim() && <span> {booking.priceUnit}</span>}
          </p>
        )}
        {booking.priceNote?.trim() && <p className="vw-sheet-fine">{booking.priceNote}</p>}

        {problem && <p className="vw-sheet-err">{problem}</p>}
        {href && !problem ? (
          <a className="vw-sheet-go" href={href} target="_blank" rel="noopener noreferrer">{booking.label.trim() || 'Book now'}</a>
        ) : (
          <button className="vw-sheet-go" disabled>{booking.label.trim() || 'Book now'}</button>
        )}
        {host && <p className="vw-sheet-fine vw-sheet-center">Continues on {host} to finish booking.</p>}
      </div>
    </>
  );
}
