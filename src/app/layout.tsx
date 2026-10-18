import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { SITE_URL } from '../lib/shareMeta';
import { BASE_PATH, withBase } from '../lib/basePath';


// The one typeface everywhere (2026-10-05, the owner's choice): JetBrains Mono, as --font-ui.
const ui = JetBrains_Mono({ subsets: ['latin'], weight: 'variable', variable: '--font-ui', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'RCAAS.tech | 3D Gaussian splat tours in Nepal', template: '%s | RCAAS.tech' },
  keywords: ['Gaussian splatting', '3D Gaussian splat tour', 'LiDAR scanning Nepal', 'virtual tour', 'hotel virtual tour', 'reality capture', 'XGRIDS', 'point cloud', 'heritage documentation', 'Kathmandu'],
  authors: [{ name: 'RCAAS.tech' }],
  creator: 'RCAAS.tech',
  category: 'technology',
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 } },
  description: 'Walkable 3D virtual tours of hotels, restaurants, venues, colleges and heritage sites, captured with LiDAR in Nepal, with enquiry and booking forms inside the tour.',
  applicationName: 'RCAAS.tech',
  openGraph: { siteName: 'RCAAS.tech', type: 'website', locale: 'en_US', images: [{ url: withBase('/og.jpg'), width: 1200, height: 630, alt: 'RCAAS.tech: a stupa drawn as a point cloud' }] },
  twitter: { card: 'summary_large_image', images: [withBase('/og.jpg')] },
  icons: { icon: withBase('/favicon.svg') }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning className={ui.variable}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            // "gs": GSAP will animate the marketing pages in (landing.css keeps them hidden until it does).
            // The theme (2026-10-06): the marketing pages open light unless the visitor chose dark
            // (the switch in the nav, stored); the studio follows the stored choice, else the OS;
            // the tour and clients' websites (/tour, /t/, /s/) have their own looks and stay dark.
            __html: `(function(){var d=document.documentElement;d.classList.add("gs");var p=location.pathname,t=null;try{t=localStorage.getItem("threedview-theme")}catch(e){}d.dataset.theme=p.indexOf("/studio")===0?(t||(matchMedia("(prefers-color-scheme: light)").matches?"light":"dark")):["tour","t","s"].indexOf(p.split("/")[1])>=0?"dark":(t||"light")})()`
          }}
        />
        {BASE_PATH && (
          <script
            dangerouslySetInnerHTML={{
              // ponytail: the sub-path copy (GitHub Pages) puts its base on a site link as it is
              // clicked, opened in a new tab or right-clicked, instead of withBase on ~80 hrefs in
              // the marketing pages. Links those pages handle themselves still go through navigateTo.
              __html: `(function(b){function f(e){var a=e.target&&e.target.closest&&e.target.closest('a[href^="/"]'),h=a&&a.getAttribute("href");if(h&&h[1]!=="/"&&h!==b&&h.indexOf(b+"/")!==0)a.setAttribute("href",b+h)}["click","auxclick","contextmenu"].forEach(function(n){addEventListener(n,f,true)})})(${JSON.stringify(BASE_PATH)})`
            }}
          />
        )}
      </head>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
