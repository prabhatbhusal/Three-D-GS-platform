import { pageMeta } from '../../lib/shareMeta';
import { SitePage } from '../../features/marketing/layout/SitePage';
import { Hero } from '../../features/marketing/home/Hero';
import { Places } from '../../features/marketing/home/Places';
import { Services } from '../../features/marketing/home/Services';
import { WorkCards } from '../../features/marketing/home/WorkCards';
import { TryIt } from '../../features/marketing/home/TryIt';
import { StudioWindow } from '../../features/marketing/home/StudioWindow';
import { ProvenSpecs } from '../../features/marketing/home/ProvenSpecs';
import { Method } from '../../features/marketing/home/Method';
import { AskBox } from '../../features/marketing/home/AskBox';
import { SpeakableJsonLd } from '../../features/marketing/JsonLd';
import { HomeMotion } from '../../features/marketing/home/HomeMotion';

export const metadata = pageMeta('/', 'RCAAS.tech | 3D Gaussian splat virtual tours and LiDAR scanning in Nepal',
  'RCAAS.tech scans hotels, colleges, heritage sites and infrastructure with handheld LiDAR and publishes them as Gaussian-splat 3D tours that open on any phone, with enquiry and booking inside.', true);

/** The home page, top to bottom (2026-10-05):
 *  stupa hero, the method (one point cloud re-forming for each step,
 *  Method.tsx), places strip, what we capture, the work, try it, the
 *  numbers, and a question box. Text only for now: the photo and film
 *  sections (Film, ScanStory, WaysIn, EnquiryBleed in features/marketing/home/)
 *  are ready to add back. The look: home.css; the words: siteContent.ts.
 *  The ask box closes the page (with the phone and email), so SitePage adds only the footer; the nav comes from (site)/layout.tsx. */
export default function HomePage() {
  return (
    <SitePage contact={false}>
      <SpeakableJsonLd />
      <div className="hp">
        <Hero />
        <Method />
        <Places />
        <Services />
        <WorkCards />
        <StudioWindow />
        <TryIt />
        <ProvenSpecs />
        <AskBox />
        <HomeMotion />
      </div>
    </SitePage>
  );
}
