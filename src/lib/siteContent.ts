/* Copy for the marketing pages (/, /work, /services, /how-it-works, /about).
 * Facts come from GeoNova's published case studies (geonova.com.np). Keep
 * them sourced: a number on these pages is a promise to a client. Scanner
 * figures (±1.2 cm, 200,000 points a second, 360°) are XGRIDS' published
 * Lixel K1 specs (xgrids.com/intl/lixelk1). */

export const SECTORS = [
  { t: 'Hotels and resorts', b: 'Rooms, halls and restaurants, with an enquiry form in every one.' },
  { t: 'Colleges and schools', b: 'Labs and classrooms for students and parents who can’t visit yet.' },
  { t: 'Heritage and temples', b: 'A measured record for conservation, and a tour for everyone else.' },
  { t: 'Bridges and roads', b: 'A digital baseline for maintenance, captured while traffic keeps moving.' },
  { t: 'Real estate', b: 'Apartments and offices buyers can walk before they book a visit.' },
  { t: 'Banquet and event halls', b: 'The room as it will look on the day, from every seat.' }
];

// Before and after, one card each on the home page.
export const WINS = [
  { from: 'Days', to: 'Hours', b: 'The 576 m Gwarko Overpass took under two hours on site.' },
  { from: 'Photos', to: 'The room', b: 'Visitors walk the space instead of flicking through an album.' },
  { from: 'An app', to: 'One link', b: 'No app and no plugin. It opens on an ordinary phone.' },
  { from: 'Looking', to: 'Enquiring', b: 'An enquiry form inside the tour, so interest becomes a lead.' }
];

// The tour's visitor modes (CLAUDE.md §6.1), shown as tabs on the home page.
export const MODES = [
  { t: 'Viewpoints', b: 'Jump between the best views of the space, and look around freely at each.' },
  { t: 'Walk', b: 'First person, at eye height, with walls that stop you and a joystick on phones.' },
  { t: 'Orbit', b: 'Circle the middle of the room to take the whole of it in.' },
  { t: 'Fly', b: 'Free flight, like a 3D editor: W A S D on a keyboard, drag to look.' }
];

// Icons are 24-unit stroke paths, drawn in landing.css's .lp-spec-ic.
export const SPECS = [
  { n: '±1.2 cm', k: 'Relative accuracy', ic: 'M12 3v4M12 17v4M3 12h4M17 12h4M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0' },
  { n: '200,000', k: 'Points a second', ic: 'M4.9 7a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0M10.9 5a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0M16.9 8a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0M6.9 13a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0M13.9 12a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0M3.9 18a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0M10.9 18a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0M17.9 16a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0' },
  { n: '360°', k: 'LiDAR field of view', ic: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18' },
  { n: '37.7M', k: 'Points on one overpass', ic: 'M4 17l5-5 4 4 7-8M4 20h16' },
  { n: '0.6 km', k: 'Corridor in one walk', ic: 'M3 18c4-9 9-12 18-12M16 3l5 3-3 5' },
  { n: '0', k: 'Apps to install', ic: 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM11 18h2' }
];

export const SERVICES = [
  {
    k: 'tour', tab: 'Tours', title: 'Virtual tours that take enquiries',
    body: 'Your space as a live Gaussian-splat tour on your own website. Visitors walk it, fly it, and send an enquiry without leaving the room.'
  },
  {
    k: 'cloud', tab: 'Point clouds', title: 'Point clouds and BIM-ready models',
    body: 'Georeferenced, colourised point clouds and models your engineers and architects can open in the tools they already use.'
  },
  {
    k: 'plan', tab: 'Drawings', title: 'Plans, elevations and sections',
    body: 'Measured drawings from the scan: floor plans, orthographic elevations and sections at 1:1 scale.'
  },
  {
    k: 'heritage', tab: 'Heritage', title: 'Heritage documentation',
    body: 'A precise digital record of monuments and temples, for restoration, deformation analysis and public access.'
  },
  {
    k: 'infra', tab: 'Infrastructure', title: 'Infrastructure asset records',
    body: 'A digital baseline of bridges, overpasses and roads for maintenance planning, captured without closing the site.'
  },
  {
    k: 'embed', tab: 'Hosting', title: 'Hosting, embedding and updates',
    body: 'We host the tour, give you a snippet for your site, and republish when the space changes. Nothing to maintain.'
  }
];

export type Work = {
  /** also its footage slot: public/media/work/<slug>.jpg|mp4 */
  slug: string;
  place: string; where: string; when?: string; sector: string; status: 'done' | 'live' | 'now';
  body: string; stats?: [string, string][]; ships?: string[]; href?: string;
};

export const WORK: Work[] = [
  {
    slug: 'gwarko', place: 'Gwarko Overpass', where: 'Gwarko, Lalitpur', when: 'October 2025', sector: 'Infrastructure', status: 'done',
    body: 'A four-lane, 576 m overpass with a 36 m bridge span, scanned end to end while traffic kept moving. Reflective surfaces, changing light and passing vehicles, handled in one walk.',
    stats: [['37.7M', 'points'], ['1 h 58 m', 'on site'], ['0.6 km', 'corridor'], ['52 GB', 'raw data']],
    ships: ['Georeferenced point cloud', 'BIM-compatible model', 'Engineering drawings'],
    href: 'https://geonova.com.np/case-studies/3d-scanning-and-documentation-of-gwarko-overpass'
  },
  {
    slug: 'madan-ashrit', place: 'Madan Ashrit Memorial Technical School', where: 'Gothatar, Kathmandu', sector: 'Education', status: 'live',
    body: 'Labs, classrooms and shared spaces as a walkable 3D tour, so prospective students and parents can look around the campus before they visit.',
    ships: ['Campus virtual tour', 'Guided flythroughs']
  },
  {
    slug: 'nepathya', place: 'Nepathya College', where: 'Butwal, Rupandehi', sector: 'Education', status: 'live',
    body: 'An IT college’s computer labs and classrooms, open on any phone. Admissions can share one link instead of a photo album.',
    ships: ['Campus virtual tour', 'Guided flythroughs']
  },
  {
    slug: 'basera', place: 'Basera Boutique Hotel', where: 'Babar Mahal, Kathmandu', when: 'Now capturing', sector: 'Hospitality', status: 'now',
    body: 'Reception, rooms and event spaces as a tour on the hotel’s own website, with an enquiry form inside every room.',
    ships: ['Hotel tour', 'In-tour enquiries']
  }
];

export const STATUS: Record<Work['status'], string> = { done: 'Delivered', live: 'Virtual tour', now: 'In progress' };

export const STEPS = [
  { t: 'Capture', b: 'We walk the space once with a handheld Lixel Kity K1: 200,000 points a second, colour from two panoramic cameras.' },
  { t: 'Process', b: 'Lixel Studio turns the scan into a streaming Gaussian splat, at full fidelity. We never shrink a scan to fit a file size.' },
  { t: 'Author', b: 'In our studio we set the start view, place hotspots, add narration and record a guided flythrough.' },
  { t: 'Publish', b: 'One link and one embed code. The tour streams only what the camera sees, so a whole campus opens like a single room.' }
];

export const KIT = ['Lixel Kity K1', 'Lixel L2 Pro', 'PortalCam', 'Lixel Studio', 'Lixel CyberColor (LCC)'];
