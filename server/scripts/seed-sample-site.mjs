/**
 * A complete sample project, to see everything a client website can hold
 * (2026-10-06): "Chyasal House", a made-up guesthouse, café and event loft in
 * Chyasal, Lalitpur. Its one space is the Office Chyasal scan (the same
 * uploaded files, shared, not copied), published as "The Loft", with hotspots
 * for its café tables and the loft as an event hall. The website has every
 * section filled: brand and logo, opening photo, facts, story, chapters with
 * View in 3D, gallery, café menu with table booking on a floor plan, rooms
 * with room booking, the loft as an event hall, offers, reviews, questions,
 * and the enquiry section. Its photos are frames of the scan
 * (scripts/sample-site/); swap them for real ones in the studio.
 *
 *   npm run seed:sample          (from server/; DATA_DIR as the API uses it)
 *   SEED_OWNER=<account id> npm run seed:sample
 *
 * The owner is SEED_OWNER, else whoever owns the Office Chyasal project, else
 * nobody (then any account can claim it). It writes only its own project,
 * space, website and files: run it again and it is put back as it was here.
 * The sample says it is one (its FAQ and footer note), and its addresses are
 * on example.test domains, so nothing reaches a real business.
 */
import 'dotenv/config'; // server/.env, as the API reads it (ASSET_DIR, ASSET_DRIVER)
import fs from 'fs/promises';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { DATA_DIR } from '../src/dataDir.js';
import * as storage from '../src/storage.js';
import {
  createProperty, getProperty, getScene, saveScene, publishScene, setPropertyTheme, setPropertyInfo, setLeadEmails, setPropertyFeatures
} from '../src/store.js';
import { cleanSite } from '../src/routes/sites.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILES = path.join(HERE, 'sample-site');
const PID = 'chyasal-house';
const SPACE = `${PID}-loft`;
const SOURCE = 'office-chyasal-lobby'; // the scan it shows
const now = Date.now();

const source = await getScene(SOURCE);
if (!source) {
  console.error(`[seed] The Office Chyasal space (${SOURCE}) isn't in ${DATA_DIR}: the sample uses its scan.`);
  process.exit(1);
}
const owner = process.env.SEED_OWNER || (await getProperty('office-chyasal'))?.ownerId || null;

// ---------------------------------------------------------------- project
if (!(await getProperty(PID))) await createProperty('Chyasal House', owner);
const put = async (assetId, rel, file) => storage.put(assetId, rel, Readable.from([await fs.readFile(path.join(FILES, file))]));
await put(`brand_${PID}`, 'logo.png', 'logo.png');
await setPropertyTheme(PID, { brand: 'Chyasal House', accent: '#8c3a22', font: 'classic' });
await setPropertyTheme(PID, { logo: `brand_${PID}/logo.png?v=${now}` });
await setPropertyInfo(PID, {
  tagline: 'Rooms, a café and an event loft above old Patan',
  about: 'A sample client of RCAAS.tech: a small guesthouse in Chyasal, Lalitpur, with a café and a 130 m² loft for workshops, exhibitions and dinners. Made to show what a client website can hold.',
  phone: '+977 1 5550 123',
  whatsapp: '+977 980 0000 123',
  email: 'hello@chyasalhouse.example.test',
  address: 'Chyasal, Lalitpur 44600, Nepal',
  website: 'https://chyasalhouse.example.test',
  instagram: 'https://instagram.com/chyasalhouse.example'
});
await setLeadEmails(PID, ['frontdesk@chyasalhouse.example.test']);
await setPropertyFeatures(PID, { enquiries: true, reservations: true, website: true, report: true, activity: true });

// ------------------------------------------------------------------ space
// The scan's six camera tracks, named for what they show; the website's
// tables and its hall point at them for "view from here".
const NAMES = ['Arrival', 'The window wall', 'North windows', 'The long view', 'The far corner', 'Back to the door'];
const tracks = source.tracks.map((t, i) => ({ ...t, id: `vp-loft-${i + 1}`, label: NAMES[i] ?? `View ${i + 1}` }));
const at = (i, y) => { const k = tracks[i % tracks.length].keyframes.at(-1).target; return [k[0], y, k[2]]; };
const hs = (id, type, label, position, payload, extra = {}) => ({ id: `hs-${SPACE}-${id}`, type, position, radius: 0.4, label, payload, occludedBy: 'none', ...extra });
const hotspots = [
  hs('loft', 'hall', 'The Loft', source.hotspots.find((h) => h.type === 'hall')?.position ?? at(0, 0), { hallId: 'loft', capacity: 70, standing: 120, text: 'Workshops, exhibitions and long dinners, for up to 120 standing.' }),
  hs('t1', 'table', 'Table 1', at(1, 0.75), { tableId: 't1', capacity: 2 }),
  hs('t2', 'table', 'Table 2', at(2, 0.75), { tableId: 't2', capacity: 2 }),
  hs('t4', 'table', 'Table 4', at(3, 0.75), { tableId: 't4', capacity: 6 }),
  hs('windows', 'text', 'Windows on three sides', at(2, 1.5), { text: 'Morning light from the east, the hills to the north, Patan’s roofs to the west.', reveal: 'always' })
];
await saveScene(SPACE, {
  ...source, id: SPACE, propertyId: PID, title: 'The Loft', tagline: 'A 130 m² open floor above Chyasal, windows on three sides',
  tracks, hotspots, booking: null, night: null, building: '', floor: ''
}, { creator: owner });
const pub = await publishScene(SPACE);
if (!pub?.published) { console.error('[seed] The space would not publish:', pub?.blockers); process.exit(1); }

// ----------------------------------------------------------------- photos
// Stored as the studio stores an upload: site_<project>/img-<time>-<w>x<h>.<ext>
const SIZES = { 'loft-1.jpg': [1800, 1125], 'loft-2.jpg': [1800, 1125], 'loft-3.jpg': [1800, 1125], 'loft-4.jpg': [1800, 1125], 'loft-5.jpg': [1800, 1125], 'loft-6.jpg': [1800, 1125], 'plan.png': [1341, 1703] };
const img = {};
let n = 0;
for (const [file, [w, h]] of Object.entries(SIZES)) {
  const rel = `img-${now + n++}-${w}x${h}.${file.endsWith('.png') ? 'png' : 'jpg'}`;
  await put(`site_${PID}`, rel, file);
  img[file.replace(/\.\w+$/, '')] = `site_${PID}/${rel}`;
}

// ---------------------------------------------------------------- website
const TZ = 'Asia/Kathmandu';
const table = (id, label, seats, x, y, shape, area, view = '') => ({ id, label, seats, x, y, shape, area, view });
const draft = cleanSite({
  style: 'heritage',
  hero: {
    eyebrow: 'Chyasal, Lalitpur', title: 'A loft of light above old Patan',
    lede: 'Six quiet rooms, a café that opens at eight, and a bright open floor for the days you bring people together. Walk it in 3D before you come.',
    space: SPACE, image: img['loft-3']
  },
  facts: [{ n: '6', k: 'rooms' }, { n: '130 m²', k: 'open loft' }, { n: '3', k: 'sides of windows' }, { n: '8', k: 'café tables' }, { n: '120', k: 'guests standing' }, { n: '10 min', k: 'walk to Patan Durbar Square' }],
  story: {
    title: 'A house for slow days in Patan',
    body: 'Chyasal House sits on a quiet lane between the brick courtyards of Chyasal and the temples of Patan Durbar Square, ten minutes away on foot.\n\nThe top floor is one open room with windows on three sides: in the morning it is the café, in the afternoon a workshop, and some evenings a long table for forty.\n\nThis is a sample website made by RCAAS.tech, on a real scan of a floor in Chyasal, to show what a client website can hold.'
  },
  rooms: [
    { title: 'The Loft', body: 'One open floor, 130 m², with nothing in the way: the café in the morning, workshops by day, dinners at night.', features: 'Windows on three sides, polished concrete, a kitchen next door', image: img['loft-4'], space: SPACE, view: 'vp-loft-4' },
    { title: 'The window wall', body: 'Where the light comes in. The two-seat tables are here, and the best seats for an exhibition opening.', features: 'East light until noon, tables for two', image: img['loft-3'], space: SPACE, view: 'vp-loft-2' },
    { title: 'The far corner', body: 'Quiet enough for a talk or a screening, with the long view back across the floor.', features: 'Projector wall, seats for 70', image: img['loft-5'], space: SPACE, view: 'vp-loft-5' }
  ],
  plan: true,
  gallery: ['loft-1', 'loft-2', 'loft-3', 'loft-4', 'loft-5', 'loft-6'].map((k) => img[k]),
  menu: {
    title: 'The Loft Café', note: 'Prices include VAT. Coffee from Ilam, tea from Kanyam, curd from Bhaktapur.',
    items: [
      { name: 'Newari breakfast', desc: 'Bara with egg, aloo tama, achar and a glass of chiya', price: 'Rs 420', tag: 'Morning' },
      { name: 'Juju dhau', desc: 'The king of curds, from Bhaktapur, in a clay bowl', price: 'Rs 220', tag: '' },
      { name: 'Choila toastie', desc: 'Smoked buffalo choila, mustard oil, sourdough', price: 'Rs 480', tag: '' },
      { name: 'Yomari', desc: 'Rice dumplings with chaku and sesame', price: 'Rs 260', tag: 'Winter' },
      { name: 'Wo platter', desc: 'Lentil pancakes, egg or plain, with timur chutney', price: 'Rs 380', tag: 'Vegetarian' },
      { name: 'Sel roti and achar', desc: 'Ring bread, fried to order', price: 'Rs 240', tag: 'Vegetarian' },
      { name: 'Ilam pour-over', desc: 'Single estate, brewed at the bar', price: 'Rs 320', tag: '' },
      { name: 'Masala chiya', desc: 'Kanyam tea, milk, cardamom and ginger', price: 'Rs 150', tag: '' },
      { name: 'Lemon, honey, ginger', desc: 'Hot, with Chitwan honey', price: 'Rs 190', tag: '' }
    ]
  },
  dining: [{
    id: 'rooftop', name: 'The rooftop',
    menu: {
      title: 'The rooftop', note: 'Open from four, weather allowing.',
      items: [
        { name: 'Chiya and biscuits', desc: 'For watching the sun go behind Patan', price: 'Rs 180', tag: '' },
        { name: 'Aila tasting', desc: 'Three small glasses of Newari rice spirit', price: 'Rs 650', tag: 'Evenings' },
        { name: 'Sukuti and bhatmas', desc: 'Dried meat, toasted soybeans, chilli', price: 'Rs 420', tag: '' }
      ]
    },
    booking: { on: false }
  }],
  reviews: {
    link: 'https://chyasalhouse.example.test/reviews',
    items: [
      { quote: 'We booked the loft for a two-day workshop after walking it in 3D. It was exactly as big and as bright as it looked.', name: 'A workshop host', from: 'Kathmandu' },
      { quote: 'The courtyard room was quiet, the breakfast was the best bara we had in Patan, and the square is ten minutes away.', name: 'A guest', from: 'Pune' },
      { quote: 'Our exhibition opening fitted 90 people with room to move. The window wall is made for photographs.', name: 'An artist', from: 'Lalitpur' }
    ]
  },
  offers: [
    { title: 'Two nights, one long dinner', body: 'Two nights in a courtyard room and dinner for two at the long table in the loft.', price: 'Rs 14,500 for two', image: img['loft-6'] },
    { title: 'A workshop day in the loft', body: 'The loft from nine to six, chairs and tables as you want them, coffee and lunch for twenty.', price: 'Rs 38,000 a day', image: img['loft-2'] },
    { title: 'Weekday desk and coffee', body: 'A seat at the window wall, Wi-Fi and bottomless chiya, Sunday to Thursday.', price: 'Rs 650 a day', image: '' }
  ],
  faq: [
    { q: 'Is Chyasal House a real place?', a: 'Not yet: it is a sample client made by RCAAS.tech to show what a client website holds. The 3D space is a real scan of an open floor in Chyasal, Lalitpur.' },
    { q: 'How far is Patan Durbar Square?', a: 'About ten minutes on foot, through the courtyards of Chyasal.' },
    { q: 'When can we check in and out?', a: 'Check in from two in the afternoon; check out by eleven. Ask if you need longer: we can usually help.' },
    { q: 'Can we bring our own caterer to the loft?', a: 'Yes, for events of more than forty. The kitchen next to the loft is yours for the day.' },
    { q: 'Is there parking?', a: 'Two cars in the courtyard, and a paid car park five minutes away. Bicycles come inside.' }
  ],
  contact: { title: 'Come and see the loft', body: 'Ask about a stay, a table or a date for your event. We answer within a working day.' },
  booking: {
    on: true, plan: img.plan, name: 'The Loft Café',
    tables: [
      table('t1', 'Table 1', 2, 0.41, 0.17, 'round', 'By the windows', 'vp-loft-2'),
      table('t2', 'Table 2', 2, 0.53, 0.17, 'round', 'By the windows', 'vp-loft-3'),
      table('t3', 'Table 3', 4, 0.66, 0.2, 'square', 'By the windows', 'vp-loft-3'),
      table('t4', 'Table 4', 6, 0.52, 0.33, 'long', 'The long table', 'vp-loft-4'),
      table('t5', 'Table 5', 4, 0.42, 0.47, 'square', 'Middle of the loft', 'vp-loft-1'),
      table('t6', 'Table 6', 4, 0.58, 0.47, 'square', 'Middle of the loft', 'vp-loft-1'),
      table('t7', 'Table 7', 4, 0.44, 0.62, 'round', 'The far corner', 'vp-loft-5'),
      table('t8', 'Table 8', 8, 0.55, 0.75, 'long', 'The far corner', 'vp-loft-5')
    ],
    first: '08:00', last: '20:30', slot: 30, stay: 90, days: 30, maxParty: 8, closed: [], timezone: TZ,
    note: 'We hold a table for fifteen minutes. For more than eight, write to us.'
  },
  stays: {
    on: true, plan: '',
    rooms: [
      { id: 'courtyard', label: 'Courtyard Room', units: 3, sleeps: 2, price: 'Rs 4,500', per: '/ night', deposit: 'Rs 1,000 when we confirm', features: 'Queen bed, rain shower, window on the courtyard', image: '', area: '18 m²', pin: false, x: 0.5, y: 0.5, space: '', view: '' },
      { id: 'loft-studio', label: 'Loft Studio', units: 2, sleeps: 2, price: 'Rs 6,200', per: '/ night', deposit: 'Rs 1,500 when we confirm', features: 'King bed, desk by the window, kettle and pour-over set', image: '', area: '26 m²', pin: false, x: 0.5, y: 0.5, space: '', view: '' },
      { id: 'family', label: 'Family Suite', units: 1, sleeps: 4, price: 'Rs 9,800', per: '/ night', deposit: 'Rs 2,500 when we confirm', features: 'Two rooms, two baths, a sofa bed for a child', image: '', area: '40 m²', pin: false, x: 0.5, y: 0.5, space: '', view: '' }
    ],
    checkin: '14:00', checkout: '11:00', days: 180, minNights: 1, maxNights: 14, maxGuests: 8, timezone: TZ,
    note: 'Breakfast in the café is included. Children under six stay free.'
  },
  events: {
    on: true,
    halls: [{ id: 'loft', label: 'The Loft', seated: 70, standing: 120, area: '130 m²', price: 'From Rs 35,000 a day', deposit: 'Rs 10,000 to hold the date', features: 'Windows on three sides, a projector wall, the café kitchen next door', image: img['loft-2'], space: SPACE, view: 'vp-loft-1' }],
    kinds: ['Workshop', 'Exhibition', 'Private dinner', 'Launch', 'Meeting', 'Reception'], days: 365, timezone: TZ,
    note: 'We hold a date for seven days while you decide.'
  }
}, PID);

await fs.mkdir(path.join(DATA_DIR, 'sites'), { recursive: true });
const publishedAt = new Date().toISOString();
await fs.writeFile(path.join(DATA_DIR, 'sites', `${PID}.json`), JSON.stringify({ draft, published: draft, publishedAt }, null, 2));

console.log(`[seed] ${PID}: project, space ${SPACE} (version ${pub.version}) and website published, in ${DATA_DIR}${owner ? '' : ' (no owner: claim it in the studio)'}.`);
console.log(`[seed] Website: /s/${PID}   Tour: /tour?space=${SPACE}   Studio: /studio/${PID}`);
process.exit(0); // the server modules it loads keep timers; nothing is left to wait for
