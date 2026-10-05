/** The marketing site's display face: Geist Mono, a monospace that reads like
 *  measurement, for headlines, numbers, the nav and the footer. Body text stays
 *  in Inter (app/layout.tsx). Set as --font-display-mono on .site by
 *  app/(site)/layout.tsx, so every marketing page can use it. */
import { Geist_Mono } from 'next/font/google';

export const displayMono = Geist_Mono({ subsets: ['latin'], variable: '--font-display-mono', display: 'swap' });
