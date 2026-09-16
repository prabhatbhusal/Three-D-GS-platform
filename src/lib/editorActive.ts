/**
 * Editor vs. viewer. The editor is its own screen; from inside it, ▶ Preview
 * renders the real viewer.
 *
 *   npm run dev            -> editor (fast iteration)
 *   deployed / any build   -> viewer; add ?edit to reach the editor
 */
export function editorActive() {
  if (typeof location === 'undefined') return false;
  if (new URLSearchParams(location.search).has('view')) return false; // force viewer in dev
  return process.env.NODE_ENV !== 'production' || new URLSearchParams(location.search).has('edit');
}
