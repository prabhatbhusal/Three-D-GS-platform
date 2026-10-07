/**
 * Client for the Node API in /server — the CLAUDE.md-planned Django + DRF
 * backend, not started yet, stood up here in Node instead. Every call is
 * best-effort from the app's point of view: the viewer must keep working off
 * the scenes baked into lib/scenes.js if the API is unreachable, because
 * "time to first frame under 5s" (CLAUDE.md) can't wait on a second server.
 */
import type { ApiScene, Property, SceneDoc } from '../@types/scene.types';
import type { AudioUploadResult, UploadResult } from '../@types/upload.types';
import type { BrandFont, ProjectFeatures, ProjectInfo, ProjectTheme } from '../@types/config.types';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');

/** fetch() throws a bare "Failed to fetch" for every network-level failure —
 *  server down, wrong port, CORS refusal — which tells a creator nothing.
 *  Name the address we actually tried so the next step is obvious. */
async function send(path: string, options: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error(
      `Can't reach the API at ${API_BASE}. Start it with "cd server && npm run dev", ` +
      'and open the studio on the same host it allows (CLIENT_ORIGIN in server/.env).'
    );
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  const res = await send(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `${res.status} ${res.statusText}`);
  }
  return res.status === 204 ? null : res.json();
}

/** [{ id, title, tagline, spawn, outdoor, unitScale, neighbours }] */
export const getScenes = () => request<ApiScene[]>('/api/scenes');

/** Full scene document for one scene id, in the CLAUDE.md schema shape. */
export const getScene = (id: string) => request<SceneDoc>(`/api/scenes/${id}`);

/** Editor-only — requires a signed-in session (see login()). */
export const saveScene = (id: string, doc: SceneDoc) =>
  request(`/api/scenes/${id}`, { method: 'PUT', body: JSON.stringify(doc) });

/* ---- properties (§5.1) — studio-only ---- */

export const getProperties = () => request<Property[]>('/api/properties');
/** Resolves null when the property doesn't exist. */
export const getProperty = (id: string) =>
  request<Property>(`/api/properties/${encodeURIComponent(id)}`).catch((err: Error) => {
    if (/does not exist/i.test(err.message)) return null;
    throw err;
  });
export const createProperty = (title: string) =>
  request<Property>('/api/properties', { method: 'POST', body: JSON.stringify({ title }) });
/** Title only; the id (and every URL and space pointing at it) stays. */
export const renameProperty = (id: string, title: string) =>
  request<Property>(`/api/properties/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ title }) });
/** Its spaces are kept and become unfiled; published tours are untouched. */
/** Make a project from before accounts yours (then private to you). */
export const claimProperty = (id: string) =>
  request<Property>(`/api/properties/${encodeURIComponent(id)}/claim`, { method: 'POST' });
export const deleteProperty = (id: string) =>
  request<{ id: string; released: number }>(`/api/properties/${encodeURIComponent(id)}`, { method: 'DELETE' });

/** Share a project with a teammate by the email they sign in with. Owner or admin only. */
/** As a member (full access), or as the client's staff (enquiries, reservations, report). Staff
 *  new to the studio get an account and `invite`: a one-time link to set their password. */
export const addPropertyMember = (id: string, email: string, as: 'member' | 'staff' = 'member', name = '') =>
  request<Property & { invite?: { path: string; expires: string } }>(`/api/properties/${encodeURIComponent(id)}/members`, { method: 'POST', body: JSON.stringify({ email, as, name }) });

export const removePropertyMember = (id: string, userId: string) =>
  request<Property>(`/api/properties/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });

/** A project's branding. Public: the tour reads it. */
export const getProjectTheme = (id: string) =>
  request<{ title: string; theme: ProjectTheme; whatsapp?: string | null; features?: { enquiries: boolean; reservations: boolean } }>(`/api/properties/${encodeURIComponent(id)}/theme`);
/** Owner only: switch parts of the platform on or off for the project. */
export const setProjectFeatures = (id: string, patch: Partial<ProjectFeatures>) =>
  request<Property>(`/api/properties/${encodeURIComponent(id)}/features`, { method: 'PUT', body: JSON.stringify(patch) });
/** Owner or admin. `accent: null` goes back to the default. */
export const setProjectTheme = (id: string, patch: { brand?: string; accent?: string | null; font?: BrandFont }) =>
  request<Property>(`/api/properties/${encodeURIComponent(id)}/theme`, { method: 'PUT', body: JSON.stringify(patch) });
export const setProjectInfo = (id: string, info: ProjectInfo) =>
  request<Property>(`/api/properties/${encodeURIComponent(id)}/info`, { method: 'PUT', body: JSON.stringify(info) });
export const uploadProjectLogo = (id: string, file: File) =>
  request<Property>(`/api/properties/${encodeURIComponent(id)}/logo`, {
    method: 'PUT', body: file, headers: { 'Content-Type': 'application/octet-stream' }
  });
export const removeProjectLogo = (id: string) =>
  request<Property>(`/api/properties/${encodeURIComponent(id)}/logo`, { method: 'DELETE' });

/** A project's enquiries (server/src/routes/properties.js), for anyone who can see it. */
export interface Lead {
  id: string; createdAt: string; name: string; phone: string; email?: string; requirement?: string; dates?: string;
  message?: string; sceneId: string; sceneName?: string; hotspotLabel?: string;
  delivery?: { sent: boolean; reason?: string; at: string };
}
export interface ProjectLeads { leads: Lead[]; emails: string[]; emailOn: boolean }
export const getProjectLeads = (id: string) => request<ProjectLeads>(`/api/properties/${encodeURIComponent(id)}/leads`);
/** A plain link: the browser sends the studio's cookie with a top-level download. */
export const projectLeadsCsvUrl = (id: string) => `${API_BASE}/api/properties/${encodeURIComponent(id)}/leads.csv`;
/** A test email to where the project's enquiries go; rejects with the reason it couldn't send. */
export const sendTestEmail = (id: string) =>
  request<{ sent: true; to: string[] }>(`/api/properties/${encodeURIComponent(id)}/lead-emails/test`, { method: 'POST' });
export const setProjectLeadEmails = (id: string, emails: string[]) =>
  request<{ emails: string[] }>(`/api/properties/${encodeURIComponent(id)}/lead-emails`, { method: 'PUT', body: JSON.stringify({ emails }) });

/** One month of a project's tour traffic and enquiries (server/src/stats.js). */
export interface ProjectReport {
  project: { id: string; title: string; theme: ProjectTheme };
  month: string; visits: number; seconds: number; days: Record<string, number>;
  enquiries: number; fromProjectPage: number;
  spaces: { id: string; title: string; visits: number; seconds: number; enquiries: number }[];
  /** The path to a booking: tour counts (space visits, those that opened a hotspot or a card), then what was saved. */
  funnel: {
    visits: number; engaged: number; intent: Partial<Record<'enquire' | 'book' | 'table' | 'room' | 'whatsapp' | 'event', number>>; intents: number;
    enquiries: number; requests: { tables: number; rooms: number; events?: number }; confirmed: { tables: number; rooms: number; events?: number };
  };
  /** The most-opened hotspots, with the enquiries sent after looking at each. */
  hotspots: { space: string; spaceTitle: string; id: string; label: string; opens: number; enquiries: number }[];
}
export const getProjectReport = (id: string, month: string) =>
  request<ProjectReport>(`/api/properties/${encodeURIComponent(id)}/report?month=${month}`);

/** A project's website (/s/<project>, server/src/routes/sites.js). Photos are asset paths. */
export interface SiteRoom { title: string; body: string; features: string; image: string; space: string; view: string }
export interface SiteMenuItem { name: string; desc: string; price: string; tag: string }
/** The website's look (website.css [data-style]). */
export type SiteStyle = 'heritage' | 'modern' | 'night';
/** A photo's [width, height] from its name (`img-<ts>-<w>x<h>.jpg`, sites.js). Photos from before 2026-09-29 have none. */
export const photoSize = (path: string): [number, number] | null => {
  const m = /-(\d+)x(\d+)\.\w+$/.exec(path);
  return m ? [Number(m[1]), Number(m[2])] : null;
};
export interface SiteMenu { title: string; note: string; items: SiteMenuItem[] }
/** Another place to eat or drink (2026-09-29): a café beside the restaurant, a rooftop bar. Its own menu and table booking. */
export interface DiningPlace { id: string; name: string; menu: SiteMenu; booking: SiteBooking }
export interface SiteDoc {
  style: SiteStyle;
  /** `image`: a full-width photo behind the opening words; empty = words only. */
  hero: { eyebrow: string; title: string; lede: string; space: string; image: string };
  facts: { n: string; k: string }[];
  story: { title: string; body: string };
  rooms: SiteRoom[];
  plan: boolean;
  gallery: string[];
  menu: SiteMenu;
  /** More dining places; the main one is menu and booking. */
  dining: DiningPlace[];
  /** What guests said, and where to read more (an https link: Google, TripAdvisor). */
  reviews: { link: string; items: { quote: string; name: string; from: string }[] };
  /** Packages and offers; each asks about itself through the enquiry form. */
  offers: { title: string; body: string; price: string; image: string }[];
  faq: { q: string; a: string }[];
  contact: { title: string; body: string };
  booking: SiteBooking;
  stays: SiteStays;
  events: SiteEvents;
}
/** A table on the restaurant's floor plan; x and y are fractions of the plan. */
export interface SiteTable {
  id: string; label: string; seats: number; x: number; y: number;
  shape: 'round' | 'square' | 'long'; area: string; view: string;
}
/** Table booking (server/src/reservations.js): the plan, its tables and the hours. */
export interface SiteBooking {
  on: boolean; plan: string; tables: SiteTable[];
  first: string; last: string; slot: number; stay: number; days: number; maxParty: number;
  closed: number[]; timezone: string; note: string;
  /** The place's name ("The Restaurant"). A dining place's live setup also carries its id, for the booking calls. */
  name?: string; outlet?: string;
}
/** A room type the hotel lets online (or one villa: `units` 1). With `pin`, it sits on the site plan at x, y. */
export interface StayRoom {
  id: string; label: string; units: number; sleeps: number; price: string; per: string; features: string;
  /** What's asked to hold it, in words ("Rs 2,000 when we confirm"). No payment is taken online. */
  deposit?: string;
  image: string; area: string; pin: boolean; x: number; y: number; space: string; view: string;
}
/** Room booking (server/src/stays.js): the rooms, an optional site plan, check-in and check-out, stay lengths. */
export interface SiteStays {
  on: boolean; plan: string; rooms: StayRoom[]; checkin: string; checkout: string;
  days: number; minNights: number; maxNights: number; maxGuests: number; timezone: string; note: string;
}
export interface SiteSpace {
  id: string; title: string; published: boolean; views: { id: string; label: string }[];
  /** Its floor plan files ("<asset>/floorplan/plan.svg"…), usable as a booking plan. */
  plans?: string[];
}
export interface SiteDraft { draft: SiteDoc; publishedAt: string | null; scheduledAt: string | null; spaces: SiteSpace[] }
/** A published space as the client website shows it (sites.js projectSpaces). */
export interface SiteSpaceCard { id: string; title: string; tagline: string | null; thumb: string | null; key: string }
export interface PublicSite {
  project: { id: string; title: string; theme: ProjectTheme; info?: ProjectInfo; features?: { enquiries: boolean; reservations: boolean } };
  site: Omit<SiteDoc, 'booking' | 'stays' | 'events' | 'dining'> & {
    booking: SiteBooking | null; stays: SiteStays | null; events?: SiteEvents | null;
    /** Each with its live table setup, or null when its booking is off. */
    dining?: (Omit<DiningPlace, 'booking'> & { booking: SiteBooking | null })[];
  };
  tour: { space: string; title: string; key: string; thumb?: string | null } | null;
  /** Every published space of the project, with its tour key: the hub's list and the space pages. */
  spaces?: SiteSpaceCard[];
  plan: string | null;
  /** The place's schema.org type, for the page's structured data. */
  kind?: 'Hotel' | 'Restaurant' | 'EventVenue' | 'LocalBusiness';
  publishedAt: string;
}
const sitePath = (id: string) => `/api/sites/${encodeURIComponent(id)}`;
export const getSiteDraft = (id: string) => request<SiteDraft>(`${sitePath(id)}/draft`);
/** The whole draft from the editor, or part of one (a starter template); the server fills in the rest. */
export const saveSiteDraft = (id: string, draft: Partial<SiteDoc>) =>
  request<{ draft: SiteDoc; publishedAt: string | null }>(`${sitePath(id)}/draft`, { method: 'PUT', body: JSON.stringify(draft) });
export const publishSite = (id: string) => request<{ publishedAt: string }>(`${sitePath(id)}/publish`, { method: 'POST' });
/* Client review (server/src/routes/sites.js): a private link to the draft; comments pinned on it; an approval. */
/** A comment pinned on the draft: in the page's section `sec` (its heading `where`), at x across the page and y down the section. */
export interface ReviewComment { id: string; name: string; text: string; where: string; sec: number; x: number; y: number; at: string; resolved: boolean }
export interface ReviewApproval { name: string; at: string; draft: string }
export interface ReviewFeedback { key: string | null; comments: ReviewComment[]; approval: ReviewApproval | null; approvedThisDraft: boolean }
export const shareSiteForReview = (id: string) => request<{ key: string }>(`${sitePath(id)}/review`, { method: 'POST' });
export const stopSiteReview = (id: string) => request<{ key: null }>(`${sitePath(id)}/review`, { method: 'DELETE' });
export const getReviewFeedback = (id: string) => request<ReviewFeedback>(`${sitePath(id)}/review/feedback`);
export const resolveReviewComment = (id: string, cid: string, resolved: boolean) =>
  request<ReviewComment>(`${sitePath(id)}/review/comments/${encodeURIComponent(cid)}`, { method: 'PATCH', body: JSON.stringify({ resolved }) });
export const getSiteReview = (id: string, key: string) =>
  request<PublicSite & { preview: true; review: Omit<ReviewFeedback, 'key'> }>(`${sitePath(id)}/review?key=${encodeURIComponent(key)}`);
export const postReviewComment = (id: string, key: string, c: Pick<ReviewComment, 'name' | 'text' | 'where' | 'sec' | 'x' | 'y'>) =>
  request<ReviewComment>(`${sitePath(id)}/review/comments?key=${encodeURIComponent(key)}`, { method: 'POST', body: JSON.stringify(c) });
export const approveSiteReview = (id: string, key: string, name: string) =>
  request<ReviewApproval>(`${sitePath(id)}/review/approve?key=${encodeURIComponent(key)}`, { method: 'POST', body: JSON.stringify({ name }) });

/** Put the saved draft, as it is now, live at `at` (an ISO time); or cancel that. */
export const scheduleSite = (id: string, at: string) =>
  request<{ scheduledAt: string }>(`${sitePath(id)}/schedule`, { method: 'POST', body: JSON.stringify({ at }) });
export const cancelSiteSchedule = (id: string) => request<{ scheduledAt: null }>(`${sitePath(id)}/schedule`, { method: 'DELETE' });
export const uploadSiteImage = (id: string, file: File) =>
  request<{ path: string }>(`${sitePath(id)}/images`, { method: 'POST', body: file, headers: { 'Content-Type': 'application/octet-stream' } });

/** What's free: the bookable days, and each start time on one of them with its free tables. */
export interface Availability { today: string; dates: { date: string; closed: boolean }[]; date: string; slots: { time: string; free: string[] }[] }
export const getSitePreview = (id: string) => request<PublicSite & { preview: true }>(`${sitePath(id)}/preview`);
/** On a client's review page (s/[property]/review), the draft's booking is read with the link's key. */
let reviewKey = '';
export const setReviewKey = (key: string) => { reviewKey = key; };
const withKey = (q: URLSearchParams) => { if (reviewKey) q.set('key', reviewKey); const s = q.toString(); return s ? `?${s}` : ''; };
/** `outlet`: a dining place's id (SiteBooking.outlet); none, the main one. */
const withOutlet = (q: URLSearchParams, outlet?: string) => { if (outlet) q.set('outlet', outlet); return q; };
export const getPreviewAvailability = (id: string, date?: string, outlet?: string) =>
  request<Availability>(`${sitePath(id)}/preview/availability${withKey(withOutlet(new URLSearchParams(date ? { date } : {}), outlet))}`);
/** The published website's dining places taking table bookings (the main one first), for the tour's Reserve a table. */
export const getSiteTables = (id: string) =>
  request<{ places: SiteBooking[] }>(`${sitePath(id)}/booking`).then((r) => r?.places ?? []).catch(() => [] as SiteBooking[]);
export const getAvailability = (id: string, date?: string, outlet?: string) => {
  const q = withOutlet(new URLSearchParams(date ? { date } : {}), outlet).toString();
  return request<Availability>(`${sitePath(id)}/availability${q ? `?${q}` : ''}`);
};
/** When each table in a published space (its table hotspots, by id) is free: the tour's Book now for tables.
 *  `tables`: the ones the server knows (published); a draft's table has only the hours. */
export const getHereTables = (id: string, space: string, date?: string) =>
  request<Availability & { tables: string[] }>(`${sitePath(id)}/requests/tables?${new URLSearchParams({ space, ...(date ? { date } : {}) })}`);
/** Which parts of a day a hall hotspot is already asked for, so its Book now can strike them out. */
export const getHereHall = (id: string, space: string, hotspot: string, date: string) =>
  request<{ date: string; taken: EventSession[] }>(`${sitePath(id)}/requests/halls?${new URLSearchParams({ space, hotspot, date })}`);
export interface TableRequest {
  table: string; date: string; time: string; party: number; name: string; phone: string; email?: string; notes?: string;
  website?: string; formRenderedAt: number; outlet?: string;
}
export const reserveTable = (id: string, r: TableRequest) =>
  request<{ ok: true; id?: string; table?: string; tableLabel?: string }>(`${sitePath(id)}/reservations`, { method: 'POST', body: JSON.stringify(r) });

/** Rooms left: `free[room][i]` of that room are free on the night of `dates[i]` (consecutive, from today). */
export interface StayCalendar { today: string; lastCheckin: string; dates: string[]; free: Record<string, number[]> }
/** The published website's room booking, for the tour's Book a room (null when off). */
export const getSiteStays = (id: string) =>
  request<{ stays: SiteStays | null }>(`${sitePath(id)}/stays`).then((r) => r?.stays ?? null).catch(() => null);
export const getStayCalendar = (id: string) => request<StayCalendar>(`${sitePath(id)}/stays/availability`);
export const getPreviewStayCalendar = (id: string) => request<StayCalendar>(`${sitePath(id)}/preview/stays/availability${withKey(new URLSearchParams())}`);
export interface StayRequest {
  room: string; checkin: string; checkout: string; guests: number; name: string; phone: string; email?: string; notes?: string;
  website?: string; formRenderedAt: number;
}
/** A hall for events (server/src/events.js): how many it seats and holds standing, its size and photo, its 3D space. */
export interface EventHall {
  id: string; label: string; seated: number; standing: number; area: string; features: string; image: string; space: string; view: string;
  /** In words: "Rs 1,500 per plate", and what holds the date ("Rs 20,000 deposit"). */
  price?: string; deposit?: string;
}
/** Event booking: the halls, the kinds of event the venue hosts, how far ahead it books. */
export interface SiteEvents { on: boolean; halls: EventHall[]; kinds: string[]; days: number; timezone: string; note: string }
export type EventSession = 'day' | 'evening' | 'full';
/** What's taken: hall → date → the sessions held. The first and last day a guest may pick. */
export interface EventCalendar { today: string; first: string; last: string; taken: Record<string, Record<string, EventSession[]>> }
/** The published website's event booking, for the tour's Plan an event (null when off). */
export const getSiteEvents = (id: string) =>
  request<{ events: SiteEvents | null }>(`${sitePath(id)}/events`).then((r) => r?.events ?? null).catch(() => null);
export const getEventCalendar = (id: string) => request<EventCalendar>(`${sitePath(id)}/events/availability`);
export interface EventRequest {
  hall: string; date: string; session: EventSession; guests: number; occasion: string;
  name: string; phone: string; email?: string; notes?: string; formRenderedAt: number; website?: string;
}
export const requestEvent = (id: string, r: EventRequest) =>
  request<{ ok: true; id?: string; hallLabel?: string }>(`${sitePath(id)}/events`, { method: 'POST', body: JSON.stringify(r) });

/** Book now on a room, hall or table hotspot (server: POST /requests). What's booked comes from the published hotspot. */
export interface HereRequest {
  space: string; hotspot: string; guests: number; date: string; checkout?: string; session?: EventSession; occasion?: string; time?: string;
  name: string; phone: string; email?: string; notes?: string; formRenderedAt: number; website?: string;
}
export const requestHere = (id: string, r: HereRequest) =>
  request<{ ok: true; id?: string }>(`${sitePath(id)}/requests`, { method: 'POST', body: JSON.stringify(r) });

export const requestStay = (id: string, r: StayRequest) =>
  request<{ ok: true; id?: string; roomLabel?: string; rooms?: number; nights?: number }>(`${sitePath(id)}/stays`, { method: 'POST', body: JSON.stringify(r) });

/** A full day (tables) or full dates (rooms): the guest waits, and is told if a place is let go. */
export type WaitFor = ({ of: 'table'; date: string; time?: string; outlet?: string } | { of: 'room'; checkin: string; checkout: string; room?: string }) & { party: number };
export type WaitRequest = WaitFor & { name: string; phone: string; email?: string; website?: string; formRenderedAt: number };
export const joinWaitlist = (id: string, w: WaitRequest) =>
  request<{ ok: true; id?: string }>(`${sitePath(id)}/waitlist`, { method: 'POST', body: JSON.stringify(w) });

/** The AI concierge (server/src/routes/concierge.js): is it on for this project, and a question. */
export interface ConciergeShow { space: string; view?: string; hotspot?: string }
export const conciergeOn = (id: string) =>
  request<{ on: boolean }>(`/api/concierge/${encodeURIComponent(id)}`).then((r) => !!r?.on).catch(() => false);
export const askConcierge = (id: string, q: { question: string; history: { role: 'user' | 'assistant'; text: string }[]; space: string; lang: string }) =>
  request<{ answer: string; show: ConciergeShow | null }>(`/api/concierge/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(q) });

/** A booking's statuses; a waitlist entry's are 'waiting', 'notified' (told a place may be free) and 'removed'. */
export type ReservationStatus = 'requested' | 'confirmed' | 'declined' | 'cancelled' | 'waiting' | 'notified' | 'removed';
/** A table booking, or with kind 'stay' a room booking (its `date` is the check-in, its `party` the guests). */
export interface Reservation {
  id: string; status: ReservationStatus; table: string; tableLabel: string; date: string; time: string; party: number;
  name: string; phone: string; email: string; notes: string; createdAt: string; updatedAt: string;
  delivery?: { sent: boolean; reason?: string }; guestDelivery?: { sent: boolean; reason?: string };
  kind?: 'stay' | 'wait' | 'event' | 'request';
  /** A Book now request from a hotspot: what it was for, in which space, at what price and deposit. */
  item?: string; spaceTitle?: string; price?: string; deposit?: string;
  /** An event's: its hall, its part of the day, what kind of event. */
  hall?: string; hallLabel?: string; session?: EventSession; occasion?: string; room?: string; roomLabel?: string; rooms?: number; checkin?: string; checkout?: string; nights?: number;
  /** A waitlist entry's: what they wait for, and when they were told. */
  of?: 'table' | 'room' | 'hall'; notifiedAt?: string;
  /** A table booking at one of the site's other dining places. */
  outlet?: string; outletName?: string;
}
export const getReservations = (id: string) =>
  request<{ reservations: Reservation[]; booking: SiteBooking | null; stays: SiteStays | null; events?: SiteEvents | null; dining?: DiningPlace[]; today: string }>(`${sitePath(id)}/reservations`);
export const setReservationStatus = (id: string, rid: string, status: ReservationStatus) =>
  request<Reservation & { waitlistTold?: number }>(`${sitePath(id)}/reservations/${encodeURIComponent(rid)}`, { method: 'PATCH', body: JSON.stringify({ status }) });

/** Who did what in a project, newest first (server/src/activity.js). */
export interface ActivityEntry { at: string; who: { id: string | null; name: string }; action: string; target: string; detail?: string }
export const getActivity = (propertyId: string) =>
  request<ActivityEntry[]>(`/api/properties/${encodeURIComponent(propertyId)}/activity`);

/** The team list and role changes. Admin-only — the server refuses anyone else. */
export const getTeam = () => request<SessionUser[]>('/api/team');
/** A one-time, 24-hour password reset link for a teammate; the admin sends it. */
export const makeResetLink = (id: string) =>
  request<{ path: string; expires: string }>(`/api/team/${encodeURIComponent(id)}/reset`, { method: 'POST' });
export const removeTeammate = (id: string) =>
  request<{ projectsReassigned: number }>(`/api/team/${encodeURIComponent(id)}`, { method: 'DELETE' });
/** "Forgot password": the server emails a reset link if the email has an account. */
export const requestPasswordReset = (email: string) =>
  request<{ ok: true }>('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
/** Set a new password from a reset link, and sign in with it. */
export const resetPasswordWith = (token: string, password: string) =>
  request<SessionReply>('/api/auth/reset', { method: 'POST', body: JSON.stringify({ token, password }) });
/** Change your own password. This browser stays signed in; every other session ends. */
export const changePassword = (current: string, password: string) =>
  request<SessionReply>('/api/auth/password', { method: 'POST', body: JSON.stringify({ current, password }) });
export const setTeamRole = (id: string, role: 'admin' | 'editor') =>
  request<SessionUser>(`/api/team/${encodeURIComponent(id)}/role`, { method: 'PATCH', body: JSON.stringify({ role }) });

/** The project last opened in this browser, so the list can point back to it. */
export const LAST_PROJECT_KEY = 'threedview.lastProject';

/** `null` takes the space out of every property. */
export const moveSceneToProperty = (sceneId: string, propertyId: string | null) =>
  request(`/api/scenes/${sceneId}/property`, { method: 'POST', body: JSON.stringify({ propertyId }) });

/* ---- publishing (§7.5) ---- */

/** What visitors see. Resolves null when the space isn't published. */
export const getPublishedScene = (id: string) =>
  request<SceneDoc>(`/api/scenes/${id}/published`).catch((err: Error) => {
    if (/not published/i.test(err.message)) return null;
    throw err;
  });

export interface PublishState {
  status: 'draft' | 'published';
  publishedVersion: number | null;
  publishedAt: string | null;
  blockers: string[];
  warnings: string[];
  /** The ready checklist (scan on the server, own start view, a track, a hotspot), of the saved draft. */
  ready: { key: string; label: string; done: boolean }[];
}
export interface PublishResult {
  published: boolean;
  version?: number;
  publishedAt?: string;
  blockers?: string[];
  warnings: string[];
}
export interface GalleryItem {
  id: string;
  title: string;
  tagline: string | null;
  publishedAt: string;
  version: number;
  trackCount: number;
  /** A path on the API (`/api/gallery/<id>/thumb.jpg?v=…`): prefix API_BASE_URL. */
  thumb: string | null;
  /** The project it's in (the hub page lists one project's). */
  propertyId?: string | null;
  /** Its night version's id, if it has one. */
  night?: string | null;
}
/** Lists show each space once: a night version is reached from its day space. */
export const withoutNightVersions = (list: GalleryItem[]) =>
  list.filter((s) => !list.some((d) => d.id !== s.id && d.night === s.id));

export const getPublishState = (id: string) => request<PublishState>(`/api/scenes/${id}/publish`);

/** Resolves with the blockers instead of throwing when publish is refused. */
export async function publishSceneNow(id: string): Promise<PublishResult> {
  const res = await send(`/api/scenes/${id}/publish`, { method: 'POST', credentials: 'include' });
  const body = await res.json().catch(() => ({}));
  if (res.ok || res.status === 422) return body as PublishResult;
  throw new Error(body.error || `${res.status} ${res.statusText}`);
}
export const unpublishScene = (id: string) => request(`/api/scenes/${id}/unpublish`, { method: 'POST' });
export const revertScene = (id: string) => request<SceneDoc>(`/api/scenes/${id}/revert`, { method: 'POST' });
/** Every published version of a space, newest first. */
export interface SceneVersion { version: number; publishedAt: string | null; title: string }
export const getVersions = (id: string) => request<SceneVersion[]>(`/api/scenes/${id}/versions`);
/** Put published version `version` back — as the draft, or live at once with `publish`. */
export const restoreVersion = (id: string, version: number, publish = true) =>
  request<{ doc: SceneDoc; publish?: PublishResult }>(`/api/scenes/${id}/restore`, { method: 'POST', body: JSON.stringify({ version, publish }) });
export const getGallery = () => request<GalleryItem[]>('/api/gallery');
/** Draw (or redraw) a space's floor plan from its scan; stored with the asset. */
export const buildFloorPlan = (assetId: string, title: string) =>
  request<{ size: [number, number]; floorArea: number; walls: number }>(
    `/api/assets/${assetId}/floorplan?title=${encodeURIComponent(title)}`, { method: 'POST' });

/** Your own floor plan image for a space (an architect's drawing): PNG, JPEG
 *  or WebP, 15 MB at most. Replaces any uploaded before; the one drawn from
 *  the scan stays. Resolves the stored path, e.g. `floorplan/uploaded.png`. */
export const uploadFloorPlan = (assetId: string, file: File) =>
  request<{ path: string; bytes: number }>(`/api/assets/${assetId}/floorplan/upload`, {
    method: 'PUT', body: file, headers: { 'Content-Type': 'application/octet-stream' }
  });

export const removeFloorPlan = (assetId: string) =>
  request(`/api/assets/${assetId}/floorplan/upload`, { method: 'DELETE' });
/** Name the rooms of a plan drawn from the scan: { r1: 'Lobby' }; '' puts a
 *  room back to its number. The server redraws every copy of the plan. */
export const renameFloorPlanRooms = (assetId: string, names: Record<string, string>) =>
  request<{ rooms: { id: string; name: string; area: number }[] }>(
    `/api/assets/${assetId}/floorplan/rooms`, { method: 'PATCH', body: JSON.stringify({ names }) });
/** For server components, which have no browser cookies or CORS to worry about. */
export const API_BASE_URL = API_BASE;

/** 'staff': a client's staff account, invited to answer a project's guests (no studio editing). */
export interface SessionUser { id: string; name: string; email: string; role: 'admin' | 'editor' | 'staff' }
export const ROLE_NAME: Record<SessionUser['role'], string> = { admin: 'Admin', editor: 'Editor', staff: 'Client staff' };
interface SessionReply { authenticated: boolean; user: SessionUser | null }

/** `email` omitted = the legacy shared editor password (server/.env
 *  EDITOR_PASSWORD), still used by the uploader's inline sign-in. */
export const login = (password: string, email?: string) =>
  request<SessionReply>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });

/** Needs the team access code — see server/src/routes/auth.js for why. */
export const signup = (fields: { name: string; email: string; password: string; accessCode: string }) =>
  request<SessionReply>('/api/auth/signup', { method: 'POST', body: JSON.stringify(fields) });

export const logout = () => request('/api/auth/logout', { method: 'POST' });

export const getSession = () => request<SessionReply>('/api/auth/session');

/** A space's embed key and the websites allowed to frame it (server/src/
 *  routes/embed.js). Studio-only. `rotate` retires every snippet handed out
 *  before; `sites` replaces the list (empty: any website). */
export interface EmbedSettings { key: string; version: number; sites: string[] }
export const getEmbed = (sceneId: string) => request<EmbedSettings>(`/api/embed/${encodeURIComponent(sceneId)}`);
export const setEmbed = (sceneId: string, patch: { rotate?: true; sites?: string[] }) =>
  request<EmbedSettings>(`/api/embed/${encodeURIComponent(sceneId)}`, { method: 'POST', body: JSON.stringify(patch) });

/** Public: may this page show this space in a frame? `from` is the origin of
 *  the page it's inside. `reason`: 'key' (wrong or retired), 'site', 'unknown'. */
export const checkEmbed = (space: string, key: string, from: string) =>
  request<{ ok: boolean; reason?: string }>(
    `/api/embed/check?space=${encodeURIComponent(space)}&key=${encodeURIComponent(key)}&from=${encodeURIComponent(from)}`);

/** Public — no session needed. `payload` must include `sceneId` and
 *  `formRenderedAt` (Date.now() when the form first appeared — the backend's
 *  bot-timing check needs it, see server/src/routes/leads.js). */
export const submitLead = (payload: Record<string, unknown>) =>
  request('/api/leads', { method: 'POST', body: JSON.stringify(payload) });

/* ------------------------------------------------------------------ */
/* Asset upload (CLAUDE.md §7.1, §9). Editor-only.                     */
/* ------------------------------------------------------------------ */

export const createAsset = () => request<{ assetId: string }>('/api/assets', { method: 'POST' });

/** Reports bytes already staged for `relPath` — 0 for a fresh file, more if
 *  resuming a dropped connection. Never throws on a not-yet-started file. */
export const initAssetFile = (assetId: string, relPath: string) =>
  request<{ relPath: string; bytesReceived: number }>(`/api/assets/${assetId}/files`, {
    method: 'POST',
    body: JSON.stringify({ relPath })
  });

/** A 409 here isn't a failure — it means the server's view of `relPath`
 *  is ahead of the caller's (a retried chunk that actually landed); the
 *  response still carries the real `bytesReceived` to resync to. */
export async function uploadAssetChunk(
  assetId: string,
  relPath: string,
  offset: number,
  chunk: Blob
): Promise<{ ok: boolean; bytesReceived: number }> {
  const res = await send(
    `/api/assets/${assetId}/files/chunk?relPath=${encodeURIComponent(relPath)}&offset=${offset}`,
    { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) throw new Error(body.error || `${res.status} ${res.statusText}`);
  return { ok: res.ok, bytesReceived: body.bytesReceived };
}

export const finalizeAsset = (assetId: string) =>
  request<UploadResult>(`/api/assets/${assetId}/finalize`, { method: 'POST' });

/** One .m4a, at most 2 MB — the server checks it really is one (§6.3). */
export const finalizeAudio = (assetId: string) =>
  request<AudioUploadResult>(`/api/assets/${assetId}/finalize?kind=audio`, { method: 'POST' });
/** A 360 camera video (MP4/MOV/WebM, equirectangular) as a space of its own. */
export const finalizeVideo360 = (assetId: string) =>
  request<UploadResult>(`/api/assets/${assetId}/finalize?kind=video360`, { method: 'POST' });

export const deleteAsset = (assetId: string) => request(`/api/assets/${assetId}`, { method: 'DELETE' });

export const assetUrl = (assetId: string, relPath: string) => `${API_BASE}/api/assets/${assetId}/${relPath}`;

/** A link that is safe to put in a visitor's page: http(s) only, never
 *  javascript: or data:. Anything else comes back null — don't render it. */
export function safeUrl(u: string | undefined | null): string | null {
  const s = (u ?? '').trim();
  return /^https?:\/\/\S+$/i.test(s) ? s : null;
}

/** A path on the API (a gallery or view picture) as a full URL. Data URLs
 *  (the studio's own thumbnails) and full URLs pass through. */
export const apiUrl = (path: string | null | undefined) => (path ? (path.startsWith('/') ? `${API_BASE}${path}` : path) : null);

/** A WhatsApp chat with the visitor's first line already typed. */
export const whatsappHref = (number: string, text: string) =>
  `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

/** Scene documents address uploads as `asset://<assetId>/<relPath>` (§9);
 *  this turns one into a URL the browser can fetch. Plain http(s) passes
 *  through (hand-typed image/video links); anything else is null. */
export function resolveAsset(ref: string | undefined | null): string | null {
  const m = /^asset:\/\/([A-Za-z0-9_-]+)\/(.+)$/.exec(ref ?? '');
  if (m) return assetUrl(m[1], m[2].split('/').map(encodeURIComponent).join('/'));
  return safeUrl(ref);
}
