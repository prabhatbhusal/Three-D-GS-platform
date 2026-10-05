/** The home page's opening screen: the point-cloud globe (PointGlobe), the
 *  promise in poster-size mono, and the two calls to action. Styles: home.css. */
import { Button } from '../../../components/ui/Button';
import { PointGlobe } from './PointGlobe';
import './home.css';

export function Hero() {
  return (
    <section className="hp-hero" data-nav-dark="">
      <PointGlobe className="hp-globe" />
      <h1 className="hp-hero-title">
        <span>Walk it once.</span>
        <span>Open it anywhere.</span>
      </h1>
      <p className="hp-hero-lede">
        We scan hotels, colleges and heritage sites in Nepal with handheld LiDAR. Your visitors walk
        them in 3D on any phone, from anywhere, and ask without leaving the room.
      </p>
      <div className="hp-hero-cta">
        <Button href="/contact" transitionTypes={['nav-forward']} variant="pill-solid">Book a capture</Button>
        {/* reload: the tour wants a full page load */}
        <Button href="/tour" reload>Walk a live tour</Button>
      </div>
    </section>
  );
}
