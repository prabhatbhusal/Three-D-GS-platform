import type { Metadata } from 'next';
import { comfortaa } from '../../features/marketing/font';
import { withBase } from '../../lib/basePath';
import '../../features/marketing/rcaas.out.css';

// The rcaas.tech pages (src/features/marketing, from github.com/meshuman/rcaas).

export const metadata: Metadata = {
  icons: { icon: withBase('/favicon.png'), apple: withBase('/apple-touch-icon.png') }
};

/* .rcaas scopes their CSS (rcaas.css), so none of it reaches the studio. */
export default function RcaasLayout({ children }: { children: React.ReactNode }) {
  return <div className={`rcaas ${comfortaa.variable}`}>{children}</div>;
}
