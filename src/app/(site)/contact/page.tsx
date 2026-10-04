import type { Metadata } from 'next';
import { SitePage } from '../../../components/SitePage';
import '../../../components/fieldbook.css';
import { ContactSheet } from '../../../components/ContactSheet';
import { ContourPlate } from '../../../components/ContourPlate';
import { COMPANY } from '../../../lib/siteContent';

export const metadata: Metadata = {
  alternates: { canonical: '/contact' },
  title: 'Contact',
  description: 'Book a LiDAR capture of your hotel, campus, heritage site or building. GeoNova Solutions, Kathmandu.'
};

/** Contact, as a page of a surveyor's field book: the sheet a crew fills in
 *  before a site visit, and the office marked on a contour plate. Styles:
 *  landing.css "Field book". */
export default function ContactPage() {
  const tel = `tel:${COMPANY.phone.replace(/[^\d+]/g, '')}`;
  return (
    <SitePage contact={false}>
      <section className="lp-field lp-field-contact">
        <header className="lp-page-head lp-field-head">
          <h1>Tell us about the space</h1>
          <p>Five answers and we can plan the walk-through, quote it and give you a date.</p>
        </header>

        <div className="lp-field-grid">
          <ContactSheet />

          <aside className="lp-field-side" aria-label="Call or visit">
            <div className="lp-talk">
              <p>Rather talk it through?</p>
              <a href={tel} className="lp-talk-phone">{COMPANY.phone}</a>
              <a href={`mailto:${COMPANY.email}`} className="lp-talk-mail">{COMPANY.email}</a>
            </div>
            <ContourPlate seed={2.4}>
              <p className="lp-plate-name">{COMPANY.name}</p>
              <p>{COMPANY.locality}, {COMPANY.city}</p>
              <p>{COMPANY.hours}</p>
            </ContourPlate>
          </aside>
        </div>
      </section>
    </SitePage>
  );
}
