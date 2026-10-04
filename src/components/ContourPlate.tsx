/**
 * Topographic contour lines around a survey benchmark: the line work of the
 * Contact and About pages (landing.css .lp-contour). Drawn here, at build time,
 * from a fixed seed, so it's the same plate on every visit and no script runs
 * for it. The lines draw themselves in once (CSS), unless motion is reduced.
 */

const RINGS = 9;
const STEPS = 72;

/** A smooth closed loop: a circle pushed in and out by three slow waves. */
function ring(i: number, seed: number) {
  const r0 = 34 + i * 27;
  const pts: string[] = [];
  for (let s = 0; s <= STEPS; s++) {
    const a = (s / STEPS) * Math.PI * 2;
    const r = r0
      + Math.sin(a * 2 + seed + i * 0.35) * (6 + i * 1.8)
      + Math.sin(a * 3 - seed * 0.7 + i * 0.2) * (4 + i * 1.1)
      + Math.cos(a * 5 + seed * 1.3) * (2 + i * 0.4);
    pts.push(`${(300 + Math.cos(a) * r * 1.18).toFixed(1)},${(260 + Math.sin(a) * r).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** `side`: the contours sit at the plate's right end, with the text on the left. */
export function ContourPlate({ seed = 1.7, side = false, children }: { seed?: number; side?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`lp-contour${side ? ' is-side' : ''}`}>
      <svg viewBox="0 0 600 520" preserveAspectRatio={side ? 'xMaxYMid meet' : 'xMidYMid slice'} aria-hidden focusable="false">
        {Array.from({ length: RINGS }, (_, i) => (
          <path key={i} d={ring(i, seed)} pathLength={1} className={i % 4 === 3 ? 'is-index' : undefined}
            style={{ animationDelay: `${0.15 + (RINGS - i) * 0.09}s` }} />
        ))}
        {/* the benchmark: a surveyed point, marked as on a map */}
        <g className="lp-contour-mark" transform="translate(300 260)">
          <path d="M0 -11 L10 7 L-10 7 Z" />
          <circle r="2.2" cy="1.5" />
        </g>
      </svg>
      {children && <div className="lp-contour-text">{children}</div>}
    </div>
  );
}
