import type { Metadata } from 'next';
import { SitePage } from '../../../features/marketing/layout/SitePage';
import { PageHead } from '../../../components/ui/PageHead';
import { Section } from '../../../components/ui/Section';
import { Icon } from '../../../components/ui/Icon';
import { MediaFill } from '../../../features/marketing/SiteMotion';
import { media } from '../../../features/marketing/media';
import { KIT, STATUS, WORK } from '../../../features/marketing/siteContent';

export const metadata: Metadata = {
  alternates: { canonical: '/about' },
  title: 'About',
  description: 'RCAAS.tech is the reality-capture service of GeoNova Solutions, Kathmandu, an authorised XGRIDS partner in Nepal.'
};

const MISSION = 'Transforming engineering with 3D geospatial solutions that empower industries, drive innovation, and create a sustainable future.';

/** About: who we are, the register of sites we've measured, GeoNova's
 *  mission lighting up word by word as it scrolls past (over the team's film
 *  when public/media/about.* is delivered), the kit as a moving strip, and
 *  who we work with. Styles: inner.css .ip-register, .ip-mission, .ip-kit. */
export default function AboutPage() {
  const film = media('about');
  return (
    <SitePage>
      <PageHead label="about" facts={['GeoNova Solutions Pvt. Ltd.', 'Kathmandu, Nepal', 'Authorised XGRIDS partner']}
        lede="RCAAS.tech is the reality-capture service of GeoNova Solutions, a geospatial company in Kageshwari-Manohara, Kathmandu. We have documented monuments, infrastructure and campuses with survey-grade LiDAR, and now put that precision to work selling rooms, halls and seats.">
        Built by engineers, for sales.
      </PageHead>

      <Section id="about-register" title="Sites we have measured">
        <ul className="ip-register">
          {WORK.map((w) => (
            <li key={w.slug} data-reveal>
              <p className={`ip-status is-${w.status}`}>{STATUS[w.status]}{w.when && w.status === 'done' ? `, ${w.when}` : ''}</p>
              <h3>{w.href ? <a href={w.href} target="_blank" rel="noreferrer">{w.place}<Icon name="outward" /></a> : w.place}</h3>
              <p className="ip-register-where">{w.where}</p>
              <p className="ip-register-ships">{w.ships?.join(', ')}</p>
            </li>
          ))}
        </ul>
      </Section>

      <section className="ip-mission" data-nav-dark={film ? '' : undefined} aria-label="Our mission">
        {film && <div className="ip-mission-media" aria-hidden><MediaFill m={film} lazy /></div>}
        <blockquote>
          <p data-words>{MISSION}</p>
          <cite>GeoNova’s mission</cite>
        </blockquote>
      </section>

      <section className="ip-kit" aria-labelledby="about-kit">
        <h2 id="about-kit" className="ip-kit-h">What we carry</h2>
        <div className="ip-kit-track" aria-hidden>
          {[0, 1].map((n) => <span key={n}>{KIT.map((k) => <b key={k}>{k}</b>)}</span>)}
        </div>
        <ul className="sr-only">{KIT.map((k) => <li key={k}>{k}</li>)}</ul>
      </section>

      <Section id="about-who" title="Who we work with">
        <div className="ip-two">
          <p data-reveal>GeoNova is an authorised XGRIDS partner in Nepal, for equipment, training and support.</p>
          <p data-reveal>RCAAS.tech, the tours and the studio behind them, is built with I.STEM Lab.</p>
        </div>
      </Section>
    </SitePage>
  );
}
