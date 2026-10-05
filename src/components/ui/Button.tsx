/**
 * The marketing site's buttons, one component for both families:
 *   pill, pill-solid          rounded pills on the marketing pages (landing.css .lp-pill)
 *   primary, ghost, quiet     the nav, sign-in and forms (site.css .site-btn)
 * Colours come from the tokens on .site (site.css): pill-solid and primary
 * are filled with --accent-fill and lettered in --accent-ink.
 *
 * With `href` it is a link: next/link for a page of this app (pass
 * transitionTypes={['nav-forward']} to slide like the nav), or a plain <a>
 * with `reload` for a page that needs a full load (the tour and the studio:
 * the 3D renderer is one per page) and for other websites. Without `href`
 * it is a <button>.
 */
import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { withBase } from '../../lib/basePath';

const VARIANT = {
  pill: 'lp-pill',
  'pill-solid': 'lp-pill lp-pill-solid',
  primary: 'site-btn site-btn-primary',
  ghost: 'site-btn site-btn-ghost',
  quiet: 'site-btn site-btn-quiet'
} as const;

type Common = { variant?: keyof typeof VARIANT; large?: boolean; className?: string; children: ReactNode };
type AsLink = Common & { href: string; reload?: boolean; transitionTypes?: string[] };
type AsButton = Common & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };

export function Button(props: AsLink | AsButton) {
  const { variant = 'pill', large, className, children } = props;
  const cls = [VARIANT[variant], large && 'site-btn-lg', className].filter(Boolean).join(' ');
  if (props.href !== undefined) {
    const { href, reload, transitionTypes } = props;
    return reload
      ? <a href={withBase(href)} className={cls}>{children}</a>
      : <Link href={href} transitionTypes={transitionTypes} className={cls}>{children}</Link>;
  }
  // pulled out so they don't reach the DOM (eslint ignoreRestSiblings allows the unused names)
  const { variant: _v, large: _l, className: _c, children: _ch, href: _h, ...rest } = props;
  return <button type="button" {...rest} className={cls}>{children}</button>;
}
