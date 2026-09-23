import { SiteNav } from '../../components/SiteNav';
import '../../components/site.css';
import '../../components/landing.css';

/* The marketing pages share one scroll container and one nav. The nav is here
 * so it survives navigation: its active pill glides from link to link while
 * the page body (SitePage) slides underneath it. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="site lp">
      <SiteNav />
      {children}
    </main>
  );
}
