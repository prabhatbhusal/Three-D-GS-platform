/**
 * Table bookings (reservations.js has the rules). Public: what's free on a
 * day, and booking a table — no auth, so the enquiry form's defences: a rate
 * limit, a honeypot, a fill-time check, capped fields, no HTML. Studio: the
 * project's bookings, and confirming or declining them (the guest is emailed
 * either way, if they left an address).
 *
 *   GET   /api/sites/:id/availability?date=YYYY-MM-DD   public
 *   POST  /api/sites/:id/reservations                   public: { table | 'any', date, time, party, name, phone, email?, notes? }
 *   GET   /api/sites/:id/reservations                   studio
 *   PATCH /api/sites/:id/reservations/:rid              studio: { status }
 */
import { Router } from 'express';
import { getProperty } from '../store.js';
import { requireEditorSession } from '../middleware/auth.js';
import { visibleProject } from './properties.js';
import { readSite, liveBooking, cleanSite } from './sites.js';
import { sendMail, teamRecipients } from '../mailer.js';
import { record } from '../activity.js';
import {
  LIVE, STATUSES, availability, bestTable, bookableDates, listReservations, newReservation, nowIn, slotsFor, tableFree, withReservations
} from '../reservations.js';

export const reservationsRouter = Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

const NO_BOOKING = { error: 'This place doesn’t take table bookings online.' };

/** The project and its live booking setup (the published site's), or null. */
async function bookingOf(pid) {
  const p = await getProperty(pid);
  const cfg = p ? liveBooking((await readSite(p.id))?.published) : null;
  return cfg ? { p, cfg } : null;
}

reservationsRouter.get('/:id/availability', wrap(async (req, res) => {
  await sendAvailability(req, res, await bookingOf(req.params.id));
}));

/** Studio preview: the draft's tables and hours, against the real bookings. Never books. */
reservationsRouter.get('/:id/preview/availability', requireEditorSession, wrap(async (req, res) => {
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
  const list = await listReservations(b.p.id);
  res.json({ today: now.date, dates, date, slots: availability(list, b.cfg, date, now) });
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

const dayName = (date) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const siteLink = (pid) => `${(process.env.CLIENT_ORIGIN || 'http://localhost:3000').replace(/\/$/, '')}/s/${pid}`;

reservationsRouter.post('/:id/reservations', wrap(async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many bookings from this connection. Try again shortly, or call us.' });
  const body = req.body || {};
  // Bot-catches answer as if it worked, like the enquiry form's.
  if (text(body.website)) return res.json({ ok: true });
  const renderedAt = Number(body.formRenderedAt);
  if (!renderedAt || Date.now() - renderedAt < MIN_FILL_TIME_MS) return res.json({ ok: true });

  const b = await bookingOf(req.params.id);
  if (!b) return res.status(404).json(NO_BOOKING);
  const { p, cfg } = b;
  for (const [f, max] of Object.entries(LIMITS)) {
    if (text(body[f]).length > max) return res.status(400).json({ error: `${f} is too long — keep it under ${max} characters.` });
  }
  const name = text(body.name), phone = text(body.phone), email = text(body.email), notes = text(body.notes);
  if (!name || !phone) return res.status(400).json({ error: 'Add your name and phone, so we can confirm.' });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'That email address doesn’t look right.' });
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
    const made = newReservation({ table: table.id, tableLabel: table.label, date, time, party, name, phone, email, notes, ip });
    list.push(made);
    return made;
  });
  if (!r) {
    return res.status(409).json({ error: any ? `No table for ${party} is free at ${time}. Try another time.` : 'Someone has just booked that table for then. Pick another table or time.' });
  }
  res.status(201).json({ ok: true, id: r.id, table: r.table, tableLabel: r.tableLabel, date, time, party });

  // Tell the restaurant after answering the guest; the result is kept on the booking.
  (async () => {
    const venue = p.theme?.brand || p.title;
    const rows = [['Name', name], ['Phone', phone], ['Email', email], ['Guests', party], ['Table', r.tableLabel || r.table],
      ['Day', dayName(date)], ['Time', time], ['Notes', notes]].filter(([, v]) => v).map(([k, v]) => `${`${k}:`.padEnd(9)}${v}`);
    const sent = await sendMail({
      to: teamRecipients(p.leadEmails ?? []),
      subject: `Table request: ${party} at ${time}, ${dayName(date)} — ${name}`.slice(0, 180),
      text: [`New table request for ${venue}`, '', ...rows, '', 'Confirm or decline it in the studio: the project’s Reservations.'].join('\n'),
      replyTo: email || undefined
    });
    await withReservations(p.id, (list) => { const x = list.find((y) => y.id === r.id); if (x) x.delivery = { ...sent, at: new Date().toISOString() }; });
  })().catch((err) => console.warn('[reservations] email:', err.message));
}));

const noIp = ({ ip, ...r }) => r; // eslint-disable-line no-unused-vars

reservationsRouter.get('/:id/reservations', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const booking = (await readSite(p.id))?.published?.booking ?? null;
  const list = (await listReservations(p.id)).map(noIp).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  res.json({ reservations: list, booking, today: nowIn(booking?.timezone || 'Asia/Kathmandu').date });
}));

reservationsRouter.patch('/:id/reservations/:rid', requireEditorSession, wrap(async (req, res) => {
  const p = await visibleProject(req, res);
  if (!p) return;
  const status = req.body?.status;
  if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}.` });
  const cfg = (await readSite(p.id))?.published?.booking ?? { stay: 90 };
  const r = await withReservations(p.id, (list) => {
    const x = list.find((y) => y.id === req.params.rid);
    if (!x) return null;
    // Taking back a declined or cancelled booking must not double-book its table.
    if (LIVE.includes(status) && !LIVE.includes(x.status) && !tableFree(list.filter((y) => y !== x), cfg, x.table, x.date, x.time)) return 'taken';
    x.status = status;
    x.updatedAt = new Date().toISOString();
    return { ...x };
  });
  if (!r) return res.status(404).json({ error: 'That booking does not exist.' });
  if (r === 'taken') return res.status(409).json({ error: 'That table has been booked for then since. Offer the guest another time.' });
  await record(req, p.id, `${status === 'requested' ? 'reopened' : status} a table booking`, `${r.name}, ${dayName(r.date)} ${r.time}`);
  res.json(noIp(r));

  // The guest hears back, if they left an email.
  if (!r.email || !['confirmed', 'declined'].includes(status)) return;
  const venue = p.theme?.brand || p.title;
  const when = `${dayName(r.date)} at ${r.time}`;
  const mail = status === 'confirmed'
    ? { subject: `Your table at ${venue} is confirmed`, text: `Hello ${r.name},\n\nYour table for ${r.party} on ${when} is confirmed${r.tableLabel ? ` (${r.tableLabel})` : ''}.\n\nSee you then,\n${venue}` }
    : { subject: `About your table at ${venue}`, text: `Hello ${r.name},\n\nSorry, we can’t seat you on ${when}. Another time may be free:\n${siteLink(p.id)}#reserve\n\n${venue}` };
  sendMail({ to: [r.email], ...mail, replyTo: undefined })
    .then((sent) => withReservations(p.id, (list) => { const x = list.find((y) => y.id === r.id); if (x) x.guestDelivery = { ...sent, at: new Date().toISOString() }; }))
    .catch((err) => console.warn('[reservations] guest email:', err.message));
}));
