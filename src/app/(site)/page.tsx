import type { Metadata } from 'next';
import { SitePage } from '../../features/marketing/layout/SitePage';
import { Hero } from '../../features/marketing/home/Hero';
import { ScanStory } from '../../features/marketing/home/ScanStory';
import { WhyTours } from '../../features/marketing/home/WhyTours';
import { ProvenSpecs } from '../../features/marketing/home/ProvenSpecs';
import { WaysIn } from '../../features/marketing/home/WaysIn';
import { FourSteps } from '../../features/marketing/home/FourSteps';
import { EnquiryBleed } from '../../features/marketing/home/EnquiryBleed';
import { Sectors } from '../../features/marketing/home/Sectors';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
  title: { absolute: 'RCAAS.tech — Reality Capture As A Service' },
  description:
    'RCAAS.tech scans hotels, colleges, heritage sites and infrastructure with handheld LiDAR and publishes them as live 3D tours that open on any phone.'
};

/** The home page, top to bottom. Each section is its own file in
 *  components/home/, and their words live in features/marketing/siteContent.ts. SitePage adds
 *  the contact band and the footer; the nav comes from (site)/layout.tsx. */
export default function HomePage() {
  return (
    <SitePage>
      <Hero />
      <ScanStory />
      <WhyTours />
      <ProvenSpecs />
      <WaysIn />
      <FourSteps />
      <EnquiryBleed />
      <Sectors />
    </SitePage>
  );
}
