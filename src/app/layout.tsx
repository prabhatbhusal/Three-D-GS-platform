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
// data-theme drives the marketing surfaces' light/dark tokens (site.css).
// The inline script runs while the HTML parses, before the first paint, so a
// visitor who chose light never sees a dark flash; with nothing stored it
// follows the OS. suppressHydrationWarning because the script writes the
// attribute before React hydrates. Key must match lib/theme.ts.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={`${inter.variable} ${display.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("threedview-theme");document.documentElement.dataset.theme=t||(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark")}catch(e){}})()`
          }}
        />
      </head>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
