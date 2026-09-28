/**
 * The waitlist (2026-09-28): guests who found a day's tables, or a stay's
 * rooms, all taken. They're kept with the bookings (reservations.js), marked
 * kind: 'wait', and never hold a table or a room. When a booking is declined
 * or cancelled, the ones who could now book are told (routes/reservations.js),
 * first come first told; the studio can tell or remove one by hand.
 *
 *   waiting -> notified (told a place may be free) | removed
 */
import { bestTable, nowIn, slotsFor } from './reservations.js';
import { roomsFree, roomsNeeded } from './stays.js';

export const WAIT_STATUSES = ['waiting', 'notified', 'removed'];

/** Could this waiting guest book now? A table for their party that day (at
 *  their time, if they gave one); enough of their room (or any room) for their nights. */
export function hasSpace(list, w, booking, stays) {
  if (w.of === 'table') {
    if (!booking) return false;
    const times = slotsFor(booking, w.date, nowIn(booking.timezone));
    return (w.time ? times.filter((t) => t === w.time) : times).some((t) => !!bestTable(list, booking, w.party, w.date, t));
  }
  if (!stays) return false;
  const rooms = w.room ? stays.rooms.filter((r) => r.id === w.room) : stays.rooms;
  return rooms.some((r) => roomsNeeded(r, w.party) <= roomsFree(list, r, w.date, w.checkout));
}

/** The waiting guests who could book now, oldest first. */
export const waitersWithSpace = (list, booking, stays) =>
  list.filter((w) => w.kind === 'wait' && w.status === 'waiting' && hasSpace(list, w, booking, stays))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
