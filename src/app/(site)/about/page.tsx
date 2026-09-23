import type { Metadata } from 'next';
import { MediaFill } from '../../../components/SiteMotion';
import { PageHead, SitePage } from '../../../components/SitePage';
import { media } from '../../../lib/media';
import { KIT } from '../../../lib/siteContent';

export const metadata: Metadata = {
  title: 'About',
  description: 'RCAAS.tech is the reality-capture service of GeoNova Solutions, Kathmandu, an authorised XGRIDS partner in Nepal.'
};

const QUOTE = (
  <blockquote>
    “Transforming engineering with 3D geospatial solutions that empower industries,
    drive innovation, and create a sustainable future.”
    <cite>GeoNova’s mission</cite>
  </blockquote>
);

export default function AboutPage() {
  const film = media('about');

  return (
    <SitePage>
      <section className="lp-band lp-about">
        <div>
          <PageHead label="About">Built by surveyors, <em>for sales</em></PageHead>
          <p>
            RCAAS.tech is the reality-capture service of <b>GeoNova Solutions Pvt. Ltd.</b>, a
            geospatial company in Kageshwari-Manohara, Kathmandu, and an authorised XGRIDS
            partner in Nepal. We have documented monuments, infrastructure and campuses with
            survey-grade LiDAR. RCAAS.tech puts that same precision to work selling rooms, halls
            and seats, built with I.STEM Lab.
          </p>
          {!film && QUOTE}
        </div>
        <aside className="lp-kit" aria-label="Our kit">
          <p className="lp-label">In the kit bag</p>
          <ul>{KIT.map((k) => <li key={k}>{k}</li>)}</ul>
          <p className="lp-kit-note">Authorised XGRIDS partner: equipment, training and support in Nepal.</p>
        </aside>
      </section>

      {/* the mission over the team's own footage, edge to edge */}
      {film && (
        <section className="lp-bleed">
          <div className="lp-bleed-media" aria-hidden><MediaFill m={film} lazy /></div>
          {QUOTE}
        </section>
      )}
    </SitePage>
  );
}
