// Every page the router draws, besides blog posts and blog pages 2+ (meta.ts).
// A list rather than only a type, so the static export can name each page.
export const ROUTES = [
  '/',
  '/services/',
  '/services/immersive-experiences/',
  '/services/immersive-experiences/3d-virtual-tours/',
  '/services/visual-storytelling/',
  '/services/game-worlds-assets/',
  '/services/digital-twins/',
  '/services/digital-twins/3d-laser-scanning/',
  '/services/digital-twins/drone-mapping/',
  '/industries/',
  '/industries/hospitality-tourism/',
  '/industries/education/',
  '/industries/real-estate-architecture/',
  '/industries/heritage-culture/',
  '/industries/government-municipalities/',
  '/industries/factories/',
  '/industries/non-life-insurance/',
  '/industries/gaming/',
  '/industries/filmmaking/',
  '/industries/nonprofit-international-development/',
  '/industries/banking-financial-institutions/',
  '/work/',
  '/work/chilancho-stupa-digital-heritage/',
  '/work/nepathya-school-college-3d-campus-tour/',
  '/work/madan-ashrit-polytechnic-3d-campus-tour/',
  '/work/basera-boutique-hotel-3d-experience/',
  '/platform/',
  '/how-we-work/',
  '/learn/',
  '/learn/3d-virtual-tour-vs-360-tour-vs-video/',
  '/learn/what-is-gaussian-splatting/',
  '/learn/planning-a-3d-experience-cost-and-timeline/',
  '/about/',
  '/faq/',
  '/contact/',
  '/privacy/',
  '/terms/',
  '/gallery/',
  '/cookies/',
  '/security/',
  '/thank-you/',
  '/blog/',
] as const;

export type RoutePath = (typeof ROUTES)[number];

export interface Pillar {
  id: string;
  slug: string;
  title: string;
  promise: string;
  body: string;
  chips: string[];
  link: string;
  iconName: string;
}

export interface Industry {
  id: string;
  slug: string;
  title: string;
  goalHeadline: string;
  whoItsFor?: string;
  summary: string;
  proof?: string;
  link: string;
  badge: string;
}

export interface CaseStudy {
  id: string;
  slug: string;
  title: string;
  tag: string;
  line: string;
  location: string;
  clientGoal: string;
  whatWeCreated?: string;
  posterAlt?: string;
  resultMetric?: string;
  heroImage: string;
  embedDemoId: 'chilancho' | 'basera' | 'nepathya' | 'madan';
  deliverables: string[];
  techUsed: string[];
}

export interface ToolkitItem {
  category: string;
  whatItDoesForYou: string;
  examples: string[];
}

export interface PlaceholderItem {
  id: string;
  item: string;
  usedOn: string;
  priority: 'B' | 'H' | 'N';
  status: 'Simulated in Production' | 'To Be Input' | 'To Be Confirmed';
  simulatedValue?: string;
}
