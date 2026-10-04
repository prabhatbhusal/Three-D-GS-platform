import type { Metadata } from 'next';
import { NOINDEX } from '../../../../lib/shareMeta';

/** A client's private review link for an unpublished draft: never in search. */
export const metadata: Metadata = { title: 'Website review', robots: NOINDEX };

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
