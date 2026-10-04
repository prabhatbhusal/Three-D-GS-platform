/**
 * The AI concierge in the tour (2026-09-28): a visitor asks a question in
 * their own words and gets an answer from what the project has published —
 * its brand information, its website (story, rooms, menu, booking hours) and
 * its spaces (their hotspots and views) — and, where it helps, the tour goes
 * to the place the answer is about. Claude through Anthropic's Messages API,
 * Node's own fetch, no SDK. Off until ANTHROPIC_API_KEY is set in server/.env.
 *
 *   ANTHROPIC_API_KEY=sk-ant-...     from console.anthropic.com
 *   CONCIERGE_MODEL=claude-opus-5-5  the default; claude-haiku-4-5-20251001 costs less
 *
 *   GET  /api/concierge/:project   public: { on }
 *   POST /api/concierge/:project   public: { question, history?: [{ role, text }], space?, lang? }
 *                                  -> { answer, show: { space, view?, hotspot? } | null }
 *
 * Only published things go in, and the answer's place is checked against
 * them, so it can't send a visitor anywhere unpublished or made up.
 */
import { Router } from 'express';
import { getProperty, getPublishedScene, listPublished } from '../store.js';
import { readSite, liveBooking, liveStays } from './sites.js';

export const conciergeRouter = Router();
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);

const API = () => process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';
const on = () => !!process.env.ANTHROPIC_API_KEY;
const LANG = { en: 'English', ne: 'Nepali', zh: 'Simplified Chinese' };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const RATE_MAX = Number(process.env.CONCIERGE_RATE_MAX) || 20; // per IP, per 10 minutes
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_MAX;
}

const line = (label, v) => (v ? `${label}: ${v}` : '');
const block = (...rows) => rows.flat().filter(Boolean).join('\n');

/** Everything the concierge may answer from, as plain text, and the places it may send a visitor. */
export async function knowledgeOf(p) {
  const info = p.info ?? {};
  const site = (await readSite(p.id))?.published ?? null;
  const spaces = [];
  for (const g of (await listPublished()).filter((x) => x.propertyId === p.id)) {
    const snap = await getPublishedScene(g.id).catch(() => null);
    if (snap) spaces.push(snap);
  }
  const places = spaces.map((s) => ({ id: s.id, views: (s.tracks ?? []).map((t) => t.id), hotspots: (s.hotspots ?? []).map((h) => h.id) }));

  const text = (h) => [h.payload?.text, h.payload?.caption, h.payload?.transcript].filter(Boolean).join(' ');
  const parts = [
    block(`# ${p.theme?.brand || p.title}`,
      line('Tagline', info.tagline), line('About', info.about), line('Phone', info.phone), line('Email', info.email),
      line('Address', info.address), line('Website', info.website)),
    site && block('## The website',
      line('Headline', site.hero?.title), line('Introduction', site.hero?.lede),
      (site.facts ?? []).map((f) => `- ${f.n} ${f.k}`),
      site.story?.body && `### ${site.story.title || 'Story'}\n${site.story.body}`,
      (site.rooms ?? []).map((r) => `### ${r.title}\n${r.body}${r.features ? `\nFeatures: ${r.features}` : ''}${r.space ? `\n(Its 3D space: ${r.space})` : ''}`)),
    ...[site?.menu, ...(site?.dining ?? []).map((o) => ({ ...o.menu, title: `${o.name}: ${o.menu.title || 'Menu'}` }))]
      .filter((m) => m?.items?.length)
      .map((m) => block(`## ${m.title || 'Menu'}`, m.note,
        m.items.map((x) => `- ${x.name}${x.price ? ` (${x.price})` : ''}${x.desc ? `: ${x.desc}` : ''}${x.tag ? ` [${x.tag}]` : ''}`))),
    liveBooking(site) && (() => {
      const b = liveBooking(site);
      return block('## Table booking (on the website and in the tour: "Reserve a table")',
        `Seatings from ${b.first} to ${b.last}, every ${b.slot} minutes; online for up to ${b.maxParty} guests.`,
        b.closed.length ? `Closed on ${b.closed.map((d) => DAYS[d]).join(', ')}.` : '', b.note);
    })(),
    liveStays(site) && (() => {
      const s = liveStays(site);
      return block('## Rooms (booked on the website and in the tour: "Book a room")',
        `Check-in from ${s.checkin}, check-out by ${s.checkout}. Stays of ${s.minNights} to ${s.maxNights} nights online.`,
        s.rooms.map((r) => `- ${r.label}: sleeps ${r.sleeps}${r.price ? `, ${r.price} ${r.per}` : ''}${r.features ? `; ${r.features}` : ''}${r.space ? ` (its 3D space: ${r.space})` : ''}`),
        s.note);
    })(),
    site?.contact && block('## Contact', site.contact.title, site.contact.body),
    spaces.length && block('## The 3D tour: its spaces (ids in brackets)', spaces.map((s) => block(
      `### ${s.title} [space: ${s.id}]${s.building || s.floor ? ` (${[s.building, s.floor].filter(Boolean).join(', ')})` : ''}`,
      s.tagline,
      (s.tracks ?? []).map((t) => `- View "${t.label}" [view: ${t.id}]${t.transcript ? `: ${t.transcript}` : ''}`),
      (s.hotspots ?? []).map((h) => `- Hotspot "${h.label}" [hotspot: ${h.id}]${text(h) ? `: ${text(h)}` : ''}`),
      s.booking?.enabled && `- Book now: ${s.booking.title || s.title}${s.booking.price ? `, ${s.booking.price} ${s.booking.priceUnit ?? ''}` : ''}`
    )))
  ];
  // ponytail: all of it, capped; retrieval per question if a project ever outgrows ~40k characters
  return { text: parts.filter(Boolean).join('\n\n').slice(0, 40000), places };
}

const REPLY_TOOL = {
  name: 'reply',
  description: 'Answer the visitor. Optionally take them to the place in the 3D tour the answer is about.',
  input_schema: {
    type: 'object',
    properties: {
      answer: { type: 'string', description: 'The answer, short and friendly: at most 3 sentences.' },
      space: { type: 'string', description: 'A space id from the brackets, if the answer is about a place they can see.' },
      view: { type: 'string', description: 'A view id in that space that shows it, if there is one.' },
      hotspot: { type: 'string', description: 'A hotspot id in that space to open, if one is about exactly this.' }
    },
    required: ['answer']
  }
};

// Whether the AI concierge is switched on for this project.
conciergeRouter.get('/:project', wrap(async (req, res) => {
  res.json({ on: on() && !!(await getProperty(req.params.project)) });
}));

// Ask the concierge; it answers only from what the project published (rate-limited).
conciergeRouter.post('/:project', wrap(async (req, res) => {
  if (!on()) return res.status(404).json({ error: 'The concierge isn’t switched on here.' });
  if (rateLimited(req.ip || 'unknown')) return res.status(429).json({ error: 'That’s a lot of questions. Try again in a few minutes, or send an enquiry.' });
  const p = await getProperty(req.params.project);
  if (!p) return res.status(404).json({ error: 'That project does not exist.' });
  const question = String(req.body?.question ?? '').trim().slice(0, 500);
  if (!question) return res.status(400).json({ error: 'Ask a question.' });
  const history = (Array.isArray(req.body?.history) ? req.body.history : []).slice(-6)
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({ role: m.role, content: m.text.slice(0, 800) }));
  while (history.length && history[0].role !== 'user') history.shift(); // the API wants the user first
  const lang = LANG[req.body?.lang] ?? LANG.en;
  const { text, places } = await knowledgeOf(p);
  const here = typeof req.body?.space === 'string' ? places.find((x) => x.id === req.body.space)?.id : null;

  const system = [
    `You are the concierge inside the 3D virtual tour of ${p.theme?.brand || p.title}. Visitors walk the place in 3D and ask you about it.`,
    'Answer only from the information below. If it isn’t there, say you don’t know and suggest the enquiry form ("Ask about this space") or the phone number; never guess prices, availability, opening times or facts.',
    'You can’t take bookings or check what’s free. For a table or a room, point them to the "Reserve a table" or "Book a room" buttons if they exist below; otherwise to an enquiry.',
    'When the answer is about something they can see in the tour, set space (and a view or hotspot that shows it) so the tour takes them there. Use only ids from the brackets below.',
    `Reply in ${lang}. Keep it short and warm. Always answer through the reply tool.`,
    here ? `The visitor is in the space [space: ${here}] now.` : '',
    '',
    '<information>', text, '</information>'
  ].filter((x) => x !== '').join('\n');

  let r;
  try {
    r = await fetch(API(), {
      method: 'POST',
      headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.CONCIERGE_MODEL || 'claude-opus-5-5',
        max_tokens: 600,
        system,
        tools: [REPLY_TOOL],
        tool_choice: { type: 'tool', name: 'reply' },
        messages: [...history, { role: 'user', content: question }]
      }),
      signal: AbortSignal.timeout(30000)
    });
  } catch {
    return res.status(502).json({ error: 'The concierge didn’t answer. Try again, or send an enquiry.' });
  }
  if (!r.ok) {
    console.warn('[concierge] the model said', r.status);
    return res.status(502).json({ error: 'The concierge couldn’t answer just now. Try again, or send an enquiry.' });
  }
  const out = (await r.json()).content?.find((c) => c.type === 'tool_use' && c.name === 'reply')?.input ?? {};
  const answer = String(out.answer ?? '').trim().slice(0, 1200) || 'Sorry, I don’t know that. Try the enquiry form, and the team will answer.';
  // Where to go: only a published space of this project, and only its own views and hotspots.
  const place = places.find((x) => x.id === out.space);
  const show = place ? {
    space: place.id,
    ...(place.views.includes(out.view) ? { view: out.view } : {}),
    ...(place.hotspots.includes(out.hotspot) ? { hotspot: out.hotspot } : {})
  } : null;
  res.json({ answer, show });
}));
