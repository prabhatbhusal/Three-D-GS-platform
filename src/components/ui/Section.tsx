/** A band of a marketing page under its heading: an optional small label,
 *  the h2, an optional line of context, then the content. With `id`, the h2
 *  carries it and names the section for screen readers. Styles: landing.css
 *  .lp-band, .lp-head. */
import type { ReactNode } from 'react';

export function Section({ title, lede, label, id, className, children }: {
  title: ReactNode; lede?: ReactNode; label?: string; id?: string; className?: string; children: ReactNode;
}) {
  return (
    <section className={className ? `lp-band ${className}` : 'lp-band'} aria-labelledby={id}>
      <header className="lp-head">
        {label && <p className="lp-label">{label}</p>}
        <h2 id={id}>{title}</h2>
        {lede && <p>{lede}</p>}
      </header>
      {children}
    </section>
  );
}
