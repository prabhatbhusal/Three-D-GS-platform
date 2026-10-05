/** The home page's opening screen: the hero film (public/media/hero, if
 *  there is one), the name, the promise and the two calls to action. */
import { MediaFill } from '../SiteMotion';
import { Button } from '../../../components/ui/Button';
import { media } from '../media';

export function Hero() {
  const hero = media('hero');
  return (
    <section className={hero ? 'lp-hero has-media' : 'lp-hero'} data-nav-dark={hero ? '' : undefined}>
      {hero && <div className="lp-hero-media" aria-hidden><MediaFill m={hero} /></div>}
      <h1>
        <span className="lp-hero-word">RCAAS</span>
        <span className="lp-hero-title">Reality Capture As A Service</span>
      </h1>
      <p className="lp-lede">
        We walk your space once. Your visitors walk it for years: on any phone, in 3D,
        and they enquire without ever leaving the room.
      </p>
      <div className="lp-cta">
        <Button href="/contact" transitionTypes={['nav-forward']} variant="pill-solid">Book a capture</Button>
        {/* straight into a tour (the newest published space); reload: the tour wants a full page load */}
        <Button href="/tour" reload>
          Walk a live tour
          <svg className="lp-pill-ic" viewBox="0 0 24 24" aria-hidden><path d="M8 5.5v13l10.5-6.5z" /></svg>
        </Button>
      </div>
    </section>
  );
}
