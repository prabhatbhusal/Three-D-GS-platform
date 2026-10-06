import { Navbar } from '../../features/marketing/layout/Navbar';
import { Loader } from '../../features/marketing/layout/Loader';
import { SmoothScroll } from '../../features/marketing/layout/SmoothScroll';
import { SiteJsonLd } from '../../features/marketing/JsonLd';
import { Cursor } from '../../components/ui/Cursor';
import { ChapterRail } from '../../features/marketing/layout/ChapterRail';
import '../../features/marketing/site.css';
import '../../features/marketing/landing.css';
import '../../features/marketing/inner.css';

// Before the first paint: the loading screen plays once per tab, and never
// with reduced motion (Loader.tsx reads html[data-intro]).
const INTRO = `(function(){var h=document.documentElement;try{h.dataset.intro=sessionStorage.getItem("rcaas-intro")||matchMedia("(prefers-reduced-motion: reduce)").matches?"seen":"playing"}catch(e){h.dataset.intro="seen"}})()`;

/* The marketing pages share one scroll container, one nav, the loading
 * screen and the wheel's glide (SmoothScroll). The nav (Navbar) is here so it survives navigation: its active
 * pill glides from link to link while the page body (SitePage) slides
 * underneath it. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="site lp">
      <script dangerouslySetInnerHTML={{ __html: INTRO }} />
      <Loader />
      <SiteJsonLd />
      <Navbar />
      {children}
      <ChapterRail />
      <Cursor />
      <SmoothScroll />
    </main>
  );
}
