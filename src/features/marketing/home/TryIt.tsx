/** "Try it yourself": three things a visitor can open right now, no sign-up.
 *  The tour wants a full page load (its 3D renderer is one per page), so it is
 *  a plain link. Styles: home.css .hp-cards. */
import Link from 'next/link';

const TRY = [
  { href: '/tour', reload: true, t: 'Walk a live tour', b: 'Open a published space and move through it: viewpoints, walking, orbiting, flying.' },
  { href: '/gallery', reload: false, t: 'Browse the gallery', b: 'Every space we have published, each one a link you could put on your own website.' },
  { href: '/how-it-works', reload: false, t: 'See how it works', b: 'From the first walk-through to the embed code, and the questions people ask before a capture.' }
];

export function TryIt() {
  return (
    <section className="hp-block" aria-labelledby="hp-try-title">
      <header className="hp-block-head">
        <h2 id="hp-try-title">Try it yourself.</h2>
        <p>No sign-up, no app. It all opens in the browser you are using now.</p>
      </header>
      <ul className="hp-cards hp-cards-3">
        {TRY.map((x) => (
          <li key={x.href}>
            {x.reload
              ? <a href={x.href} className="hp-card hp-card-try"><h3>{x.t}</h3><p>{x.b}</p></a>
              : <Link href={x.href} transitionTypes={['nav-forward']} className="hp-card hp-card-try"><h3>{x.t}</h3><p>{x.b}</p></Link>}
          </li>
        ))}
      </ul>
    </section>
  );
}
