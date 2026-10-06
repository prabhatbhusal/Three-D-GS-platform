/** Which theme the marketing pages are in (html[data-theme], set before the
 *  first paint by app/layout.tsx and switched by the nav's ThemeToggle), for
 *  what draws its own colours: the pagoda, the method's cloud and its scan-line
 *  edge. `onTheme` calls back now and on every switch; it returns the undo. */
export const isLight = () => document.documentElement.dataset.theme === 'light';

export function onTheme(fn: (light: boolean) => void) {
  fn(isLight());
  const mo = new MutationObserver(() => fn(isLight()));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
}

/** A CSS custom property's value on an element (e.g. a section's --mm-ink), trimmed. */
export const cssVar = (el: Element, name: string, fallback: string) =>
  getComputedStyle(el).getPropertyValue(name).trim() || fallback;
