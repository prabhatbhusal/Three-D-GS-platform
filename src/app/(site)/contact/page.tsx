import type { Metadata } from 'next';
import { ContactWays, PageHead, SitePage } from '../../../components/SitePage';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Book a LiDAR capture of your hotel, campus, heritage site or building. GeoNova Solutions, Kathmandu.'
};

const ASK = [
  { t: 'What the space is', b: 'A hotel floor, a banquet hall, a campus, a temple courtyard.' },
  { t: 'Where it is', b: 'The town or district, and how we reach it.' },
  { t: 'Roughly how big', b: 'Rooms, floors or square metres. A guess is fine.' },
  { t: 'What you need', b: 'A tour for your website, drawings, a point cloud, or all three.' }
];

export default function ContactPage() {
  return (
    <SitePage contact={false}>
      <section className="lp-band lp-reach">
        <div>
          <PageHead label="Contact" lede="Call or write and we will scan it, publish it and hand you a link.">
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
