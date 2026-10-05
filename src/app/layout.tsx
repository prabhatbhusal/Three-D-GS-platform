import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { SITE_URL } from '../lib/shareMeta';


// The one typeface everywhere (2026-10-05, the owner's choice): JetBrains Mono, as --font-ui.
const ui = JetBrains_Mono({ subsets: ['latin'], weight: 'variable', variable: '--font-ui', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'RCAAS.tech', template: '%s — RCAAS.tech' },
  description: 'Walkable 3D virtual tours of hotels, restaurants, venues, colleges and heritage sites, captured with LiDAR in Nepal, with enquiry and booking forms inside the tour.',
  applicationName: 'RCAAS.tech',
  openGraph: { siteName: 'RCAAS.tech', type: 'website', locale: 'en_US' },
  twitter: { card: 'summary_large_image' },
  icons: { icon: '/favicon.svg' }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={ui.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            // "gs": GSAP will animate the marketing pages in (landing.css keeps them hidden until it does).
            // The theme: dark everywhere (2026-10-05, the site has no theme switch any more), except
            // the studio, which keeps its own switch and the choice stored by it.
            __html: `(function(){document.documentElement.classList.add("gs");try{var t=localStorage.getItem("threedview-theme");document.documentElement.dataset.theme=location.pathname.indexOf("/studio")===0?(t||(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark")):"dark"}catch(e){}})()`
          }}
        />
      </head>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
