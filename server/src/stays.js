/**
 * Room bookings for a project's website (/s/<project>, #stay), the rooms'
 * counterpart of reservations.js's tables. The hotel's setup — its room
 * types (or villas, one of a kind), how many of each, how many each sleeps,
 * an optional site plan they sit on — is part of the site document
 * (sites.js cleanStays), so it goes live on Publish. Bookings are requests
 * the hotel confirms or declines, stored with the table bookings and written
 * through the same per-project queue.
 *
 * A stay from check-in to check-out uses the nights in between (check-out
 * day itself is free for the next guest). A party bigger than a room sleeps
 * takes as many rooms of that type as it needs.
 */
import { LIVE, addDays } from './reservations.js';

/** The nights a stay uses: check-in up to, not including, check-out. */
export function nightsOf(checkin, checkout) {
  const out = [];
  for (let d = checkin; d < checkout && out.length < 366; d = addDays(d, 1)) out.push(d);
  return out;
}

export const roomsNeeded = (room, guests) => Math.max(1, Math.ceil(guests / room.sleeps));

/** Rooms of this type already held on each night, by live bookings. */
function heldByNight(list, roomId) {
  const held = new Map();
  for (const r of list) {
    if (r.kind !== 'stay' || r.room !== roomId || !LIVE.includes(r.status)) continue;
    for (const n of nightsOf(r.checkin, r.checkout)) held.set(n, (held.get(n) ?? 0) + r.rooms);
  }
  return held;
}

/** Rooms of this type free on every night of the stay (0 when any night is full). */
export function roomsFree(list, room, checkin, checkout) {
  const held = heldByNight(list, room.id);
  return Math.min(room.units, ...nightsOf(checkin, checkout).map((n) => room.units - (held.get(n) ?? 0)));
}

/**
 * The calendar a guest picks from: every day from today to the latest
 * check-out (the last check-in plus the longest stay), and for each room
 * type how many are free that night. The browser works out any stay from
 * it; the server checks again when the request comes in.
 */
export function stayCalendar(list, cfg, today) {
  const dates = Array.from({ length: cfg.days + cfg.maxNights + 1 }, (_, i) => addDays(today, i));
  const free = Object.fromEntries(cfg.rooms.map((room) => {
    const held = heldByNight(list, room.id);
    return [room.id, dates.map((d) => Math.max(0, room.units - (held.get(d) ?? 0)))];
  }));
  return { today, lastCheckin: addDays(today, cfg.days), dates, free };
}

/** Why a stay can't be asked for, in words, or null. Availability is checked separately. */
export function stayProblem(cfg, room, { checkin, checkout, guests }, today) {
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!date.test(checkin) || !date.test(checkout)) return 'Pick your check-in and check-out dates.';
  if (checkin < today) return 'Check-in can’t be in the past.';
  if (checkin > addDays(today, cfg.days)) return `We take bookings up to ${cfg.days} days ahead. Call us for later dates.`;
  const nights = nightsOf(checkin, checkout).length;
  if (nights < 1) return 'Check-out has to be at least a day after check-in.';
  if (nights < cfg.minNights) return `The shortest stay is ${cfg.minNights} nights.`;
  if (nights > cfg.maxNights) return `For more than ${cfg.maxNights} nights, please call us.`;
  if (!Number.isInteger(guests) || guests < 1) return 'How many guests?';
  if (guests > cfg.maxGuests) return `For more than ${cfg.maxGuests} guests, please call us.`;
  if (roomsNeeded(room, guests) > room.units) return `${room.label} sleeps ${room.sleeps * room.units} at most. Pick another room.`;
  return null;
}
