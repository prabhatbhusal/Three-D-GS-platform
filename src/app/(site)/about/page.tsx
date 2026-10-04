import type { Metadata } from 'next';
import { SitePage } from '../../../components/SitePage';
import '../../../components/fieldbook.css';
import { ContourPlate } from '../../../components/ContourPlate';
import { MediaFill } from '../../../components/SiteMotion';
import { media } from '../../../lib/media';
import { KIT, STATUS, WORK } from '../../../lib/siteContent';

export const metadata: Metadata = {
  alternates: { canonical: '/about' },
  title: 'About',
  description: 'RCAAS.tech is the reality-capture service of GeoNova Solutions, Kathmandu, an authorised XGRIDS partner in Nepal.'
};

/** About, as a page of a surveyor's field book: the register of sites we've
 *  measured, the mission on a contour plate (or over the team's film, when
 *  public/media/about.* is delivered), and the kit. Styles: landing.css "Field book". */
export default function AboutPage() {
  const film = media('about');
  const mission = (
    <blockquote className="lp-mission">
      <p>Transforming engineering with 3D geospatial solutions that empower industries, drive innovation, and create a sustainable future.</p>
      <cite>GeoNova’s mission</cite>
    </blockquote>
  );

  return (
    <SitePage>
      <section className="lp-field lp-field-about">
        <header className="lp-page-head lp-field-head">
          <h1>Built by surveyors, for sales</h1>
          <p>
            RCAAS.tech is the reality-capture service of GeoNova Solutions Pvt. Ltd., a geospatial company in
            Kageshwari-Manohara, Kathmandu. We have documented monuments, infrastructure and campuses with
            survey-grade LiDAR. RCAAS.tech puts that same precision to work selling rooms, halls and seats.
          </p>
        </header>

        <table className="lp-register">
          <caption>Sites we have measured</caption>
          <thead>
            <tr><th scope="col">Site</th><th scope="col">What we handed over</th><th scope="col">Status</th></tr>
          </thead>
          <tbody>
            {WORK.map((w) => (
              <tr key={w.slug}>
                <th scope="row">
                  <span className="lp-register-place">{w.href ? <a href={w.href} target="_blank" rel="noreferrer">{w.place}</a> : w.place}</span>
                  <span className="lp-register-where">{w.where}</span>
                </th>
                <td>
                  {w.ships?.join(', ')}
                  {w.stats && <span className="lp-register-stats">{w.stats.map(([n, k]) => `${n} ${k}`).join(', ')}</span>}
                </td>
                <td className={`lp-register-status is-${w.status}`}>{STATUS[w.status]}{w.when && w.status === 'done' ? `, ${w.when}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {film ? (
          <div className="lp-mission-film" data-nav-dark>
            <div className="lp-mission-media" aria-hidden><MediaFill m={film} lazy /></div>
            {mission}
          </div>
        ) : (
          <ContourPlate seed={0.9} side>{mission}</ContourPlate>
        )}

        <div className="lp-field-cols">
          <div>
            <h2>What we carry</h2>
            <ul className="lp-kitlist">{KIT.map((k) => <li key={k}>{k}</li>)}</ul>
          </div>
          <div>
            <h2>Who we work with</h2>
            <p>GeoNova is an authorised XGRIDS partner in Nepal, for equipment, training and support.</p>
            <p>RCAAS.tech, the tours and the studio behind them, is built with I.STEM Lab.</p>
          </div>
        </div>
      </section>
    </SitePage>
  );
}
