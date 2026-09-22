/**
 * Live, tunable walker + camera settings — shared mutable state, same pattern as
 * mobileInput.js. The scene manager fills in scale-derived defaults on load;
 * the editor panel's sliders write here; the walker and director read it every
 * frame. Never put this in React state (it changes at slider-drag rates).
 *
 * All distances are in WORLD units (already multiplied by `unitScale`), because
 * the LCC exports are not guaranteed to be 1 unit = 1 metre.
 */
import type { WalkerConfig } from '../@types/config.types';

export const walkerCfg: WalkerConfig = {
  // Visitor-facing modes are 'walk' | 'fly'; 'orbit' survives in the studio
  // only, as an authoring tool (CLAUDE.md §6.1, §10.1). Third-person/avatar
  // mode is removed per CLAUDE.md §6.1 [remove] — there is no character mesh
  // and no camera boom any more.
  mode: 'walk',
  unitScale: 1,      // world units per real metre, from getBounds()

  eyeHeight: 1.65,   // camera height above the floor
  radius: 0.4,       // capsule radius — also how far the camera stays off walls
  speed: 3.2,        // move speed at the "Normal" setting
  speedMul: 1,       // Slow 0.5 / Normal 1 / Fast 2, plus the editor slider

  near: 0.25,        // camera near plane — the single biggest lever on the
                     // near-surface "spike / line" splat artifact
  far: 300,

  // orbit: the studio's Orbit tool and the tour's Orbit / Fly modes
  orbitTarget: [0, 1, 0],
  orbitDist: 4,
  orbitActual: 4,
  flyBoost: 1
};

/** Fly faster (factor > 1) or slower, within 1/8× … 8×. */
export function scaleFlySpeed(factor: number) {
  walkerCfg.flyBoost = Math.min(8, Math.max(0.125, walkerCfg.flyBoost * factor));
}

/** Zoom the orbit by `factor` (<1 = in). In from where the camera really is,
 *  out from where it was asked to be; never closer than the body radius. */
export function zoomOrbit(factor: number) {
  const base = factor < 1 ? Math.min(walkerCfg.orbitDist, walkerCfg.orbitActual || walkerCfg.orbitDist) : walkerCfg.orbitDist;
  walkerCfg.orbitDist = Math.max(walkerCfg.radius * 2, base * factor);
}

/** Reset the scale-derived defaults for a freshly measured scene. */
export function scaleWalkerCfg(unitScale: number) {
  const u = unitScale && isFinite(unitScale) ? unitScale : 1;
  walkerCfg.unitScale = u;
  walkerCfg.eyeHeight = 1.65 * u;
  walkerCfg.radius = 0.4 * u;
  walkerCfg.speed = 3.2 * u;
  // near: ~0.25 m scaled, but never so large it clips the room, never so small
  // the near-plane covariance blows up. Clamp to a sane absolute window too.
  walkerCfg.near = Math.min(Math.max(0.25 * u, 0.02), 0.8);
  walkerCfg.orbitDist = 4 * u;
}
