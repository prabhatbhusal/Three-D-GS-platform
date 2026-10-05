/** The site's sub-path when it isn't served from the domain's root (GitHub
 *  Pages serves this repo under /Three-D-GS-platform), from
 *  NEXT_PUBLIC_BASE_PATH, the same value next.config.mts gives `basePath`.
 *  Next adds it to <Link> and its own files by itself; anything else that
 *  names a path on this site (a plain <a>, an image's src, a fetch) goes
 *  through withBase. Empty on a normal deploy, so it changes nothing there. */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/\/$/, '');

export const withBase = (path: string) => (path.startsWith('/') && !path.startsWith('//') ? BASE_PATH + path : path);
