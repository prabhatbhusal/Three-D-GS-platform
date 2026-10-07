import { SITE_URL } from '../../lib/shareMeta';
import { COMPANY, FAQ, SERVICES, STEPS } from './siteContent';
import { GUIDE } from './guide';

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
          legalName: COMPANY.legal,
          description: COMPANY.summary,
          url: SITE_URL,
          logo: { '@type': 'ImageObject', url: `${SITE_URL}/logo.png`, width: 512, height: 512 },
          image: `${SITE_URL}/og.jpg`,
          slogan: 'Walk it once. Open it anywhere.',
          knowsAbout: ['3D Gaussian splatting', 'LiDAR scanning', 'Point clouds', 'Virtual tours', 'Reality capture', 'Heritage documentation', 'BIM-ready models'],
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
        { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, url: SITE_URL, name: COMPANY.brand, alternateName: 'RCAAS', inLanguage: 'en', publisher: { '@id': org } }
      ]
    }} />
  );
}

/** A list of questions as FAQPage, next to the same questions on the page
 *  (the How it works FAQ by default; the guide passes its own). */
export function FaqJsonLd({ items = FAQ }: { items?: { q: string; a: string }[] }) {
  return (
    <JsonLd data={{
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: items.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
    }} />
  );
}

/** Breadcrumbs: where a page sits (Home > Page), so a result can show the path. */
export function BreadcrumbJsonLd({ name, path }: { name: string; path: string }) {
  return (
    <JsonLd data={{
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name, item: `${SITE_URL}${path}` }
      ]
    }} />
  );
}

/** The four steps as HowTo (How it works), so an answer engine can list them in order. */
export function HowToJsonLd() {
  return (
    <JsonLd data={{
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'How a LiDAR scan becomes a live 3D tour',
      description: 'Capture a space once with a handheld LiDAR scanner, process it into a Gaussian splat, author the tour and publish it as one link.',
      step: STEPS.map((st, i) => ({ '@type': 'HowToStep', position: i + 1, name: st.t, text: st.b }))
    }} />
  );
}

/** The home page's words for a voice assistant to read out: its headline and lead. */
export function SpeakableJsonLd({ path = '/' }: { path?: string }) {
  return (
    <JsonLd data={{
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': `${SITE_URL}${path === '/' ? '' : path}/#webpage`,
      url: `${SITE_URL}${path === '/' ? '' : path}`,
      isPartOf: { '@id': `${SITE_URL}/#website` },
      speakable: { '@type': 'SpeakableSpecification', cssSelector: ['.hp-hero-title', '.hp-hero-lede'] }
    }} />
  );
}

/** The explainer page: an article by us, plus its glossary as a DefinedTermSet. */
export function GuideJsonLd() {
  return (
    <JsonLd data={{
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'TechArticle',
          headline: GUIDE.title,
          description: GUIDE.short,
          url: `${SITE_URL}${GUIDE.path}`,
          image: `${SITE_URL}/og.jpg`,
          datePublished: GUIDE.published,
          dateModified: GUIDE.modified,
          inLanguage: 'en',
          author: { '@id': `${SITE_URL}/#org` },
          publisher: { '@id': `${SITE_URL}/#org` },
          about: { '@type': 'Thing', name: '3D Gaussian splatting', sameAs: 'https://en.wikipedia.org/wiki/Gaussian_splatting' }
        },
        {
          '@type': 'DefinedTermSet',
          name: 'Gaussian splatting and LiDAR terms',
          hasDefinedTerm: GUIDE.terms.map(([term, definition]) => ({ '@type': 'DefinedTerm', name: term, description: definition, inDefinedTermSet: `${SITE_URL}${GUIDE.path}` }))
        }
      ]
    }} />
  );
}
