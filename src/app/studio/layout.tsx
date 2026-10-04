import type { Metadata } from 'next';
import { NOINDEX } from '../../lib/shareMeta';

/** The studio is for signed-in teams: keep every page of it out of search. */
export const metadata: Metadata = { robots: NOINDEX };

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return children;
}
