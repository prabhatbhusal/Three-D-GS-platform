import type { Metadata, Viewport } from 'next';
import { Inter, Instrument_Serif } from 'next/font/google';
import './globals.css';

// Exposed as CSS variables only (no `className` on <body>) so each is opt-in
// per surface. editor.css and site.css map --sans to Inter; the tour's --sans
// stays whatever a client's theme sets. The serif is the marketing site's
// display face only.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const display = Instrument_Serif({
  subsets: ['latin'], weight: '400', style: ['normal', 'italic'],
  variable: '--font-display', display: 'swap'
});

export const metadata: Metadata = {
  title: { default: 'threedview.services', template: '%s — threedview.services' },
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
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
