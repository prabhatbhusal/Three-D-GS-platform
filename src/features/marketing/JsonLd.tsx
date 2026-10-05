import { SITE_URL } from '../../lib/shareMeta';
import { COMPANY, FAQ, SERVICES } from './siteContent';

/** schema.org structured data, so search engines and AI answers read who we
 *  are, what we do and our FAQ as facts, not guesses. `<` is escaped so the
 *  text can never close the script tag. */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />;
}

/** The business and the website, on every marketing page ((site)/layout.tsx). */
export function SiteJsonLd() {
  const org = `${SITE_URL}/#org`;
  return (
    <JsonLd data={{
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'ProfessionalService',
          '@id': org,
          name: COMPANY.brand,
          legalName: COMPANY.name,
          description: COMPANY.summary,
          url: SITE_URL,
          logo: `${SITE_URL}/favicon.svg`,
          telephone: COMPANY.phone,
          email: COMPANY.email,
          address: { '@type': 'PostalAddress', addressLocality: COMPANY.locality, addressRegion: COMPANY.city, addressCountry: COMPANY.country },
          openingHoursSpecification: {
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            opens: '10:00',
            closes: '17:30'
          },
          areaServed: { '@type': 'Country', name: 'Nepal' },
          sameAs: COMPANY.sameAs,
          hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: 'Services',
            itemListElement: SERVICES.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.title, description: s.body, provider: { '@id': org } } }))
          }
        },
        { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: SITE_URL, name: COMPANY.brand, inLanguage: 'en', publisher: { '@id': org } }
      ]
    }} />
  );
}

/** The FAQ as FAQPage, next to the visible questions (How it works). */
export function FaqJsonLd() {
  return (
    <JsonLd data={{
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
    }} />
  );
}
