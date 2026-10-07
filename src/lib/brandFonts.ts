/* A project's heading font (theme.font): the one list the studio's pickers,
 * the tour (uiConfig) and the client website (SiteView) read. The ten are
 * served from this site by next/font (no request to Google from a visitor's
 * browser), without preloading, so a page downloads only the face it uses.
 * serif/sans/classic are the system faces older projects chose; they still
 * render, and the pickers show them only to a project that has one. */
import { DM_Sans, Inter, Lato, Merriweather, Montserrat, Nunito, Open_Sans, Playfair_Display, Poppins, Roboto } from 'next/font/google';
import type { BrandFont } from '../@types/config.types';

// next/font wants every option written out in each call (no shared object)
const inter = Inter({ subsets: ['latin'], display: 'swap', preload: false });
const roboto = Roboto({ subsets: ['latin'], display: 'swap', preload: false });
const openSans = Open_Sans({ subsets: ['latin'], display: 'swap', preload: false });
const poppins = Poppins({ subsets: ['latin'], display: 'swap', preload: false, weight: ['400', '500', '600', '700'] });
const montserrat = Montserrat({ subsets: ['latin'], display: 'swap', preload: false });
const lato = Lato({ subsets: ['latin'], display: 'swap', preload: false, weight: ['400', '700'] });
const nunito = Nunito({ subsets: ['latin'], display: 'swap', preload: false });
const playfair = Playfair_Display({ subsets: ['latin'], display: 'swap', preload: false });
const merriweather = Merriweather({ subsets: ['latin'], display: 'swap', preload: false });
const dmSans = DM_Sans({ subsets: ['latin'], display: 'swap', preload: false });

const SANS = "system-ui, 'Segoe UI', Roboto, sans-serif";
const SERIF = "Georgia, 'Times New Roman', serif";

/** Each font: its name in the pickers and its CSS font-family. In picker order. */
export const BRAND_FONTS: Record<BrandFont, [string, string]> = {
  inter: ['Inter', `${inter.style.fontFamily}, ${SANS}`],
  roboto: ['Roboto', `${roboto.style.fontFamily}, ${SANS}`],
  'open-sans': ['Open Sans', `${openSans.style.fontFamily}, ${SANS}`],
  poppins: ['Poppins', `${poppins.style.fontFamily}, ${SANS}`],
  montserrat: ['Montserrat', `${montserrat.style.fontFamily}, ${SANS}`],
  lato: ['Lato', `${lato.style.fontFamily}, ${SANS}`],
  nunito: ['Nunito', `${nunito.style.fontFamily}, ${SANS}`],
  playfair: ['Playfair Display', `${playfair.style.fontFamily}, ${SERIF}`],
  merriweather: ['Merriweather', `${merriweather.style.fontFamily}, ${SERIF}`],
  'dm-sans': ['DM Sans', `${dmSans.style.fontFamily}, ${SANS}`],
  // older projects' system faces
  serif: ['Georgia (system serif)', "'Georgia', 'Times New Roman', serif"],
  sans: ['System sans', SANS],
  classic: ['Palatino (system classic)', "'Palatino Linotype', 'Book Antiqua', Palatino, 'Times New Roman', serif"]
};

const LEGACY: BrandFont[] = ['serif', 'sans', 'classic'];

/** The fonts a picker offers: the ten, plus the project's own older one if it has one. */
export const fontChoices = (current?: BrandFont): BrandFont[] =>
  (Object.keys(BRAND_FONTS) as BrandFont[]).filter((f) => !LEGACY.includes(f) || f === current);

/** A font key's CSS font-family (an unknown key gets the serif). */
export const fontFamily = (f: BrandFont | undefined) => BRAND_FONTS[f ?? 'serif']?.[1] ?? BRAND_FONTS.serif[1];
