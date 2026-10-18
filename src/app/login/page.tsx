import type { Metadata } from 'next';
import { LoginScreen } from '../../features/marketing/components/LoginScreen';
import '../../features/marketing/rcaas.out.css';
import { NOINDEX } from '../../lib/shareMeta';
import { withBase } from '../../lib/basePath';

export const metadata: Metadata = {
  title: { absolute: 'Sign in | RCAAS Studio' },
  robots: NOINDEX,
  icons: { icon: withBase('/favicon.png'), apple: withBase('/apple-touch-icon.png') }
};

/** Sign in, create an account or reset a password (AuthPanel, unchanged), in
 *  the rcaas.tech look (LoginScreen). Static: AuthPanel reads ?mode=/?next=
 *  itself via useSearchParams() inside LoginScreen's Suspense. */
export default function LoginPage() {
  return <LoginScreen />;
}
