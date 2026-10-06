/* Copy for the marketing pages (/, /work, /services, /how-it-works, /about).
 * Facts come from GeoNova's published case studies (geonova.com.np). Keep
 * them sourced: a number on these pages is a promise to a client. Scanner
 * figures (±1.2 cm, 200,000 points a second, 360°) are XGRIDS' published
 * Lixel K1 specs (xgrids.com/intl/lixelk1). */

import type { IconName } from '../../components/ui/Icon';
import { withBase } from '../../lib/basePath';

/** Pictures (2026-10-05): stills from our own scans and tours, one per
 *  service and per project, in public/media/services/<k>.webp and
 *  public/media/work/<slug>.webp. Placeholders until real photography: to
 *  change one, replace its file (same name). */
export const serviceImg = (k: string) => withBase(`/media/services/${k}.webp`);
export const workImg = (slug: string) => withBase(`/media/work/${slug}.webp`);

// ic: its Material icon (components/ui/Icon.tsx); img: one of the pictures above
export const SECTORS: { t: string; b: string; ic: IconName; img: string }[] = [
  { t: 'Hotels and resorts', b: 'Rooms, halls and restaurants, with an enquiry form in every one.', ic: 'hotel', img: workImg('basera') },
  { t: 'Colleges and schools', b: 'Labs and classrooms for students and parents who can’t visit yet.', ic: 'school', img: workImg('madan-ashrit') },
  { t: 'Heritage and temples', b: 'A measured record for conservation, and a tour for everyone else.', ic: 'temple', img: serviceImg('heritage') },
  { t: 'Bridges and roads', b: 'A digital baseline for maintenance, captured while traffic keeps moving.', ic: 'road', img: workImg('gwarko') },
  { t: 'Real estate', b: 'Apartments and offices buyers can walk before they book a visit.', ic: 'apartment', img: serviceImg('infra') },
  { t: 'Banquet and event halls', b: 'The room as it will look on the day, from every seat.', ic: 'event', img: serviceImg('tour') }
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
    k: 'tour', ic: 'cube' as IconName, tab: 'Tours', title: 'Virtual tours that take enquiries',
    body: 'Your space as a live Gaussian-splat tour on your own website. Visitors walk it, fly it, and send an enquiry without leaving the room.'
  },
  {
    k: 'cloud', ic: 'grain' as IconName, tab: 'Point clouds', title: 'Point clouds and BIM-ready models',
    body: 'Georeferenced, colourised point clouds and models your engineers and architects can open in the tools they already use.'
  },
  {
    k: 'plan', ic: 'ruler' as IconName, tab: 'Drawings', title: 'Plans, elevations and sections',
    body: 'Measured drawings from the scan: floor plans, orthographic elevations and sections at 1:1 scale.'
  },
  {
    k: 'heritage', ic: 'temple' as IconName, tab: 'Heritage', title: 'Heritage documentation',
    body: 'A precise digital record of monuments and temples, for restoration, deformation analysis and public access.'
  },
  {
    k: 'infra', ic: 'road' as IconName, tab: 'Infrastructure', title: 'Infrastructure asset records',
    body: 'A digital baseline of bridges, overpasses and roads for maintenance planning, captured without closing the site.'
  },
  {
    k: 'embed', ic: 'code' as IconName, tab: 'Hosting', title: 'Hosting, embedding and updates',
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

/** Who we are, in one place: the structured data (SiteJsonLd), /llms.txt
 *  and the policy pages read it. */
export const COMPANY = {
  brand: 'RCAAS.tech',
  name: 'RCAAS.tech',
  /** the registered company: only where the law needs it (the policy pages) */
  legal: 'GeoNova Solutions Pvt. Ltd.',
  summary: 'Reality Capture As A Service: walkable 3D virtual tours of hotels, restaurants, venues, colleges and heritage sites, captured with LiDAR in Nepal, with enquiry and booking forms inside the tour.',
  phone: '+977 984 678 9573',
  email: 'info@geonova.com.np',
  locality: 'Kageshwari-Manohara',
  city: 'Kathmandu',
  country: 'NP',
  hours: 'Sunday to Friday, 10:00 to 17:30',
  sameAs: ['https://geonova.com.np/about-us', 'https://www.linkedin.com/company/geonova-solutions-pvt-ltd/']
};

const DIGITS = COMPANY.phone.replace(/\D/g, '');

/** The ways to reach the team, shown as icons (layout/Reach.tsx) in the nav,
 *  the contact band, the footer and the Contact page; `detail` is what a
 *  hover or focus reveals and what a screen reader hears. */
export const REACH: { ic: IconName; label: string; detail: string; href: string; external?: boolean }[] = [
  { ic: 'call', label: 'Call', detail: COMPANY.phone, href: `tel:+${DIGITS}` },
  { ic: 'mail', label: 'Email', detail: COMPANY.email, href: `mailto:${COMPANY.email}?subject=${encodeURIComponent('Capture enquiry from RCAAS.tech')}` },
  {
    ic: 'chat', label: 'WhatsApp', detail: COMPANY.phone, external: true,
    href: `https://wa.me/${DIGITS}?text=${encodeURIComponent('Hello RCAAS, I would like to ask about a capture.')}`
  },
  {
    ic: 'place', label: 'Visit', detail: `${COMPANY.locality}, ${COMPANY.city}`, external: true,
    href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${COMPANY.locality}, ${COMPANY.city}`)}`
  }
];

/** Questions people ask before booking a capture, answered in a sentence or
 *  two from what this site already states. Shown on How it works and marked
 *  up as FAQPage there, so search and AI answers can quote them. */
export const FAQ = [
  {
    q: 'What is a Gaussian-splat virtual tour?',
    a: 'A photographic 3D copy of a real space, made from a LiDAR scan. Visitors walk, fly or orbit through it in the browser, instead of jumping between fixed 360° photos.'
  },
  {
    q: 'Do visitors need an app or a powerful computer?',
    a: 'No. The tour opens from one link in an ordinary phone or computer browser, with no app and no plugin. It streams only what the camera sees, so large scans open quickly.'
  },
  {
    q: 'How do you capture a space?',
    a: 'We walk through it once with a handheld XGRIDS Lixel Kity K1 scanner, which records 200,000 points a second, with colour from two panoramic cameras.'
  },
  {
    q: 'How accurate is the scan?',
    a: '±1.2 cm relative accuracy, the published specification of the XGRIDS Lixel K1 scanner we use.'
  },
  {
    q: 'How long does it take to get a tour on my website?',
    a: 'Days, not months, from the first walk-through to a link on your website.'
  },
  {
    q: 'Can visitors enquire or book from inside the tour?',
    a: 'Yes. Every tour has an enquiry form inside the room. Hotels, restaurants and venues can also take room, table and event booking requests, which the business confirms or declines.'
  },
  {
    q: 'Can I put the tour on my own website?',
    a: 'Yes. We host the tour and give you one link and an embed code for your site, and we republish it when the space changes.'
  },
  {
    q: 'What else can one scan produce?',
    a: 'Besides the tour: georeferenced point clouds and BIM-ready models, floor plans, elevations and sections, heritage documentation, and infrastructure asset records.'
  },
  {
    q: 'Where do you work?',
    a: 'We are RCAAS.tech, based in Kathmandu and an authorised XGRIDS partner in Nepal. For a space elsewhere, call or email us.'
  }
];

/** The explainer page (/gaussian-splatting, 2026-10-06), written answer-first
 *  for search and answer engines: the definition in the first lines, then a
 *  comparison, a glossary and the questions people ask. Also read by
 *  /llms.txt and /llms-full.txt and marked up as FAQPage / DefinedTermSet.
 *  General facts only (the 2023 paper, how the formats differ); the numbers
 *  we quote about our own scanner are the ones already on the other pages. */
export const GUIDE = {
  path: '/gaussian-splatting',
  title: 'What is a 3D Gaussian splat tour?',
  /** the whole answer, in under 60 words */
  answer: 'A 3D Gaussian splat tour is a walkable, photographic copy of a real place. The space is scanned, then rebuilt as millions of tiny soft-edged coloured blobs, called Gaussians, which a web browser draws in real time. Visitors move freely through it on a phone or computer, with no app to install.',
  published: '2026-10-06',
  modified: '2026-10-06',
  compare: {
    head: ['', '360° photo tour', 'Photogrammetry mesh', 'Gaussian splat tour'],
    rows: [
      ['How you move', 'Jump between fixed points', 'Anywhere', 'Anywhere: walk, fly or orbit'],
      ['How it looks', 'Sharp but flat', 'Textured polygons, can look waxy', 'Photographic, keeps fine detail such as carvings and foliage'],
      ['Thin and fine things', 'Fine, but only from the photo’s point of view', 'Often lost or smeared', 'Handled well'],
      ['Measurable', 'No', 'Only if scanned for it', 'Yes, when it starts from a LiDAR scan'],
      ['Weight on the web', 'Light', 'Heavy with textures', 'Large, so it streams by level of detail']
    ]
  },
  terms: [
    ['Gaussian splat', 'One soft, semi-transparent, coloured ellipse in 3D space. A scene is millions of them drawn together, instead of triangles.'],
    ['LiDAR', 'A scanner that measures distance with laser pulses, so it records the true shape of a space. A handheld one captures it as you walk.'],
    ['Point cloud', 'The raw result of a scan: millions of measured points, each with a position and a colour.'],
    ['Level of detail (LOD)', 'Keeping several resolutions of the same scan and loading the one that suits how near the camera is, so a large scan opens fast.'],
    ['LCC', 'Lixel CyberColor, the XGRIDS format that stores a splat scan in tiles that stream by level of detail. It is what our tours are made from.']
  ] as [string, string][],
  faq: [
    {
      q: 'What does “Gaussian splatting” mean?',
      a: 'It is a way of showing a 3D scene as many soft, semi-transparent, coloured ellipsoids (Gaussians) instead of triangles. The method for drawing them in real time was published in 2023 by researchers at Inria in the paper “3D Gaussian Splatting for Real-Time Radiance Field Rendering”.'
    },
    {
      q: 'How is it different from a 360° virtual tour?',
      a: 'A 360° tour is a set of panoramic photos you jump between, so you can only look around from the places the photographer stood. A splat tour is a 3D copy of the whole space, so visitors choose their own path and viewpoint.'
    },
    {
      q: 'How is it different from photogrammetry or a 3D mesh?',
      a: 'A mesh is built from triangles with photos painted on, which can look waxy and loses thin things such as railings, leaves and lattice. A splat keeps the photographic look of the capture and handles those fine details better.'
    },
    {
      q: 'Does it work on a phone?',
      a: 'Yes. The tour runs in the phone’s browser from one link. It streams only what the camera sees and lowers its quality automatically on a slower device, so it keeps moving.'
    },
    {
      q: 'Why does a large scan still open quickly?',
      a: 'We never shrink the scan. The tour keeps it at full quality and loads it in tiles by level of detail, so what is near the camera arrives first and the rest follows.'
    },
    {
      q: 'Can I get measurements or a floor plan from it?',
      a: 'Yes, because our tours start from a LiDAR scan, not photos alone. The same capture also gives point clouds, floor plans, elevations and sections.'
    },
    {
      q: 'Who makes Gaussian splat tours in Nepal?',
      a: 'RCAAS.tech, in Kathmandu, an authorised XGRIDS partner. We scan the space on site, build the tour, host it and give you a link and an embed code for your website.'
    }
  ]
};
