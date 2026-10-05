/** A page's opening (2026-10-05): where you are as a path (rcaas.tech /
 *  services), the page's one h1 at poster size, a line of context, and
 *  optionally a few facts in a row. Every inner marketing page starts with
 *  it; its letters rise in once the loading screen has gone (SiteGsap).
 *  `center` for the listing pages (services, work, how it works, live tours).
 *  Styles: inner.css .ip-head. */
import type { ReactNode } from 'react';

export function PageHead({ label, children, lede, facts, center = false }: {
  label: string; children: ReactNode; lede?: ReactNode; facts?: string[]; center?: boolean;
}) {
  return (
    <header className={center ? 'ip-head is-center' : 'ip-head'}>
      <p className="ip-path"><span>rcaas.tech</span> / {label}</p>
      <h1 className="ip-title">{children}</h1>
      {lede && <p className="ip-lede">{lede}</p>}
      {facts && <ul className="ip-facts">{facts.map((f) => <li key={f}>{f}</li>)}</ul>}
    </header>
  );
}
