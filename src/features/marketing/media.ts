/* Marketing footage, by slot name, from public/media/ (list: public/media/README.md).
 * Server-only (reads the disk): a slot shows only if its file is there, so a
 * page never points at footage that hasn't been delivered yet; without it the
 * page keeps its plain design. Pages are prerendered, so new files need a
 * rebuild (or a dev server) to appear. */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

export type Media = { video?: string; image?: string };

const DIR = path.join(process.cwd(), 'public', 'media');
const URL_BASE = `${process.env.NEXT_PUBLIC_BASE_PATH || ''}/media/`;

const find = (name: string, exts: string[]) => {
  const ext = exts.find((e) => existsSync(path.join(DIR, name + e)));
  return ext ? URL_BASE + name + ext : undefined;
};

/** `name.mp4` plays over `name.jpg|webp|png`, which is also its poster. */
export function media(name: string): Media | null {
  const m = { video: find(name, ['.mp4']), image: find(name, ['.jpg', '.webp', '.png']) };
  return m.video || m.image ? m : null;
}

/** An image sequence: every jpg/webp in public/media/<dir>/, in name order. */
export function frames(dir: string): string[] {
  try {
    return readdirSync(path.join(DIR, dir))
      .filter((f) => /\.(jpe?g|webp)$/i.test(f))
      .sort()
      .map((f) => `${URL_BASE}${dir}/${f}`);
  } catch {
    return [];
  }
}
