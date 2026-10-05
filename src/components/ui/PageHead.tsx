/** A page's opening banner: a small label, the page's one h1, and a line of
 *  context. Every inner marketing page starts with it (work, services, how it
 *  works, the policies); pass the words as props. Styles: landing.css .lp-page-head. */
import type { ReactNode } from 'react';

export function PageHead({ label, children, lede }: { label: string; children: ReactNode; lede?: string }) {
  return (
    <header className="lp-head lp-page-head">
      <p className="lp-label">{label}</p>
      <h1>{children}</h1>
      {lede && <p>{lede}</p>}
    </header>
  );
}
