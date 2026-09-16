import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// Exposed as --font-inter only (no `inter.className` on <body>) so this is
// opt-in per surface. editor.css redefines --sans to it for the studio only
// (CLAUDE.md §10.1); the tour's --sans stays whatever a client's theme sets.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'The Xgrids Hotel — Virtual Tour',
  icons: { icon: '/favicon.svg' }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1
};

// No <StrictMode> equivalent to worry about here — that guard lives in
// next.config.ts (reactStrictMode: false), for the same LCCRender-singleton
// reason main.jsx used to call out.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
