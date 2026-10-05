/** A real scan, flown through (public/media/hero), framed
 *  edge to edge with a surveyor's corner ticks. Hidden without that film.
 *  Styles: home.css .hp-film. */
import { MediaFill } from '../SiteMotion';
import { media } from '../media';

export function Film() {
  const film = media('hero');
  if (!film) return null;
  return (
    <section className="hp-film" data-nav-dark="">
      <div className="hp-film-frame">
        <div className="hp-film-media" aria-hidden><MediaFill m={film} lazy /></div>
        <span className="hp-tick hp-tick-tl" aria-hidden />
        <span className="hp-tick hp-tick-tr" aria-hidden />
        <span className="hp-tick hp-tick-bl" aria-hidden />
        <span className="hp-tick hp-tick-br" aria-hidden />
      </div>
      <p className="hp-film-caption">A heritage courtyard, scanned and turned into a Gaussian splat you can fly through.</p>
    </section>
  );
}
