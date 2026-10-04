import type { Metadata } from 'next';
import { ContactWays, PageHead, SitePage } from '../../../components/SitePage';

export const metadata: Metadata = {
  alternates: { canonical: '/contact' },
  title: 'Contact',
  description: 'Book a LiDAR capture of your hotel, campus, heritage site or building. GeoNova Solutions, Kathmandu.'
};

const ASK = [
  { t: 'What is the space', b: 'A hotel floor, a banquet hall, a campus, a temple courtyard.' },
  { t: 'Where is it', b: 'Precise location so we can reach it.' },
  { t: 'Roughly how big', b: 'Rooms, floors or hall and square metres. A guess is fine.' },
  { t: 'Your requirements', b: 'A tour for your website, 360 video or both.' }
];

export default function ContactPage() {
  return (
    <SitePage contact={false}>
      <section className="lp-band lp-reach">
        <div>
          <PageHead label="Contact" lede="Call or email and we will scan it, publish it and hand you a link.">
            Have a space worth <em>walking</em>?
          </PageHead>
          <ol className="lp-ask">
            {ASK.map((a) => <li key={a.t}><b>{a.t}</b>{a.b}</li>)}
          </ol>
        </div>
        <ContactWays />
      </section>
    </SitePage>
  );
}
