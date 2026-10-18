import React from 'react';
import { RoutePath } from '../types';
import { SITE_METADATA } from '../data/siteData';
import { BLOG_LAUNCHED } from '../content/blog';
import { withBase } from '../../../lib/basePath';

interface FooterProps {
  onNavigate: (path: RoutePath) => void;
  onOpenRegister: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenRegister }) => {
  return (
    <footer className="border-t border-line bg-surface text-muted">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        
        {/* Main 5-Column Grid */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-5">
          
          {/* Brand Col */}
          <div className="col-span-2 lg:col-span-2">
            <button
              onClick={() => onNavigate('/')}
              className="flex items-center py-1 text-left"
              aria-label="RCAAS Technology, home"
            >
              <img src={withBase('/logo.png')} alt="" width="522" height="106" loading="lazy" decoding="async" className="h-8 w-auto" />
            </button>
            <p className="mt-4 max-w-sm text-xs leading-relaxed text-zinc-600">
              {SITE_METADATA.boilerplate}
            </p>
            {/* Phone and email show only once confirmed (SITE_METADATA.contactConfirmed); until then, the contact page. */}
            <div className="mt-5 flex items-center gap-3 text-xs font-mono text-zinc-500">
              <span>{SITE_METADATA.location}</span>
              {SITE_METADATA.contactConfirmed && (
                <>
                  <span>·</span>
                  <span>{SITE_METADATA.phone}</span>
                </>
              )}
            </div>
            <div className="mt-1.5 text-xs font-mono">
              {SITE_METADATA.contactConfirmed ? (
                <a href={`mailto:${SITE_METADATA.email}`} className="inline-block py-2.5 text-zinc-700 hover:text-accent transition-colors">
                  {SITE_METADATA.email}
                </a>
              ) : (
                <button
                  onClick={() => onNavigate('/contact/')}
                  className="inline-block py-2.5 text-zinc-700 hover:text-accent transition-colors"
                >
                  Get in touch &rarr;
                </button>
              )}
            </div>
          </div>

          {/* What we create */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink font-mono">
              What we create
            </h4>
            <ul className="mt-3 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('/services/immersive-experiences/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Immersive Experiences
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/services/immersive-experiences/3d-virtual-tours/')}
                  className="text-zinc-500 hover:text-ink text-left transition-colors pl-2 border-l border-line block py-2.5"
                >
                  3D Virtual Tours
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/services/visual-storytelling/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Visual Storytelling
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/services/digital-twins/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Digital Twins &amp; Survey
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/services/digital-twins/3d-laser-scanning/')}
                  className="text-zinc-500 hover:text-ink text-left transition-colors pl-2 border-l border-line block py-2.5"
                >
                  3D Laser Scanning
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/services/digital-twins/drone-mapping/')}
                  className="text-zinc-500 hover:text-ink text-left transition-colors pl-2 border-l border-line block py-2.5"
                >
                  Drone Mapping
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/services/game-worlds-assets/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Game Worlds &amp; Assets
                </button>
              </li>
            </ul>
          </div>

          {/* Industries */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink font-mono">
              Industries
            </h4>
            <ul className="mt-3 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('/industries/hospitality-tourism/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Hotels &amp; Tourism
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/industries/education/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Education &amp; Campuses
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/industries/real-estate-architecture/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Real Estate &amp; Architecture
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/industries/factories/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Factories
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/industries/heritage-culture/')}
                  className="text-accent font-medium hover:underline text-left transition-colors block py-2.5"
                >
                  Heritage &amp; Culture
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/industries/government-municipalities/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Government &amp; Municipalities
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/industries/non-life-insurance/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Non-life Insurance
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/industries/gaming/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Gaming
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/industries/filmmaking/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Filmmaking
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/industries/nonprofit-international-development/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Nonprofit & Development
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/industries/banking-financial-institutions/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Banks & Financial Institutions
                </button>
              </li>
            </ul>
          </div>

          {/* Company & Knowledge */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink font-mono">
              Company &amp; Know-how
            </h4>
            <ul className="mt-3 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('/about/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  About RCAAS
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/how-we-work/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  How We Work
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/work/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Case Studies &amp; Projects
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/gallery/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Live 3D Tours
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/platform/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Cloud 3D Platform
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/learn/')}
                  className="hover:text-ink text-left transition-colors block py-2.5"
                >
                  Guides &amp; Articles
                </button>
              </li>
              {BLOG_LAUNCHED && (
                <li>
                  <button
                    onClick={() => onNavigate('/blog/')}
                    className="hover:text-ink text-left transition-colors block py-2.5"
                  >
                    Blog
                  </button>
                </li>
              )}
              <li>
                <button
                  onClick={() => onNavigate('/faq/')}
                  className="hover:text-ink text-left transition-colors block min-w-11 py-2.5"
                >
                  FAQ
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('/contact/')}
                  className="text-accent font-medium hover:underline text-left transition-colors block py-2.5"
                >
                  Contact &amp; Enquiry
                </button>
              </li>
              <li>
                {/* plain <a>: the studio is its own app and needs a full page load */}
                <a href="/login" className="hover:text-ink text-left transition-colors block py-2.5">
                  Studio sign in
                </a>
              </li>
            </ul>
          </div>

        </div>

        {/* Lower Legal Bar & Auditor Trigger */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-line pt-8 text-xs font-mono text-zinc-500">
          <div>
            &copy; {new Date().getFullYear()} {SITE_METADATA.legalName.replace(/\.$/, '')}. All rights reserved. Registered in Kathmandu, Nepal.
          </div>
          
          <div className="flex flex-wrap items-center justify-center gap-x-4">
            <button
              onClick={() => onNavigate('/privacy/')}
              className="hover:text-ink transition-colors py-2.5 px-1"
            >
              Privacy
            </button>
            <span>·</span>
            <button
              onClick={() => onNavigate('/terms/')}
              className="hover:text-ink transition-colors py-2.5 px-1"
            >
              Terms
            </button>
            <span>·</span>
            <button
              onClick={() => onNavigate('/cookies/')}
              className="hover:text-ink transition-colors py-2.5 px-1"
            >
              Cookies
            </button>
            <span>·</span>
            <button
              onClick={() => onNavigate('/security/')}
              className="hover:text-ink transition-colors py-2.5 px-1"
            >
              Security
            </button>
            {/* Placeholder register (§13): a review tool, shown only in local development. */}
            {process.env.NODE_ENV !== 'production' && <span>·</span>}
            {process.env.NODE_ENV !== 'production' && (
            <button
              onClick={onOpenRegister}
              className="inline-flex items-center gap-1.5 rounded border border-line bg-white px-2 py-1 text-[11px] text-zinc-600 hover:border-zinc-400 hover:text-zinc-950 transition-colors"
              title="Inspect Section 13 Placeholder & Simulation Register"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent"></span>
              <span>Audit Register (§13)</span>
            </button>
            )}
          </div>
        </div>

      </div>
    </footer>
  );
};
