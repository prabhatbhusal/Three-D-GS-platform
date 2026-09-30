/**
 * Table bookings for a project's website (/s/<project>, #reserve). The
 * restaurant's setup — its floor plan, tables, hours — is part of the site
 * document (sites.js cleanBooking), so it goes live on Publish. Bookings are
 * requests: the guest picks a table and a time, the restaurant confirms or
 * declines from the studio.
 *
 * Times are the restaurant's own wall clock, in its `timezone`. A table is
 * held for `stay` minutes from its booking's start, so a start time is free
 * for a table when no live booking on it starts within `stay` minutes either
 * side. Stored as data/reservations/<project>.json; every write goes through
 * one queue per project, so two guests can't both get the last table.
 * Room bookings (stays.js) live in the same file, marked kind: 'stay'.
 */
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { DATA_DIR } from './dataDir.js';

const DIR = path.join(DATA_DIR, 'reservations');
const fileOf = (pid) => path.join(DIR, `${pid}.json`);
export const LIVE = ['requested', 'confirmed']; // statuses that hold a table
export const STATUSES = ['requested', 'confirmed', 'declined', 'cancelled'];

export async function listReservations(pid) {
  try { return JSON.parse(await fs.readFile(fileOf(pid), 'utf8')); } catch { return []; }
}

const queues = new Map();
/** Read, change and write one project's bookings, one change at a time. */
export function withReservations(pid, change) {
  const run = (queues.get(pid) ?? Promise.resolve()).then(async () => {
    const list = await listReservations(pid);
    const out = await change(list);
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(fileOf(pid), JSON.stringify(list, null, 2));
    return out;
  });
  queues.set(pid, run.catch(() => {}));
  return run;
}

/** Read one project's bookings in its turn, between writes: a read that lands
 *  while the file is being rewritten would see it half-written, and an empty
 *  list would make every table look free. */
export function readReservations(pid) {
  const run = (queues.get(pid) ?? Promise.resolve()).then(() => listReservations(pid));
  queues.set(pid, run.catch(() => {}));
  return run;
}

export const removeReservations = (pid) => fs.rm(fileOf(pid), { force: true });

/* ------------------------------------------------------------ the clock */

export const toMin = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
const toHm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Today's date and the minute of the day, on the restaurant's clock. */
export function nowIn(timezone, at = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

export const addDays = (date, n) =>new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** The days a guest may pick: today to `days` ahead, closed weekdays marked. */
export function bookableDates(cfg, now) {
  return Array.from({ length: cfg.days + 1 }, (_, i) => {
    const date = addDays(now.date, i);
    return { date, closed: cfg.closed.includes(weekday(date)) };
  });
}

const LEAD_MIN = 30; // today, the soonest bookable start is half an hour away

/** Start times on a date, first to last seating; none on a closed or out-of-range day. */
export function slotsFor(cfg, date, now) {
  const day = bookableDates(cfg, now).find((d) => d.date === date);
  if (!day || day.closed) return [];
  const out = [];
  for (let m = toMin(cfg.first); m <= toMin(cfg.last); m += cfg.slot) {
    if (date === now.date && m < now.min + LEAD_MIN) continue;
    out.push(toHm(m));
  }
  return out;
}

/** Is this table free to start at `time` on `date`? */
export function tableFree(list, cfg, tableId, date, time) {
  const t = toMin(time);
  return !list.some((r) => r.table === tableId && r.date === date && LIVE.includes(r.status) && Math.abs(toMin(r.time) - t) < cfg.stay);
}

/** Each start time on a date, with the tables free then. No names, nothing personal. */
export function availability(list, cfg, date, now) {
  return slotsFor(cfg, date, now).map((time) => ({
    time, free: cfg.tables.filter((tb) => tableFree(list, cfg, tb.id, date, time)).map((tb) => tb.id)
  }));
}

/** "Any table": the smallest free one that seats the party. */
export function bestTable(list, cfg, party, date, time) {
  return [...cfg.tables]
    .filter((tb) => tb.seats >= party && tableFree(list, cfg, tb.id, date, time))
    .sort((a, b) => a.seats - b.seats)[0] ?? null;
}

/** One dining place's bookings (a site's other places, site.dining, have
 *  their own tables; the main place's bookings carry no `outlet`). */
export const atOutlet = (list, outlet = '') => list.filter((r) => (r.outlet ?? '') === outlet);

export function newReservation(fields) {
  const at = new Date().toISOString();
  return { id: randomUUID(), status: 'requested', createdAt: at, updatedAt: at, ...fields };
}
