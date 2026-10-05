/** The marketing site's display face: Geist Mono, a monospace that reads like
 *  measurement, for headlines, numbers, the nav and the footer. Body text stays
 *  in Inter (app/layout.tsx). Set as --font-display-mono on .site by
 *  app/(site)/layout.tsx, so every marketing page can use it. */
import { Geist_Mono, JetBrains_Mono } from 'next/font/google';

export const displayMono = Geist_Mono({ subsets: ['latin'], variable: '--font-display-mono', display: 'swap' });

/** The navbar's face (2026-10-05): JetBrains Mono, small and tracked. */

export const navMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-nav-mono', display: 'swap' });
