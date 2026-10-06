/**
 * Book now (CLAUDE.md §7.6) — the dates-and-guests half. Pure, no imports,
 * so it is tested directly (test/client.test.mjs).
 *
 * We have no booking engine. The hotel's own booking page does the booking;
 * all this does is carry the visitor's dates and party size across, by filling
 * {checkin} {checkout} {guests} {nights} in the link the hotel gave us, e.g.
 *   https://basera.com/book?arrive={checkin}&depart={checkout}&adults={guests}
 * The caller still runs the result through safeUrl() before rendering it.
 */

export interface Stay {
  checkin: string; // YYYY-MM-DD
  checkout: string; // YYYY-MM-DD
  guests: number;
}

/** Local calendar date `days` from `from`, as YYYY-MM-DD. */
export function isoDay(days = 0, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The calendar date `days` from now at the venue (its timezone, Nepal's by
 *  default), as YYYY-MM-DD: the day the server calls today (reservations.js
 *  nowIn). A visitor abroad, on an earlier date than the venue, would
 *  otherwise be offered a check-in the server rejects as past. */
export function venueDay(days = 0, timeZone = 'Asia/Kathmandu', from = new Date()): string {
  let ymd: string;
  try {
    ymd = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(from);
  } catch {
    ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit' }).format(from);
  }
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function nightsBetween(checkin: string, checkout: string): number {
  const a = Date.parse(`${checkin}T00:00:00Z`);
  const b = Date.parse(`${checkout}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : NaN;
}

/** Why this stay can't be booked yet, in words — or null when it can. */
export function stayProblem(s: Stay, today = isoDay(0)): string | null {
  if (!s.checkin || !s.checkout) return 'Pick your check-in and check-out dates.';
  if (s.checkin < today) return 'Check-in can’t be in the past.';
  const n = nightsBetween(s.checkin, s.checkout);
  if (!(n >= 1)) return 'Check-out has to be at least a day after check-in.';
  if (!(s.guests >= 1)) return 'Add at least one guest.';
  return null;
}

/* ---- Room booking on the website (server/src/stays.js has the same rules) ---- */

/** Rooms of a type a party needs, when each sleeps `sleeps`. */
export const roomsNeeded = (guests: number, sleeps: number) => Math.max(1, Math.ceil(guests / sleeps));

/**
 * Rooms of one type free on every night of a stay, from the server's
 * calendar: `free[i]` rooms on the night of `dates[i]` (consecutive days).
 * 0 when any night is full, or the stay runs outside the calendar.
 */
export function freeForStay(dates: string[], free: number[] | undefined, checkin: string, checkout: string): number {
  const from = dates.indexOf(checkin);
  const nights = nightsBetween(checkin, checkout);
  if (!free || from < 0 || !(nights >= 1) || from + nights > dates.length) return 0;
  return Math.min(...free.slice(from, from + nights));
}

/** The hotel's link with the stay filled in. With no stay (dates not asked),
 *  any placeholders are left empty rather than sent as literal "{checkin}". */
export function bookingHref(template: string, stay: Stay | null): string {
  const values: Record<string, string> = stay
    ? { checkin: stay.checkin, checkout: stay.checkout, guests: String(stay.guests), nights: String(nightsBetween(stay.checkin, stay.checkout)) }
    : {};
  return template.trim().replace(/\{(checkin|checkout|guests|nights)\}/g, (_, k: string) => encodeURIComponent(values[k] ?? ''));
}

/* ------------------------------------------------------------------ */
/* Table hotspots and dining places (2026-10-04)                        */
/* ------------------------------------------------------------------ */

interface Place { on: boolean; plan: string; tables: { id: string }[]; name?: string; outlet?: string }

/** The dining places that take table bookings, each tagged with its id and
 *  name: the same list the public tour gets (server routes/sites.js
 *  liveBooking), built here from a draft for the studio's preview. */
export function livePlaces<B extends Place>(site: { booking?: B | null; dining?: { id: string; name: string; booking?: B | null }[] } | null | undefined): B[] {
  const live = (b: B | null | undefined) => (b?.on && b.plan && b.tables.length ? b : null);
  return [
    live(site?.booking),
    ...(site?.dining ?? []).map((o) => { const b = live(o.booking); return b && { ...b, name: o.name, outlet: o.id }; })
  ].filter((b): b is B => !!b);
}

/** Where a table hotspot's Reserve this table goes: its own dining place, if
 *  that place takes bookings and still has the table. Otherwise null, and the
 *  hotspot offers its own Book now; never another place's booking, since two
 *  places can both have a "T1". */
export function bookableTable(places: Place[] | undefined, outlet: string | undefined, tableId: string | undefined) {
  if (!places || !tableId) return null;
  const place = places.find((b) => (b.outlet ?? '') === (outlet ?? ''));
  return place?.tables.some((t) => t.id === tableId) ? { outlet: place.outlet ?? '', tableId } : null;
}
