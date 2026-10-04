import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { SITE_URL } from '../lib/shareMeta';


const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

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
    <html lang="en" data-theme="dark" suppressHydrationWarning className={inter.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            // "gs": GSAP will animate the marketing pages in (landing.css keeps them hidden until it does)
            __html: `(function(){document.documentElement.classList.add("gs");try{var t=localStorage.getItem("threedview-theme");document.documentElement.dataset.theme=t||(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark")}catch(e){}})()`
          }}
        />
      </head>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
