/**
 * Starter projects (2026-09-28): what kind of place a new project is, and the
 * website draft it starts with. Only what's safe to leave as is: sections
 * that stay hidden until they're filled in (a menu with no dishes), booking
 * set up but switched off (rooms with no photos or prices yet), and headings
 * that read right for any place of that kind. Nothing here is live until
 * the website is published.
 */
import type { SiteDoc } from './api';

export type PlaceKind = 'hotel' | 'restaurant' | 'venue' | 'college' | 'heritage' | 'other';

type Starter = { site?: Partial<SiteDoc> };
interface Template extends Starter {
  kind: PlaceKind;
  label: string;
  /** What the starter gives them, in a line. */
  gives: string;
  /** A name for the first space, when the export didn't suggest one. */
  firstSpace: string;
}

const room = (id: string, label: string, sleeps: number) =>
  ({ id, label, units: 1, sleeps, price: '', per: '/ night', features: '', image: '', area: '', pin: false, x: 0.5, y: 0.5, space: '', view: '' });
const tables = (first: string, last: string) =>
  ({ on: false, plan: '', tables: [], first, last, slot: 30, stay: 90, days: 30, maxParty: 8, closed: [], timezone: 'Asia/Kathmandu', note: '' });

export const TEMPLATES: Template[] = [
  {
    kind: 'hotel', label: 'Hotel or resort', firstSpace: 'Lobby',
    gives: 'Room booking with three room types to fill in, table booking hours for the restaurant, and an enquiry section. Both bookings start switched off.',
    site: {
      menu: { title: 'Dining', note: '', items: [] },
      contact: { title: 'Plan your stay', body: 'Ask about dates, rooms, events or anything else. We reply within a day.' },
      stays: {
        on: false, plan: '', checkin: '14:00', checkout: '12:00', days: 180, minNights: 1, maxNights: 14, maxGuests: 10,
        timezone: 'Asia/Kathmandu', note: '',
        rooms: [room('standard', 'Standard Room', 2), room('deluxe', 'Deluxe Room', 2), room('family', 'Family Suite', 4)]
      },
      booking: tables('12:00', '21:30')
    }
  },
  {
    kind: 'restaurant', label: 'Restaurant or café', firstSpace: 'Dining room',
    gives: 'Table booking hours ready for your floor plan, a menu section, and an enquiry section. Booking starts switched off.',
    site: {
      menu: { title: 'Menu', note: '', items: [] },
      contact: { title: 'Visit us', body: 'Ask about a table, a private dinner or an event.' },
      booking: tables('11:00', '21:30')
    }
  },
  {
    kind: 'venue', label: 'Banquet or event venue', firstSpace: 'Main hall',
    gives: 'An enquiry section that asks the right questions for events.',
    site: { contact: { title: 'Plan your event', body: 'Tell us the date, how many guests and the kind of event, and we’ll send options.' } }
  },
  {
    kind: 'college', label: 'College or school', firstSpace: 'Main building',
    gives: 'An enquiry section for admissions and campus visits.',
    site: { contact: { title: 'Visit the campus', body: 'Ask about admissions, courses or a campus visit.' } }
  },
  {
    kind: 'heritage', label: 'Heritage or cultural site', firstSpace: 'Courtyard',
    gives: 'An enquiry section for visits and group bookings.',
    site: { contact: { title: 'Plan a visit', body: 'Ask about opening times, guided visits or group bookings.' } }
  },
  { kind: 'other', label: 'Something else', firstSpace: 'Reception', gives: 'A blank website to start from.' }
];

export const templateFor = (kind: PlaceKind) => TEMPLATES.find((t) => t.kind === kind) ?? TEMPLATES[TEMPLATES.length - 1];
