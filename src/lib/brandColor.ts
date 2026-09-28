/**
 * Brand colour helpers (2026-09-28): read a logo's colours so the brand
 * colour can be suggested from it, and pick readable text for any colour a
 * button is filled with.
 */

type RGB = [number, number, number];

const hex = (c: RGB) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
export const toRgb = (h: string): RGB => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = m ? parseInt(m[1], 16) : 0xb08d57;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance([r, g, b]: RGB) {
  const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const DARK_INK = '#14110e';
/** The text colour to put on a button filled with `fill`: near-black or
 *  white, whichever contrasts more (a navy logo colour gets white text, a
 *  yellow one dark text). */
export function inkOn(fill: string): string {
  const L = luminance(toRgb(fill));
  const onWhite = 1.05 / (L + 0.05);
  const onDark = (L + 0.05) / (luminance(toRgb(DARK_INK)) + 0.05);
  return onWhite > onDark ? '#ffffff' : DARK_INK;
}

export interface Palette {
  /** The colour to suggest as the brand colour; null for a black-and-white logo. */
  accent: string | null;
  /** Its main colours, most brand-like first (vivid ones, then dark neutrals). */
  colours: string[];
}

/**
 * A logo's colours from its pixels (RGBA, 4 numbers each). Transparent and
 * near-white pixels are the background; similar shades are grouped; a group
 * must cover at least 1.5% of the logo, so anti-aliased edges don't count.
 * Vivid colours rank by how much of the logo they cover and how vivid they
 * are; black, greys and white never become the suggestion.
 */
export function paletteFromPixels(px: ArrayLike<number>, max = 5): Palette {
  const buckets = new Map<number, [number, number, number, number]>();
  let opaque = 0;
  for (let i = 0; i + 3 < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    opaque += 1;
    const key = ((px[i] >> 3) << 10) | ((px[i + 1] >> 3) << 5) | (px[i + 2] >> 3);
    const b = buckets.get(key) ?? [0, 0, 0, 0];
    b[0] += 1; b[1] += px[i]; b[2] += px[i + 1]; b[3] += px[i + 2];
    buckets.set(key, b);
  }
  if (!opaque) return { accent: null, colours: [] };

  const found = [...buckets.values()].map(([n, r, g, b]) => {
    const rgb: RGB = [r / n, g / n, b / n];
    const hi = Math.max(...rgb), lo = Math.min(...rgb);
    return { rgb, n, chroma: (hi - lo) / 255, light: (hi + lo) / 510 };
  });
  const isWhite = (c: { chroma: number; light: number }) => c.light > 0.9 && c.chroma < 0.14;
  const vivid = found.filter((c) => c.chroma >= 0.16 && c.light >= 0.12 && c.light <= 0.9);
  const neutral = found.filter((c) => !vivid.includes(c) && !isWhite(c));

  // Group shades within reach of a stronger one; keep groups that matter.
  const group = (list: typeof found, score: (c: (typeof found)[number]) => number) => {
    const groups: { rgb: RGB; n: number; score: number }[] = [];
    for (const c of [...list].sort((a, b) => score(b) - score(a))) {
      const near = groups.find((g) => Math.hypot(g.rgb[0] - c.rgb[0], g.rgb[1] - c.rgb[1], g.rgb[2] - c.rgb[2]) < 60);
      if (near) { near.n += c.n; near.score += score(c); } else groups.push({ rgb: c.rgb, n: c.n, score: score(c) });
    }
    return groups.filter((g) => g.n / opaque >= 0.015).sort((a, b) => b.score - a.score);
  };
  const colourful = group(vivid, (c) => c.n * (0.4 + c.chroma));
  const plain = group(neutral, (c) => c.n);
  const colours = [...colourful, ...plain].slice(0, max).map((g) => hex(g.rgb));
  return { accent: colourful[0] ? hex(colourful[0].rgb) : null, colours };
}

/** The same, from an image file or blob (in the browser). Shrunk to 128 px
 *  first: plenty to find a logo's colours, and quick. */
export async function paletteFromImage(img: Blob): Promise<Palette> {
  const bmp = await createImageBitmap(img);
  const scale = Math.min(1, 128 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) { bmp.close(); return { accent: null, colours: [] }; }
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return paletteFromPixels(ctx.getImageData(0, 0, w, h).data);
}
