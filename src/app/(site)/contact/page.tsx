import type { Metadata } from 'next';
import { SitePage } from '../../../features/marketing/layout/SitePage';
import { PageHead } from '../../../components/ui/PageHead';
import { ContactSheet } from '../../../features/marketing/ContactSheet';
import { OpenNow, ReachIcons } from '../../../features/marketing/layout/Reach';
import { COMPANY } from '../../../features/marketing/siteContent';

export const metadata: Metadata = {
  alternates: { canonical: '/contact' },
  title: 'Contact',
  description: 'Book a LiDAR capture of your hotel, campus, heritage site or building. RCAAS.tech, Kathmandu.'
};

/** Contact: the enquiry as a sentence to fill in (ContactSheet), and beside
 *  it the ways to talk instead, as icons, with whether the office is open
 *  right now. Styles: inner.css .ip-contact. */
export default function ContactPage() {
  return (
    <SitePage contact={false}>
      <PageHead label="contact" lede="Fill in the blanks and we can plan the walk-through, quote it and give you a date.">
        Tell us about the space.
      </PageHead>
      <section className="ip-contact" aria-label="Enquiry">
        <ContactSheet />
        <aside className="ip-contact-side" aria-label="Call, write or visit">
          <p className="ip-contact-k">Rather talk it through?</p>
          <ReachIcons className="reach-lg" />
          <OpenNow />
          <p className="ip-contact-meta">{COMPANY.hours}<br />{COMPANY.name}, {COMPANY.locality}, {COMPANY.city}</p>
        </aside>
      </section>
    </SitePage>
  );
}
