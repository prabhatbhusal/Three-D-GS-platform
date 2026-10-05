import type { Metadata } from 'next';
import { SitePage } from '../../features/marketing/layout/SitePage';
import { Hero } from '../../features/marketing/home/Hero';
import { Places } from '../../features/marketing/home/Places';
import { Services } from '../../features/marketing/home/Services';
import { WorkCards } from '../../features/marketing/home/WorkCards';
import { TryIt } from '../../features/marketing/home/TryIt';
import { ProvenSpecs } from '../../features/marketing/home/ProvenSpecs';
import { Method } from '../../features/marketing/home/Method';
import { AskBox } from '../../features/marketing/home/AskBox';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  title: { absolute: 'RCAAS.tech — Reality Capture As A Service' },
  description:
    'RCAAS.tech scans hotels, colleges, heritage sites and infrastructure with handheld LiDAR and publishes them as live 3D tours that open on any phone.'
};

/** The home page, top to bottom (2026-10-05, in the manner of weevolveit.com):
 *  globe hero, places strip, what we capture, the work, try it, the numbers,
 *  the method, and a question box. Text only for now: the photo and film
 *  sections (Film, ScanStory, WaysIn, EnquiryBleed in features/marketing/home/)
 *  are ready to add back. The look: home.css; the words: siteContent.ts.
 *  SitePage adds the contact band and the footer; the nav comes from (site)/layout.tsx. */
export default function HomePage() {
  return (
    <SitePage>
      <div className="hp">
        <Hero />
        <Places />
        <Services />
        <WorkCards />
        <TryIt />
        <ProvenSpecs />
        <Method />
        <AskBox />
      </div>
    </SitePage>
  );
}
