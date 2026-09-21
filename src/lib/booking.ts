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

/** The hotel's link with the stay filled in. With no stay (dates not asked),
 *  any placeholders are left empty rather than sent as literal "{checkin}". */
export function bookingHref(template: string, stay: Stay | null): string {
  const values: Record<string, string> = stay
    ? { checkin: stay.checkin, checkout: stay.checkout, guests: String(stay.guests), nights: String(nightsBetween(stay.checkin, stay.checkout)) }
    : {};
  return template.trim().replace(/\{(checkin|checkout|guests|nights)\}/g, (_, k: string) => encodeURIComponent(values[k] ?? ''));
}
