import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { API_BASE_URL, type GalleryItem } from '../../../lib/api';
import { EnquiryPanel } from '../../../components/EnquiryPanel';
import type { BrandFont, ProjectTheme } from '../../../@types/config.types';
import '../../../components/viewer.css';
import './hub.css';

/**
 * A project's own page (2026-09-25): /t/<project>. The page a hotel links
 * from its website — its name, logo and colour, every published space as a
 * card that walks into the tour, and the enquiry form. Server-rendered, so
 * it's fast and indexable, and it works with no 3D at all (the tour only
 * loads when a visitor picks a space). Rendered per request so a publish or
 * a branding change shows at once; the static export build has no requests
 * to render, so it prerenders the projects it can see at build time.
 */
const isStaticExport = !!process.env.NEXT_OUTPUT_EXPORT;

const FACES: Record<BrandFont, string> = {
  serif: "'Georgia', 'Times New Roman', serif",
  sans: "system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  classic: "'Palatino Linotype', 'Book Antiqua', Palatino, 'Times New Roman', serif"
};

type Hub = { title: string; theme: ProjectTheme; spaces: GalleryItem[] };

async function load(id: string): Promise<Hub | null> {
  const opts = { cache: isStaticExport ? 'force-cache' : 'no-store' } as const;
  try {
    const t = await fetch(`${API_BASE_URL}/api/properties/${encodeURIComponent(id)}/theme`, opts);
    if (!t.ok) return null;
    const { title, theme } = await t.json();
    const g = await fetch(`${API_BASE_URL}/api/gallery?property=${encodeURIComponent(id)}`, opts);
    return { title, theme: theme ?? {}, spaces: g.ok ? await g.json() : [] };
  } catch {
    return null;
  }
}

export async function generateStaticParams() {
  if (!isStaticExport) return [];
  try {
    const all: (GalleryItem & { propertyId?: string | null })[] = await (await fetch(`${API_BASE_URL}/api/gallery`)).json();
    return [...new Set(all.map((g) => g.propertyId).filter(Boolean))].map((property) => ({ property: property as string }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ property: string }> }): Promise<Metadata> {
  const { property } = await params;
  const hub = await load(property);
  if (!hub) return { title: 'Not found' };
  const name = hub.theme.brand || hub.title;
  return {
    title: { absolute: `${name} — virtual tour` },
    description: `Walk ${name} in 3D: ${hub.spaces.map((s) => s.title).join(', ')}. Send an enquiry from inside the room.`
  };
}

export default async function HubPage({ params }: { params: Promise<{ property: string }> }) {
  if (!isStaticExport) await connection();
  const { property } = await params;
  const hub = await load(property);
  if (!hub) notFound();

  const name = hub.theme.brand || hub.title;
  const accent = hub.theme.accent || '#b08d57';
  const logo = hub.theme.logo ? `${API_BASE_URL}/api/assets/${hub.theme.logo}` : null;
  const [first, ...rest] = hub.spaces;
  // A plain <a>: the tour holds a page-singleton renderer and wants a full load.
  const walk = (id: string) => `/t/${encodeURIComponent(property)}/${encodeURIComponent(id)}`;

  return (
    <div className="hub" style={{ '--gold': accent, '--serif': FACES[hub.theme.font || 'serif'] } as React.CSSProperties}>
      <header className="hub-top">
        <span className="hub-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo && <img src={logo} alt="" />}
          <span>{name}</span>
        </span>
        {first && <a className="hub-btn" href={walk(first.id)}>Take the virtual tour</a>}
      </header>

      <section className="hub-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {first?.thumb && <img className="hub-hero-img" src={first.thumb} alt="" />}
        <div className="hub-hero-shade" aria-hidden />
        <div className="hub-hero-text">
          <p className="hub-kicker">Virtual tour</p>
          <h1>{name}</h1>
          <p className="hub-lede">
            {hub.spaces.length
              ? `Walk ${hub.spaces.length === 1 ? 'the space' : `all ${hub.spaces.length} spaces`} in 3D, from any phone. Ask a question from inside the room.`
              : 'The tour is being prepared. Ask us anything in the meantime.'}
          </p>
          {first && <a className="hub-btn hub-btn-big" href={walk(first.id)}>Start with {first.title}</a>}
        </div>
      </section>

      {hub.spaces.length > 0 && (
        <section className="hub-spaces" aria-label="Spaces">
          <h2>Step inside</h2>
          <ul>
            {[first, ...rest].map((s) => (
              <li key={s.id}>
                <a href={walk(s.id)} className="hub-card">
                  <span className="hub-card-img">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {s.thumb ? <img src={s.thumb} alt="" loading="lazy" /> : <span aria-hidden>{s.title.trim()[0]}</span>}
                  </span>
                  <span className="hub-card-txt">
                    <span className="hub-card-title">{s.title}</span>
                    {s.tagline && <span className="hub-card-tag">{s.tagline}</span>}
                    <span className="hub-card-go">Walk in</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="hub-foot">
        <span>Virtual tour by <Link href="/">RCAAS.tech</Link></span>
      </footer>

      {/* the enquiry form, working with no 3D on the page at all */}
      <EnquiryPanel sceneId="hub" sceneName={`${name} (project page)`} propertyId={property} label={`Ask ${name}`} />
    </div>
  );
}
