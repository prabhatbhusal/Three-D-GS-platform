import { Navbar } from '../../features/marketing/layout/Navbar';
import { SiteJsonLd } from '../../features/marketing/JsonLd';
import { Cursor } from '../../components/ui/Cursor';
import { displayMono, navMono } from '../../features/marketing/fonts';
import '../../features/marketing/site.css';
import '../../features/marketing/landing.css';

/* The marketing pages share one scroll container and one nav. The nav (Navbar) is here
 * so it survives navigation: its active pill glides from link to link while
 * the page body (SitePage) slides underneath it. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className={`site lp ${displayMono.variable} ${navMono.variable}`}>
      <SiteJsonLd />
      <Navbar />
      {children}
      <Cursor />
    </main>
  );
}
