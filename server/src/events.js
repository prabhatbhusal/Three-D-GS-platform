/**
 * Event bookings (2026-09-29) for a hotel's or banquet venue's halls: the
 * counterpart of stays.js's rooms and reservations.js's tables. The halls —
 * how many each seats and holds standing, their size, photos and 3D space —
 * are part of the site document (sites.js cleanEvents), so they go live on
 * Publish. A guest asks for a hall on a day, for the daytime, the evening or
 * the whole day; the venue confirms or declines from the studio, like any
 * booking. Stored with the others and written through the same per-project
 * queue, marked kind: 'event'.
 */
import { LIVE, addDays } from './reservations.js';

export const SESSIONS = ['day', 'evening', 'full'];
export const SESSION_LABEL = { day: 'Daytime', evening: 'Evening', full: 'Whole day' };
/** What a new venue offers until it says otherwise. */
export const EVENT_KINDS = ['Wedding', 'Reception', 'Birthday', 'Conference', 'Meeting', 'Other'];

/** The whole day clashes with either half; the halves don't clash with each other. */
const clash = (a, b) => a === 'full' || b === 'full' || a === b;

/** Is the hall free for this part of this day? */
export function hallFree(list, hallId, date, session) {
  return !list.some((r) => r.kind === 'event' && r.hall === hallId && r.date === date && LIVE.includes(r.status) && clash(r.session, session));
}

/** What's taken, for the guest's calendar: hall → date → the sessions held. Nothing personal. */
export function eventCalendar(list, cfg, today) {
  const first = addDays(today, 1), last = addDays(today, cfg.days);
  const taken = {};
  for (const r of list) {
    if (r.kind !== 'event' || !LIVE.includes(r.status) || r.date < first || r.date > last) continue;
    ((taken[r.hall] ??= {})[r.date] ??= []).push(r.session);
  }
  return { today, first, last, taken };
}

/** Why an event can't be asked for, in words, or null. Whether the hall is free is checked separately. */
export function eventProblem(cfg, hall, { date, session, guests, occasion }, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Pick the day of your event.';
  if (date <= today) return 'Pick a day from tomorrow on. For today, please call us.';
  if (date > addDays(today, cfg.days)) return `We take event bookings up to ${cfg.days} days ahead. Call us for later dates.`;
  if (!SESSIONS.includes(session)) return 'Daytime, evening or the whole day?';
  if (!Number.isInteger(guests) || guests < 1) return 'How many guests?';
  const most = Math.max(hall.seated, hall.standing);
  if (guests > most) return `${hall.label} takes ${most} at most. Pick a bigger hall, or call us.`;
  if (!cfg.kinds.includes(occasion)) return 'What kind of event is it?';
  return null;
}
