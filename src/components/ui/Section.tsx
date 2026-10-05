/** A part of an inner marketing page under its heading: the h2 (its lines
 *  rise in as it scrolls into view), an optional line of context, then the
 *  content. With `id`, the h2 carries it and names the section for screen
 *  readers. Styles: inner.css .ip-sec. */
import type { ReactNode } from 'react';

export function Section({ title, lede, id, className, children }: {
  title: ReactNode; lede?: ReactNode; id?: string; className?: string; children: ReactNode;
}) {
  return (
    <section className={className ? `ip-sec ${className}` : 'ip-sec'} aria-labelledby={id}>
      <header className="ip-sec-head">
        <h2 id={id} data-lines>{title}</h2>
        {lede && <p data-reveal>{lede}</p>}
      </header>
      {children}
    </section>
  );
}
