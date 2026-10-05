/**
 * Editor vs. viewer, decided by route: /studio is the editor, everything else
 * (today: /tour) is the visitor viewer. `?view` still forces the viewer, and
 * from inside the studio ▶ Preview renders the real viewer anyway.
 */
export function editorActive() {
  if (typeof location === 'undefined') return false;
  if (new URLSearchParams(location.search).has('view')) return false;
  return location.pathname.startsWith('/studio');
}
