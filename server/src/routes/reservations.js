/**
 * Table and room bookings (reservations.js and stays.js have the rules).
 * Public: what's free, and asking for a table or a room — no auth, so the
 * enquiry form's defences: a rate limit, a honeypot, a fill-time check,
 * capped fields, no HTML. Studio: the project's bookings of both kinds, and
 * confirming or declining them (the guest is emailed either way, if they
 * left an address).
 *
 *   GET   /api/sites/:id/booking                        public: the live table setup, or null (the tour asks)
 *   GET   /api/sites/:id/availability?date=YYYY-MM-DD   public
 *   POST  /api/sites/:id/reservations                   public: { table | 'any', date, time, party, name, phone, email?, notes? }
 *   GET   /api/sites/:id/stays                          public: the live room setup, or null (the tour asks)
 *   GET   /api/sites/:id/stays/availability             public: the room calendar
 *   POST  /api/sites/:id/stays                          public: { room, checkin, checkout, guests, name, phone, email?, notes? }
 *   POST  /api/sites/:id/waitlist                       public: { of: 'table', date, time?, party } or
 *                                                        { of: 'room', checkin, checkout, room?, party }, and name, phone, email?
 *   GET   /api/sites/:id/reservations                   studio, and the client's staff: both kinds, and the waitlist
 *   PATCH /api/sites/:id/reservations/:rid              studio, and the client's staff: { status }
 *                                                        (a waitlist entry's: 'notified' tells them now, 'removed')
 *
 * Guests hear back by email and, where set up, by SMS or WhatsApp (notify.js).
 */
import { Router } from 'express';
import { getProperty } from '../store.js';
import { requireEditorSession } from '../middleware/auth.js';
import { visibleProject, staffProject } from './properties.js';
import { readSite, liveBooking, liveStays, publicStays, cleanSite, reviewed } from './sites.js';
import { sendMail, teamRecipients } from '../mailer.js';
import { record } from '../activity.js';
import {
  LIVE, STATUSES, availability, bestTable, bookableDates, readReservations, newReservation, nowIn, slotsFor, tableFree, withReservations
} from '../reservations.js';
import { nightsOf, roomsFree, roomsNeeded, stayCalendar, stayProblem } from '../stays.js';
import { WAIT_STATUSES, waitersWithSpace } from '../waitlist.js';
import { textGuest } from '../notify.js';

export const reservationsRouter = Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

const NO_BOOKING = { error: 'This place doesn’t take table bookings online.' };
const NO_STAYS = { error: 'This place doesn’t take room bookings online.' };

/** The project and its live booking setup (the published site's), or null. */
async function bookingOf(pid) {
  const p = await getProperty(pid);
  const cfg = p ? liveBooking((await readSite(p.id))?.published) : null;
  return cfg ? { p, cfg } : null;
}
async function staysOf(pid) {
  const p = await getProperty(pid);
  const cfg = p ? liveStays((await readSite(p.id))?.published) : null;
  return cfg ? { p, cfg } : null;
}

// Every tour asks whether its project takes table bookings, so "no" is an
// ordinary answer here, not a 404 that each visitor's browser logs as an error.
reservationsRouter.get('/:id/booking', wrap(async (req, res) => {
  res.json({ booking: (await bookingOf(req.params.id))?.cfg ?? null });
}));

reservationsRouter.get('/:id/availability', wrap(async (req, res) => {
  await sendAvailability(req, res, await bookingOf(req.params.id));
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
  const cfg = liveBooking(draft);
  await sendAvailability(req, res, cfg ? { p, cfg } : null);
}), requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const cfg = liveBooking(cleanSite((await readSite(p.id))?.draft, p.id));
  await sendAvailability(req, res, cfg ? { p, cfg } : null);
}));

async function sendAvailability(req, res, b) {
  if (!b) return res.status(404).json(NO_BOOKING);
  const now = nowIn(b.cfg.timezone);
  const dates = bookableDates(b.cfg, now);
  const asked = typeof req.query.date === 'string' && dates.some((d) => d.date === req.query.date) ? req.query.date : null;
  // Unasked, the first day that still has a time left.
  const date = asked ?? dates.find((d) => slotsFor(b.cfg, d.date, now).length)?.date ?? now.date;
  const list = await readReservations(b.p.id);
  res.json({ today: now.date, dates, date, slots: availability(list, b.cfg, date, now) });
}

// Same as /booking: every tour asks, and "no rooms online" is an ordinary answer.
reservationsRouter.get('/:id/stays', wrap(async (req, res) => {
  const p = await getProperty(req.params.id);
  res.json({ stays: p ? await publicStays(p.id, (await readSite(p.id))?.published) : null });
}));

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

reservationsRouter.post('/:id/reservations', wrap(async (req, res) => {
  const g = guestFrom(req, res);
  if (!g) return;
  const { body, guest } = g;
  const b = await bookingOf(req.params.id);
  if (!b) return res.status(404).json(NO_BOOKING);
  const { p, cfg } = b;
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
    const table = any ? bestTable(list, cfg, party, date, time) : tableFree(list, cfg, chosen.id, date, time) ? chosen : null;
    if (!table) return null;
    const made = newReservation({ table: table.id, tableLabel: table.label, date, time, party, ...guest });
    list.push(made);
    return made;
  });
  if (!r) {
    return res.status(409).json({ error: any ? `No table for ${party} is free at ${time}. Try another time.` : 'Someone has just booked that table for then. Pick another table or time.' });
  }
  res.status(201).json({ ok: true, id: r.id, table: r.table, tableLabel: r.tableLabel, date, time, party });
  tellTheTeam(p, r, `Table request: ${party} at ${time}, ${dayName(date)} — ${r.name}`, `New table request for ${venueOf(p)}`,
    [['Name', r.name], ['Phone', r.phone], ['Email', r.email], ['Guests', party], ['Table', r.tableLabel || r.table],
      ['Day', dayName(date)], ['Time', time], ['Notes', r.notes]]);
}));

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
    const cfg = liveBooking(published);
    if (!cfg) return res.status(404).json(NO_BOOKING);
    if (!Number.isInteger(party) || party < 1) return res.status(400).json({ error: 'How many of you?' });
    if (party > cfg.maxParty) return res.status(400).json({ error: `For more than ${cfg.maxParty}, please call us.` });
    const date = String(body.date ?? ''), time = String(body.time ?? '');
    const now = nowIn(cfg.timezone);
    if (!bookableDates(cfg, now).some((d) => d.date === date && !d.closed)) return res.status(400).json({ error: 'That day can’t be booked.' });
    if (time && !slotsFor(cfg, date, now).includes(time)) return res.status(400).json({ error: 'That time can’t be booked.' });
    entry = { of: 'table', date, time, party };
  }
  const w = await withReservations(p.id, (list) => {
    const made = newReservation({ kind: 'wait', ...entry, ...guest, status: 'waiting' });
    list.push(made);
    return made;
  });
  res.status(201).json({ ok: true, id: w.id });
}));

const noIp = ({ ip, ...r }) => r; // eslint-disable-line no-unused-vars

/** What a waiting guest is told when a place may have opened up: by text, and by email if they left one. */
function tellWaiter(p, w) {
  const venue = venueOf(p);
  const what = w.of === 'room'
    ? `${w.roomLabel || 'a room'} from ${shortDay(w.date)} to ${shortDay(w.checkout)}`
    : `a table for ${w.party} on ${shortDay(w.date)}${w.time ? ` at ${w.time}` : ''}`;
  const text = `${venue}: good news, ${what} may now be free. Book it before someone else does: ${siteLink(p.id)}#${w.of === 'room' ? 'stay' : 'reserve'}`;
  Promise.all([
    textGuest(w.phone, text),
    w.email ? sendMail({ to: [w.email], subject: `A place may be free at ${venue}`, text: `Hello ${w.name},\n\n${text}\n\n${venue}` }) : null
  ]).then(([texted, mailed]) => withReservations(p.id, (list) => {
    const x = list.find((y) => y.id === w.id);
    if (x) x.noticeDelivery = { ...texted, ...(mailed ? { email: mailed } : {}), at: new Date().toISOString() };
  })).catch((err) => console.warn('[waitlist] notice:', err.message));
}

reservationsRouter.get('/:id/reservations', requireEditorSession, wrap(async (req, res) => {
  const p = await staffProject(req, res);
  if (!p) return;
  const published = (await readSite(p.id))?.published;
  const booking = published?.booking ?? null;
  const stays = published?.stays ?? null;
  const list = (await readReservations(p.id)).map(noIp).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  res.json({ reservations: list, booking, stays, today: nowIn(booking?.timezone || stays?.timezone || 'Asia/Kathmandu').date });
}));

reservationsRouter.patch('/:id/reservations/:rid', requireEditorSession, wrap(async (req, res) => {
  const p = await staffProject(req, res);
  if (!p) return;
  const status = req.body?.status;
  if (![...STATUSES, ...WAIT_STATUSES].includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}.` });
  const published = (await readSite(p.id))?.published;
  const cfg = published?.booking ?? { stay: 90 };
  let freed = [];
  const r = await withReservations(p.id, (list) => {
    const x = list.find((y) => y.id === req.params.rid);
    if (!x) return null;
    if ((x.kind === 'wait') !== WAIT_STATUSES.includes(status)) return { wrong: true, kind: x.kind };
    // Taking back a declined or cancelled booking must not double-book its table or room.
    if (LIVE.includes(status) && !LIVE.includes(x.status)) {
      const others = list.filter((y) => y !== x);
      const room = published?.stays?.rooms?.find((y) => y.id === x.room);
      const free = x.kind === 'stay'
        ? !!room && roomsFree(others, room, x.checkin, x.checkout) >= x.rooms
        : tableFree(others, cfg, x.table, x.date, x.time);
      if (!free) return { taken: x.kind === 'stay' ? 'room' : 'table' };
    }
    const was = x.status;
    x.status = status;
    x.updatedAt = new Date().toISOString();
    // A table or room let go: whoever on the waitlist could now book is told, and marked told.
    if (LIVE.includes(was) && !LIVE.includes(status)) {
      freed = waitersWithSpace(list, liveBooking(published), liveStays(published));
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
      : 'That table has been booked for then since. Offer the guest another time.' });
  }
  const stay = r.kind === 'stay';
  const what = stay ? `${r.name}, ${r.roomLabel}, ${dayName(r.checkin)} for ${r.nights} night${r.nights === 1 ? '' : 's'}` : `${r.name}, ${dayName(r.date)} ${r.time}`;
  await record(req, p.id, `${status === 'requested' ? 'reopened' : status} a ${stay ? 'room' : 'table'} booking`, what);
  res.json({ ...noIp(r), waitlistTold: freed.length });
  for (const w of freed) tellWaiter(p, w);

  // The guest hears back: by text where set up, and by email if they left one.
  if (!['confirmed', 'declined'].includes(status)) return;
  const venue = venueOf(p);
  let mail;
  if (stay) {
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
  const short = stay
    ? (status === 'confirmed'
      ? `${venue}: your stay is confirmed, ${r.rooms > 1 ? `${r.rooms} × ` : ''}${r.roomLabel}, ${shortDay(r.checkin)} to ${shortDay(r.checkout)}. See you then.`
      : `${venue}: sorry, we can’t offer ${r.roomLabel} from ${shortDay(r.checkin)}. Other dates may be free: ${siteLink(p.id)}#stay`)
    : (status === 'confirmed'
      ? `${venue}: your table for ${r.party} on ${shortDay(r.date)} at ${r.time} is confirmed. See you then.`
      : `${venue}: sorry, we can’t seat you on ${shortDay(r.date)} at ${r.time}. Another time may be free: ${siteLink(p.id)}#reserve`);
  Promise.all([textGuest(r.phone, short), r.email ? sendMail({ to: [r.email], ...mail, replyTo: undefined }) : null])
    .then(([texted, mailed]) => withReservations(p.id, (list) => {
      const x = list.find((y) => y.id === r.id);
      if (x) x.guestDelivery = { ...(mailed ?? { sent: false, reason: 'no email address' }), ...texted, at: new Date().toISOString() };
    }))
    .catch((err) => console.warn('[reservations] guest message:', err.message));
}));
