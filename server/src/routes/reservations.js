/**
 * Table and room bookings (reservations.js and stays.js have the rules).
 * Public: what's free, and asking for a table or a room — no auth, so the
 * enquiry form's defences: a rate limit, a honeypot, a fill-time check,
 * capped fields, no HTML. Studio: the project's bookings of both kinds, and
 * confirming or declining them (the guest is emailed either way, if they
 * left an address).
 *
 *   GET   /api/sites/:id/booking                        public: the live table setup, or null (the tour asks)
 *   (every table route takes ?outlet= / { outlet }: one of the site's other dining places; none, the main one)
 *   GET   /api/sites/:id/availability?date=YYYY-MM-DD   public
 *   POST  /api/sites/:id/reservations                   public: { table | 'any', date, time, party, name, phone, email?, notes? }
 *   GET   /api/sites/:id/stays                          public: the live room setup, or null (the tour asks)
 *   GET   /api/sites/:id/stays/availability             public: the room calendar
 *   POST  /api/sites/:id/stays                          public: { room, checkin, checkout, guests, name, phone, email?, notes? }
 *   GET   /api/sites/:id/events                         public: the live halls, or null (the tour asks)
 *   GET   /api/sites/:id/events/availability            public: which halls are taken when
 *   POST  /api/sites/:id/events                         public: { hall, date, session, guests, occasion, name, phone, email?, notes? }
 *   POST  /api/sites/:id/requests                       public: Book now on a room, hall or table hotspot in the tour:
 *                                                        { space, hotspot, guests, date, checkout? | session?, occasion? | time?, name, phone, email?, notes? }
 *   GET   /api/sites/:id/requests/tables?space=&date=   public: when each table hotspot in a space is free that day
 *   POST  /api/sites/:id/waitlist                       public: { of: 'table', date, time?, party } or
 *                                                        { of: 'room', checkin, checkout, room?, party }, and name, phone, email?
 *   GET   /api/sites/:id/reservations                   studio, and the client's staff: both kinds, and the waitlist
 *   PATCH /api/sites/:id/reservations/:rid              studio, and the client's staff: { status }
 *                                                        (a waitlist entry's: 'notified' tells them now, 'removed')
 *
 * Guests hear back by email and, where set up, by SMS or WhatsApp (notify.js).
 */
import { Router } from 'express';
import { getProperty, getPublishedScene } from '../store.js';
import { requireEditorSession } from '../middleware/auth.js';
import { visibleProject, staffProject } from './properties.js';
import { readSite, liveBooking, liveStays, publicStays, liveEvents, publicEvents, cleanSite, reviewed } from './sites.js';
import { sendMail, teamRecipients } from '../mailer.js';
import { record } from '../activity.js';
import {
  LIVE, STATUSES, atOutlet, availability, bestTable, bookableDates, readReservations, newReservation, nowIn, slotsFor, tableFree, withReservations
} from '../reservations.js';
import { nightsOf, roomsFree, roomsNeeded, stayCalendar, stayProblem } from '../stays.js';
import { SESSIONS, SESSION_LABEL, eventCalendar, eventProblem, hallFree, hallHotspotFree } from '../events.js';
import { WAIT_STATUSES, waitersWithSpace } from '../waitlist.js';
import { textGuest } from '../notify.js';

export const reservationsRouter = Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

const NO_BOOKING = { error: 'This place doesn’t take table bookings online.' };
const NO_STAYS = { error: 'This place doesn’t take room bookings online.' };
const NO_EVENTS = { error: 'This place doesn’t take event bookings online.' };

/** The project and its live booking setup (the published site's), or null. */
/** Which dining place a request is about: one of site.dining's ids, or '' (the main one). */
const outletOf = (v) => (typeof v === 'string' && /^[a-z0-9-]{1,24}$/i.test(v) ? v : '');

async function bookingOf(pid, outlet = '') {
  const p = await getProperty(pid);
  const cfg = p ? liveBooking((await readSite(p.id))?.published, outlet) : null;
  return cfg ? { p, cfg, outlet } : null;
}
async function staysOf(pid) {
  const p = await getProperty(pid);
  const cfg = p ? liveStays((await readSite(p.id))?.published) : null;
  return cfg ? { p, cfg } : null;
}
async function eventsOf(pid) {
  const p = await getProperty(pid);
  const cfg = p ? liveEvents((await readSite(p.id))?.published) : null;
  return cfg ? { p, cfg } : null;
}

// Every tour asks whether its project takes table bookings, so "no" is an
// ordinary answer here, not a 404 that each visitor's browser logs as an error.
// With it, `places`: every dining place taking bookings (the main one first), for the tour's choice.
reservationsRouter.get('/:id/booking', wrap(async (req, res) => {
  const p = await getProperty(req.params.id);
  const published = p ? (await readSite(p.id))?.published : null;
  const places = [liveBooking(published), ...(published?.dining ?? []).map((o) => liveBooking(published, o.id))].filter(Boolean);
  res.json({ booking: liveBooking(published, outletOf(req.query.outlet)), places });
}));

// Free table times on a day, at the main or another dining place (?outlet=).
reservationsRouter.get('/:id/availability', wrap(async (req, res) => {
  await sendAvailability(req, res, await bookingOf(req.params.id, outletOf(req.query.outlet)));
}));

/** The draft's booking for a client reviewing it (?key=, the review link's): no account, the key is the pass.
 *  Without a key, the route goes on to the studio's own (a session). Never books either way. */
const byReviewKey = (answer) => (req, res, next) => {
  if (typeof req.query.key !== 'string') return next();
  (async () => {
    const p = await getProperty(req.params.id);
    const saved = p && (await reviewed(p.id, req.query.key));
    if (!saved) return res.status(404).json({ error: 'This review link doesn’t work any more.' });
    await answer(req, res, p, cleanSite(saved.draft, p.id));
  })().catch(next);
};

/** Studio preview: the draft's tables and hours, against the real bookings. Never books. */
reservationsRouter.get('/:id/preview/availability', byReviewKey(async (req, res, p, draft) => {
  const outlet = outletOf(req.query.outlet);
  const cfg = liveBooking(draft, outlet);
  await sendAvailability(req, res, cfg ? { p, cfg, outlet } : null);
}), requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const outlet = outletOf(req.query.outlet);
  const cfg = liveBooking(cleanSite((await readSite(p.id))?.draft, p.id), outlet);
  await sendAvailability(req, res, cfg ? { p, cfg, outlet } : null);
}));

/** `b.list`: the bookings that hold these tables, when they aren't the place's own (the tour's table hotspots).
 *  `extra`: more to answer with. */
async function sendAvailability(req, res, b, extra = {}) {
  if (!b) return res.status(404).json(NO_BOOKING);
  const now = nowIn(b.cfg.timezone);
  const dates = bookableDates(b.cfg, now);
  const asked = typeof req.query.date === 'string' && dates.some((d) => d.date === req.query.date) ? req.query.date : null;
  // Unasked, the first day that still has a time left.
  const date = asked ?? dates.find((d) => slotsFor(b.cfg, d.date, now).length)?.date ?? now.date;
  const list = b.list ?? atOutlet(await readReservations(b.p.id), b.outlet);
  res.json({ today: now.date, dates, date, slots: availability(list, b.cfg, date, now), ...extra });
}

// Same as /booking: every tour asks, and "no rooms online" is an ordinary answer.
reservationsRouter.get('/:id/stays', wrap(async (req, res) => {
  const p = await getProperty(req.params.id);
  res.json({ stays: p ? await publicStays(p.id, (await readSite(p.id))?.published) : null });
}));

// Rooms left per night: the room booking calendar.
reservationsRouter.get('/:id/stays/availability', wrap(async (req, res) => {
  await sendCalendar(res, await staysOf(req.params.id));
}));

/** Studio preview: the draft's rooms, against the real bookings. Never books. */
reservationsRouter.get('/:id/preview/stays/availability', byReviewKey(async (req, res, p, draft) => {
  const cfg = liveStays(draft);
  await sendCalendar(res, cfg ? { p, cfg } : null);
}), requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const cfg = liveStays(cleanSite((await readSite(p.id))?.draft, p.id));
  await sendCalendar(res, cfg ? { p, cfg } : null);
}));

async function sendCalendar(res, b) {
  if (!b) return res.status(404).json(NO_STAYS);
  res.json(stayCalendar(await readReservations(b.p.id), b.cfg, nowIn(b.cfg.timezone).date));
}

// Same as /booking and /stays: every tour asks, and "no events online" is an ordinary answer.
reservationsRouter.get('/:id/events', wrap(async (req, res) => {
  const p = await getProperty(req.params.id);
  res.json({ events: p ? await publicEvents(p.id, (await readSite(p.id))?.published) : null });
}));

// Which halls are taken, and for which part of each day.
reservationsRouter.get('/:id/events/availability', wrap(async (req, res) => {
  const b = await eventsOf(req.params.id);
  if (!b) return res.status(404).json(NO_EVENTS);
  res.json(eventCalendar(await readReservations(b.p.id), b.cfg, nowIn(b.cfg.timezone).date));
}));

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = Number(process.env.RESERVE_RATE_MAX) || 5; // tests raise it
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_MAX;
}
const MIN_FILL_TIME_MS = 1200;
const LIMITS = { name: 100, phone: 30, email: 200, notes: 500 };
const text = (v) => String(v ?? '').replace(/[<>]/g, '').trim();

/**
 * Both booking forms' defences, then the guest's details. Answers the
 * request itself and returns null when it goes no further: too many from
 * this connection, a bot (answered as if it worked), or a field that's wrong.
 */
function guestFrom(req, res) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (rateLimited(ip)) { res.status(429).json({ error: 'Too many bookings from this connection. Try again shortly, or call us.' }); return null; }
  const body = req.body || {};
  const renderedAt = Number(body.formRenderedAt);
  if (text(body.website) || !renderedAt || Date.now() - renderedAt < MIN_FILL_TIME_MS) { res.json({ ok: true }); return null; }
  for (const [f, max] of Object.entries(LIMITS)) {
    if (text(body[f]).length > max) { res.status(400).json({ error: `${f} is too long — keep it under ${max} characters.` }); return null; }
  }
  const guest = { name: text(body.name), phone: text(body.phone), email: text(body.email), notes: text(body.notes), ip };
  if (!guest.name || !guest.phone) { res.status(400).json({ error: 'Add your name and phone, so we can confirm.' }); return null; }
  if (guest.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(guest.email)) { res.status(400).json({ error: 'That email address doesn’t look right.' }); return null; }
  return { body, guest };
}

/** Tell the project's people about a new request, after the guest has their answer; the result is kept on the booking. */
function tellTheTeam(p, r, subject, heading, rows) {
  (async () => {
    const lines = rows.filter(([, v]) => v).map(([k, v]) => `${`${k}:`.padEnd(10)}${v}`);
    const sent = await sendMail({
      to: teamRecipients(p.leadEmails ?? []),
      subject: subject.slice(0, 180),
      text: [heading, '', ...lines, '', 'Confirm or decline it in the studio: the project’s Reservations.'].join('\n'),
      replyTo: r.email || undefined
    });
    await withReservations(p.id, (list) => { const x = list.find((y) => y.id === r.id); if (x) x.delivery = { ...sent, at: new Date().toISOString() }; });
  })().catch((err) => console.warn('[reservations] email:', err.message));
}

const dayName = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const shortDay = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const siteLink = (pid) => `${(process.env.CLIENT_ORIGIN || 'http://localhost:3000').replace(/\/$/, '')}/s/${pid}`;
const venueOf = (p) => p.theme?.brand || p.title;

// A guest's table booking request from the website.
reservationsRouter.post('/:id/reservations', wrap(async (req, res) => {
  const g = guestFrom(req, res);
  if (!g) return;
  const { body, guest } = g;
  const b = await bookingOf(req.params.id, outletOf(body.outlet));
  if (!b) return res.status(404).json(NO_BOOKING);
  const { p, cfg, outlet } = b;
  const party = Number(body.party);
  if (!Number.isInteger(party) || party < 1) return res.status(400).json({ error: 'How many of you?' });
  if (party > cfg.maxParty) return res.status(400).json({ error: `For more than ${cfg.maxParty}, please call us.` });
  const date = String(body.date ?? ''), time = String(body.time ?? '');
  if (!slotsFor(cfg, date, nowIn(cfg.timezone)).includes(time)) return res.status(400).json({ error: 'That time can’t be booked. Pick another.' });
  const any = body.table === 'any';
  const chosen = any ? null : cfg.tables.find((t) => t.id === body.table);
  if (!any && !chosen) return res.status(400).json({ error: 'Pick a table on the plan.' });
  if (chosen && chosen.seats < party) return res.status(400).json({ error: `${chosen.label || 'That table'} seats ${chosen.seats}. Pick a bigger one.` });

  const r = await withReservations(p.id, (list) => {
    const here = atOutlet(list, outlet);
    const table = any ? bestTable(here, cfg, party, date, time) : tableFree(here, cfg, chosen.id, date, time) ? chosen : null;
    if (!table) return null;
    const made = newReservation({ table: table.id, tableLabel: table.label, date, time, party, ...(outlet ? { outlet, outletName: cfg.name } : {}), ...guest });
    list.push(made);
    return made;
  });
  if (!r) {
    return res.status(409).json({ error: any ? `No table for ${party} is free at ${time}. Try another time.` : 'Someone has just booked that table for then. Pick another table or time.' });
  }
  res.status(201).json({ ok: true, id: r.id, table: r.table, tableLabel: r.tableLabel, date, time, party });
  tellTheTeam(p, r, `Table request${outlet ? ` (${cfg.name})` : ''}: ${party} at ${time}, ${dayName(date)} — ${r.name}`, `New table request for ${venueOf(p)}${outlet ? `, ${cfg.name}` : ''}`,
    [['Name', r.name], ['Phone', r.phone], ['Email', r.email], ['Guests', party], ['Table', r.tableLabel || r.table],
      ['Day', dayName(date)], ['Time', time], ['Notes', r.notes]]);
}));

// A guest's room booking request from the website.
reservationsRouter.post('/:id/stays', wrap(async (req, res) => {
  const g = guestFrom(req, res);
  if (!g) return;
  const { body, guest } = g;
  const b = await staysOf(req.params.id);
  if (!b) return res.status(404).json(NO_STAYS);
  const { p, cfg } = b;
  const room = cfg.rooms.find((x) => x.id === body.room);
  if (!room) return res.status(400).json({ error: 'Pick a room.' });
  const stay = { checkin: String(body.checkin ?? ''), checkout: String(body.checkout ?? ''), guests: Number(body.guests) };
  const problem = stayProblem(cfg, room, stay, nowIn(cfg.timezone).date);
  if (problem) return res.status(400).json({ error: problem });
  const rooms = roomsNeeded(room, stay.guests);
  const nights = nightsOf(stay.checkin, stay.checkout).length;

  const r = await withReservations(p.id, (list) => {
    if (roomsFree(list, room, stay.checkin, stay.checkout) < rooms) return null;
    const made = newReservation({
      kind: 'stay', room: room.id, roomLabel: room.label, rooms, checkin: stay.checkin, checkout: stay.checkout, nights,
      party: stay.guests, date: stay.checkin, time: cfg.checkin, ...guest
    });
    list.push(made);
    return made;
  });
  if (!r) {
    return res.status(409).json({ error: rooms > 1 ? `There aren’t ${rooms} ${room.label} rooms free for all those nights. Try other dates or another room.` : `${room.label} isn’t free for all those nights. Try other dates or another room.` });
  }
  res.status(201).json({ ok: true, id: r.id, room: room.id, roomLabel: room.label, rooms, checkin: r.checkin, checkout: r.checkout, nights, guests: r.party });
  tellTheTeam(p, r, `Room request: ${room.label}, ${nights} night${nights === 1 ? '' : 's'} from ${shortDay(r.checkin)} — ${r.name}`,
    `New room request for ${venueOf(p)}`,
    [['Name', r.name], ['Phone', r.phone], ['Email', r.email], ['Room', rooms > 1 ? `${room.label} × ${rooms}` : room.label], ['Guests', r.party],
      ['Check-in', `${dayName(r.checkin)}, from ${cfg.checkin}`], ['Check-out', `${dayName(r.checkout)}, by ${cfg.checkout}`], ['Nights', nights], ['Notes', r.notes]]);
}));

// A guest's hall (event) booking request from the website.
reservationsRouter.post('/:id/events', wrap(async (req, res) => {
  const g = guestFrom(req, res);
  if (!g) return;
  const { body, guest } = g;
  const b = await eventsOf(req.params.id);
  if (!b) return res.status(404).json(NO_EVENTS);
  const { p, cfg } = b;
  const hall = cfg.halls.find((h) => h.id === body.hall);
  if (!hall) return res.status(400).json({ error: 'Pick a hall.' });
  const ask = { date: String(body.date ?? ''), session: String(body.session ?? ''), guests: Number(body.guests), occasion: text(body.occasion) };
  const problem = eventProblem(cfg, hall, ask, nowIn(cfg.timezone).date);
  if (problem) return res.status(400).json({ error: problem });

  const r = await withReservations(p.id, (list) => {
    if (!hallFree(list, hall.id, ask.date, ask.session)) return null;
    const made = newReservation({
      kind: 'event', hall: hall.id, hallLabel: hall.label, date: ask.date, time: '', session: ask.session,
      party: ask.guests, occasion: ask.occasion, ...guest
    });
    list.push(made);
    return made;
  });
  if (!r) return res.status(409).json({ error: `${hall.label} is already taken then (${SESSION_LABEL[ask.session].toLowerCase()}, ${shortDay(ask.date)}). Try another day or hall.` });
  res.status(201).json({ ok: true, id: r.id, hall: hall.id, hallLabel: hall.label, date: r.date, session: r.session, guests: r.party, occasion: r.occasion });
  tellTheTeam(p, r, `Event request: ${r.occasion}, ${r.party} guests, ${shortDay(r.date)} — ${r.name}`, `New event request for ${venueOf(p)}`,
    [['Name', r.name], ['Phone', r.phone], ['Email', r.email], ['Event', r.occasion], ['Guests', r.party], ['Hall', hall.label],
      ['Day', dayName(r.date)], ['When', SESSION_LABEL[r.session]], ['Notes', r.notes]]);
}));

/**
 * Book now on a room, hall or table hotspot (2026-09-30), with nothing else
 * set up: no website booking, no floor plan, no calendar. What the visitor
 * is booking comes from the published hotspot itself (its name, price,
 * deposit), never from the request. It lands with the other bookings, kind
 * 'request', for the team to confirm or decline. A room or hall request holds
 * nothing (the team knows their calendar). A table does: a dining room has
 * many tables, each its own hotspot, booked by the sitting like the website's
 * floor plan, on the hours under Website → Table booking (defaults if unset,
 * on or off), so one table is never asked for twice at one time.
 */
const BOOKABLE = ['room', 'hall', 'table'];
/** The table requests holding a space's tables, keyed like the floor plan's (`table`: the hotspot). */
const heldTables = (list, space) => list.filter((r) => r.kind === 'request' && r.of === 'table' && r.space === space && r.hotspot)
  .map((r) => ({ ...r, table: r.hotspot }));
/** A space's published tables (its table hotspots) on the table-booking hours. Not published yet
 *  (the studio trying its draft): the hours alone, no tables. Another project's space: null. */
async function tablesOf(pid, space) {
  const p = await getProperty(pid);
  if (!p || typeof space !== 'string' || !/^[a-z0-9-]+$/i.test(space)) return null;
  const snap = await getPublishedScene(space).catch(() => null);
  if (snap && snap.propertyId !== p.id) return null;
  const tables = (snap?.hotspots ?? []).filter((h) => h.type === 'table').map((h) => ({ id: h.id, seats: h.payload?.capacity ?? 0 }));
  return { p, space, cfg: { ...cleanSite((await readSite(p.id))?.published, p.id).booking, tables } };
}

// When each table in a space is free on a day (no names, nothing personal): the tour's Book now for tables.
// `tables`: the ones it knows; a table not among them (a draft's) has only the hours to go on.
reservationsRouter.get('/:id/requests/tables', wrap(async (req, res) => {
  const t = await tablesOf(req.params.id, req.query.space);
  await sendAvailability(req, res, t && { ...t, list: heldTables(await readReservations(t.p.id), t.space) },
    { tables: t?.cfg.tables.map((x) => x.id) ?? [] });
}));

// Which parts of a day a hall hotspot is already asked for (nothing personal): the tour's Book now
// strikes them out, the way the website's hall booking does.
reservationsRouter.get('/:id/requests/halls', wrap(async (req, res) => {
  const p = await getProperty(req.params.id);
  const { space, hotspot, date } = req.query;
  if (!p || typeof space !== 'string' || !/^[a-z0-9-]+$/i.test(space) || typeof hotspot !== 'string' || !DATE.test(String(date ?? ''))) {
    return res.status(400).json({ error: 'Which hall, and which day?' });
  }
  const list = await readReservations(p.id);
  res.json({ date, taken: SESSIONS.filter((s) => !hallHotspotFree(list, space, hotspot, date, s)) });
}));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const words = (v, n) => (typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, n) : '');
/** A booking request's when, in words: the nights, the part of the day, or the time. */
const requestWhen = (r) => r.of === 'room' ? `${shortDay(r.checkin)} → ${shortDay(r.checkout)} (${r.nights} night${r.nights === 1 ? '' : 's'})`
  : r.of === 'hall' ? `${shortDay(r.date)}, ${SESSION_LABEL[r.session]?.toLowerCase() ?? ''}`
    : `${shortDay(r.date)} at ${r.time}`;

// Book now on a table, room or hall hotspot in the tour. Tables and halls refuse a clash (409).
reservationsRouter.post('/:id/requests', wrap(async (req, res) => {
  const g = guestFrom(req, res);
  if (!g) return;
  const { body, guest } = g;
  const p = await getProperty(req.params.id);
  const space = typeof body.space === 'string' && /^[a-z0-9-]+$/i.test(body.space) ? body.space : '';
  const snap = p && space ? await getPublishedScene(space).catch(() => null) : null;
  const hs = snap && snap.propertyId === p.id ? (snap.hotspots ?? []).find((h) => h.id === body.hotspot && BOOKABLE.includes(h.type)) : null;
  if (!hs) return res.status(404).json({ error: 'This can’t be booked here. Send an enquiry instead.' });

  // the table-booking hours (and the place's clock), set up or not
  const hours = cleanSite((await readSite(p.id))?.published, p.id).booking;
  const now = nowIn(hours.timezone);
  const guests = Number(body.guests);
  if (!Number.isInteger(guests) || guests < 1 || guests > 5000) return res.status(400).json({ error: 'How many guests?' });
  const date = String(body.date ?? '');
  let when;
  if (hs.type === 'room') {
    const checkout = String(body.checkout ?? '');
    if (!DATE.test(date) || !DATE.test(checkout)) return res.status(400).json({ error: 'Pick your check-in and check-out dates.' });
    if (date < now.date) return res.status(400).json({ error: 'Check-in can’t be in the past.' });
    const nights = nightsOf(date, checkout).length;
    if (nights < 1) return res.status(400).json({ error: 'Check-out has to be at least a day after check-in.' });
    if (nights > 60) return res.status(400).json({ error: 'For more than 60 nights, please call us.' });
    when = { checkin: date, checkout, nights, time: '' };
  } else if (hs.type === 'hall') {
    if (!DATE.test(date) || date <= now.date) return res.status(400).json({ error: 'Pick a day from tomorrow on. For today, please call us.' });
    if (!SESSIONS.includes(body.session)) return res.status(400).json({ error: 'Daytime, evening or the whole day?' });
    when = { session: body.session, occasion: words(body.occasion, 40) || 'Event', time: '' };
  } else {
    const time = String(body.time ?? '');
    if (!DATE.test(date) || date < now.date) return res.status(400).json({ error: 'Pick the day.' });
    if (!HM.test(time)) return res.status(400).json({ error: 'Pick a time.' });
    const slots = slotsFor(hours, date, now);
    if (!slots.length) return res.status(400).json({ error: 'We don’t take bookings for that day. Pick another.' });
    if (!slots.includes(time)) return res.status(400).json({ error: 'Pick one of the times shown.' });
    const seats = hs.payload?.capacity;
    if (seats && guests > seats) return res.status(400).json({ error: `This table seats ${seats}. Pick a bigger one.` });
    when = { time };
  }

  const pl = hs.payload ?? {};
  const r = await withReservations(p.id, (list) => {
    // checked in the queue: two guests can't both get the same table at the same time, or the same hall for the same part of a day
    if (hs.type === 'table' && !tableFree(heldTables(list, snap.id), hours, hs.id, date, when.time)) return null;
    if (hs.type === 'hall' && !hallHotspotFree(list, snap.id, hs.id, date, when.session)) return null;
    const made = newReservation({
      kind: 'request', of: hs.type, item: words(hs.label, 80) || hs.type, space: snap.id, spaceTitle: words(snap.title, 80), hotspot: hs.id,
      date, party: guests, price: words(pl.price, 40), deposit: words(pl.deposit, 60), ...when, ...guest
    });
    list.push(made);
    return made;
  });
  if (!r) {
    return res.status(409).json({ error: hs.type === 'hall'
      ? 'This hall is already asked for at that time of day. Pick another day, or the other half of the day.'
      : 'Someone has just asked for this table at that time. Pick another time or table.' });
  }
  res.status(201).json({ ok: true, id: r.id });
  tellTheTeam(p, r, `Booking request:${r.item}, ${requestWhen(r)} — ${r.name}`, `New booking request for ${venueOf(p)}, from the 3D tour (${r.spaceTitle})`,
    [['Name', r.name], ['Phone', r.phone], ['Email', r.email], ['Booking', r.item], ['When', requestWhen(r)], ['Guests', r.party],
      ['Event', r.occasion], ['Price', r.price], ['Deposit', r.deposit], ['Notes', r.notes]]);
}));

// Join the waitlist for a full day; the guest is told when a place frees up.
reservationsRouter.post('/:id/waitlist', wrap(async (req, res) => {
  const g = guestFrom(req, res);
  if (!g) return;
  const { body, guest } = g;
  const p = await getProperty(req.params.id);
  const published = p ? (await readSite(p.id))?.published : null;
  const party = Number(body.party);
  let entry;
  if (body.of === 'room') {
    const cfg = liveStays(published);
    if (!cfg) return res.status(404).json(NO_STAYS);
    const room = body.room ? cfg.rooms.find((x) => x.id === body.room) : null;
    if (body.room && !room) return res.status(400).json({ error: 'Pick a room.' });
    const stay = { checkin: String(body.checkin ?? ''), checkout: String(body.checkout ?? ''), guests: party };
    // With no room named, any room will do: only the dates and the party are checked.
    const problem = stayProblem(cfg, room ?? { label: 'A room', sleeps: 40, units: 1 }, stay, nowIn(cfg.timezone).date);
    if (problem) return res.status(400).json({ error: problem });
    entry = { of: 'room', room: room?.id ?? '', roomLabel: room?.label ?? '', date: stay.checkin, checkout: stay.checkout,
      nights: nightsOf(stay.checkin, stay.checkout).length, time: cfg.checkin, party };
  } else {
    const outlet = outletOf(body.outlet);
    const cfg = liveBooking(published, outlet);
    if (!cfg) return res.status(404).json(NO_BOOKING);
    if (!Number.isInteger(party) || party < 1) return res.status(400).json({ error: 'How many of you?' });
    if (party > cfg.maxParty) return res.status(400).json({ error: `For more than ${cfg.maxParty}, please call us.` });
    const date = String(body.date ?? ''), time = String(body.time ?? '');
    const now = nowIn(cfg.timezone);
    if (!bookableDates(cfg, now).some((d) => d.date === date && !d.closed)) return res.status(400).json({ error: 'That day can’t be booked.' });
    if (time && !slotsFor(cfg, date, now).includes(time)) return res.status(400).json({ error: 'That time can’t be booked.' });
    entry = { of: 'table', date, time, party, ...(outlet ? { outlet, outletName: cfg.name } : {}) };
  }
  const w = await withReservations(p.id, (list) => {
    const made = newReservation({ kind: 'wait', ...entry, ...guest, status: 'waiting' });
    list.push(made);
    return made;
  });
  res.status(201).json({ ok: true, id: w.id });
}));

const noIp = ({ ip, ...r }) => r;

/** What a waiting guest is told when a place may have opened up: by text, and by email if they left one. */
function tellWaiter(p, w) {
  const venue = venueOf(p);
  const what = w.of === 'room'
    ? `${w.roomLabel || 'a room'} from ${shortDay(w.date)} to ${shortDay(w.checkout)}`
    : `a table for ${w.party} on ${shortDay(w.date)}${w.time ? ` at ${w.time}` : ''}`;
  const text = `${venue}: good news, ${what} may now be free. Book it before someone else does: ${siteLink(p.id)}#${w.of === 'room' ? 'stay' : `reserve${w.outlet ? `-${w.outlet}` : ''}`}`;
  Promise.all([
    textGuest(w.phone, text),
    w.email ? sendMail({ to: [w.email], subject: `A place may be free at ${venue}`, text: `Hello ${w.name},\n\n${text}\n\n${venue}` }) : null
  ]).then(([texted, mailed]) => withReservations(p.id, (list) => {
    const x = list.find((y) => y.id === w.id);
    if (x) x.noticeDelivery = { ...texted, ...(mailed ? { email: mailed } : {}), at: new Date().toISOString() };
  })).catch((err) => console.warn('[waitlist] notice:', err.message));
}

// The Reservations inbox: every booking and waitlist entry (the team, or the project's staff).
reservationsRouter.get('/:id/reservations', requireEditorSession, wrap(async (req, res) => {
  const p = await staffProject(req, res);
  if (!p) return;
  const published = (await readSite(p.id))?.published;
  const booking = published?.booking ?? null;
  const stays = published?.stays ?? null;
  const events = published?.events ?? null;
  const dining = published?.dining ?? [];
  const list = (await readReservations(p.id)).map(noIp).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  res.json({ reservations: list, booking, stays, events, dining, today: nowIn(booking?.timezone || stays?.timezone || events?.timezone || 'Asia/Kathmandu').date });
}));

// Confirm, decline, cancel or reopen a booking, re-checked so it can't double-book; tells the guest.
reservationsRouter.patch('/:id/reservations/:rid', requireEditorSession, wrap(async (req, res) => {
  const p = await staffProject(req, res);
  if (!p) return;
  const status = req.body?.status;
  if (![...STATUSES, ...WAIT_STATUSES].includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}.` });
  const published = (await readSite(p.id))?.published;
  // a table booking's own dining place's setup
  const cfgOf = (o) => (o ? published?.dining?.find((d) => d.id === o)?.booking : published?.booking) ?? { stay: 90 };
  // a hotspot's Book now: its table at that sitting, or its hall for that part of the day (as the requests route
  // checks them); a room hotspot has no count of rooms to check against
  const requestFree = (others, x) => x.of === 'table'
    ? tableFree(heldTables(others, x.space), cleanSite(published, p.id).booking, x.hotspot, x.date, x.time)
    : x.of === 'hall' ? hallHotspotFree(others, x.space, x.hotspot, x.date, x.session) : true;
  let freed = [];
  const r = await withReservations(p.id, (list) => {
    const x = list.find((y) => y.id === req.params.rid);
    if (!x) return null;
    if ((x.kind === 'wait') !== WAIT_STATUSES.includes(status)) return { wrong: true, kind: x.kind };
    // Taking back a declined or cancelled booking must not double-book its table or room.
    if (LIVE.includes(status) && !LIVE.includes(x.status)) {
      const others = list.filter((y) => y !== x);
      const room = published?.stays?.rooms?.find((y) => y.id === x.room);
      const free = x.kind === 'request' ? requestFree(others, x)
        : x.kind === 'stay' ? !!room && roomsFree(others, room, x.checkin, x.checkout) >= x.rooms
        : x.kind === 'event' ? hallFree(others, x.hall, x.date, x.session)
          : tableFree(atOutlet(others, x.outlet), cfgOf(x.outlet), x.table, x.date, x.time);
      if (!free) return { taken: x.kind === 'stay' || x.of === 'room' ? 'room' : x.kind === 'event' || x.of === 'hall' ? 'hall' : 'table' };
    }
    const was = x.status;
    x.status = status;
    x.updatedAt = new Date().toISOString();
    // A table or room let go: whoever on the waitlist could now book is told, and marked told.
    if (LIVE.includes(was) && !LIVE.includes(status)) {
      freed = waitersWithSpace(list, (o) => liveBooking(published, o), liveStays(published));
      for (const w of freed) Object.assign(w, { status: 'notified', notifiedAt: x.updatedAt, updatedAt: x.updatedAt });
      freed = freed.map((w) => ({ ...w }));
    }
    if (x.kind === 'wait' && status === 'notified') x.notifiedAt = x.updatedAt;
    return { ...x };
  });
  if (!r) return res.status(404).json({ error: 'That booking does not exist.' });
  if (r.wrong) {
    return res.status(400).json({ error: r.kind === 'wait'
      ? 'A waitlist entry can be notified or removed.' : 'A booking can be confirmed, declined, cancelled or reopened.' });
  }
  if (r.kind === 'wait') {
    await record(req, p.id, status === 'notified' ? 'told a waiting guest a place may be free' : status === 'removed' ? 'took a guest off the waitlist' : 'put a guest back on the waitlist', r.name);
    res.json(noIp(r));
    if (status === 'notified') tellWaiter(p, r);
    return;
  }
  if (r.taken) {
    return res.status(409).json({ error: r.taken === 'room'
      ? 'That room has been booked for some of those nights since. Offer the guest other dates.'
      : r.taken === 'hall' ? 'That hall has been booked for then since. Offer the guest another day or hall.'
        : 'That table has been booked for then since. Offer the guest another time.' });
  }
  const stay = r.kind === 'stay', event = r.kind === 'event', asked = r.kind === 'request';
  const what = stay ? `${r.name}, ${r.roomLabel}, ${dayName(r.checkin)} for ${r.nights} night${r.nights === 1 ? '' : 's'}`
    : event ? `${r.name}, ${r.occasion} in ${r.hallLabel}, ${dayName(r.date)}`
      : asked ? `${r.name}, ${r.item}, ${requestWhen(r)}` : `${r.name}, ${dayName(r.date)} ${r.time}`;
  await record(req, p.id, `${status === 'requested' ? 'reopened' : status} ${asked ? 'a' : event ? 'an event' : stay ? 'a room' : 'a table'} booking${asked ? ' request' : ''}`, what);
  res.json({ ...noIp(r), waitlistTold: freed.length });
  for (const w of freed) tellWaiter(p, w);

  // The guest hears back: by text where set up, and by email if they left one.
  if (!['confirmed', 'declined'].includes(status)) return;
  const venue = venueOf(p);
  let mail;
  if (asked) {
    mail = status === 'confirmed'
      ? { subject: `Your booking at ${venue} is confirmed`, text: `Hello ${r.name},\n\nYour booking is confirmed: ${r.item}, ${requestWhen(r)}, for ${r.party}.${r.deposit ? `\nDeposit: ${r.deposit}. We’ll tell you how to pay it.` : ''}\n\nSee you then,\n${venue}` }
      : { subject: `About your booking at ${venue}`, text: `Hello ${r.name},\n\nSorry, we can’t offer ${r.item} for ${requestWhen(r)}. Reply to this email or call us, and we’ll find you something else.\n\n${venue}` };
  } else if (event) {
    const when = `${dayName(r.date)} (${SESSION_LABEL[r.session].toLowerCase()})`;
    mail = status === 'confirmed'
      ? { subject: `Your event at ${venue} is confirmed`, text: `Hello ${r.name},\n\nYour ${r.occasion.toLowerCase()} for ${r.party} in ${r.hallLabel} on ${when} is confirmed. We’ll be in touch about the details.\n\n${venue}` }
      : { subject: `About your event at ${venue}`, text: `Hello ${r.name},\n\nSorry, ${r.hallLabel} isn’t free on ${when}. Other days or halls may be:\n${siteLink(p.id)}#events\n\n${venue}` };
  } else if (stay) {
    const rooms = r.rooms > 1 ? `${r.rooms} × ${r.roomLabel}` : r.roomLabel;
    const when = `${dayName(r.checkin)} to ${dayName(r.checkout)}`;
    mail = status === 'confirmed'
      ? { subject: `Your stay at ${venue} is confirmed`, text: `Hello ${r.name},\n\nYour stay is confirmed: ${rooms}, ${when} (${r.nights} night${r.nights === 1 ? '' : 's'}) for ${r.party}.\n\nSee you then,\n${venue}` }
      : { subject: `About your stay at ${venue}`, text: `Hello ${r.name},\n\nSorry, we can’t offer ${r.roomLabel} from ${when}. Other dates or rooms may be free:\n${siteLink(p.id)}#stay\n\n${venue}` };
  } else {
    const when = `${dayName(r.date)} at ${r.time}`;
    mail = status === 'confirmed'
      ? { subject: `Your table at ${venue} is confirmed`, text: `Hello ${r.name},\n\nYour table for ${r.party} on ${when} is confirmed${r.tableLabel ? ` (${r.tableLabel})` : ''}.\n\nSee you then,\n${venue}` }
      : { subject: `About your table at ${venue}`, text: `Hello ${r.name},\n\nSorry, we can’t seat you on ${when}. Another time may be free:\n${siteLink(p.id)}#reserve\n\n${venue}` };
  }
  const short = asked
    ? (status === 'confirmed'
      ? `${venue}: your booking is confirmed, ${r.item}, ${requestWhen(r)}.${r.deposit ? ` Deposit: ${r.deposit}.` : ''} See you then.`
      : `${venue}: sorry, we can’t offer ${r.item} for ${requestWhen(r)}. Call us and we’ll find you something else.`)
    : event
    ? (status === 'confirmed'
      ? `${venue}: your ${r.occasion.toLowerCase()} in ${r.hallLabel} on ${shortDay(r.date)} is confirmed. We’ll be in touch about the details.`
      : `${venue}: sorry, ${r.hallLabel} isn’t free on ${shortDay(r.date)}. Other days may be: ${siteLink(p.id)}#events`)
    : stay
    ? (status === 'confirmed'
      ? `${venue}: your stay is confirmed, ${r.rooms > 1 ? `${r.rooms} × ` : ''}${r.roomLabel}, ${shortDay(r.checkin)} to ${shortDay(r.checkout)}. See you then.`
      : `${venue}: sorry, we can’t offer ${r.roomLabel} from ${shortDay(r.checkin)}. Other dates may be free: ${siteLink(p.id)}#stay`)
    : (status === 'confirmed'
      ? `${venue}: your table for ${r.party} on ${shortDay(r.date)} at ${r.time} is confirmed. See you then.`
      : `${venue}: sorry, we can’t seat you on ${shortDay(r.date)} at ${r.time}. Another time may be free: ${siteLink(p.id)}#reserve${r.outlet ? `-${r.outlet}` : ""}`);
  Promise.all([textGuest(r.phone, short), r.email ? sendMail({ to: [r.email], ...mail, replyTo: undefined }) : null])
    .then(([texted, mailed]) => withReservations(p.id, (list) => {
      const x = list.find((y) => y.id === r.id);
      if (x) x.guestDelivery = { ...(mailed ?? { sent: false, reason: 'no email address' }), ...texted, at: new Date().toISOString() };
    }))
    .catch((err) => console.warn('[reservations] guest message:', err.message));
}));
