'use client';

import { applyTheme } from '../lib/theme';

// One switch for both surfaces. `<html data-theme>` is the source of truth —
// site.css and editor.css each flip their own tokens off it, so this button
// knows nothing about either. Stateless on purpose: the sun/moon swap is CSS
// (globals.css), so there is no state to hydrate and nothing to keep in step
// with the inline script in layout.tsx.
export function ThemeToggle({ className = 'site-theme-toggle' }: { className?: string }) {
  const toggle = () =>
    applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');

  return (
    <button type="button" className={className} onClick={toggle} title="Switch theme" aria-label="Switch theme">
      <svg className="ic-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
      </svg>
      <svg className="ic-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
        <path d="M20 14.2A8.4 8.4 0 0 1 9.8 4a8.4 8.4 0 1 0 10.2 10.2z" />
      </svg>
    </button>
  );
}
