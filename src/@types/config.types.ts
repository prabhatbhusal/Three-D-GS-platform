export type WalkerMode = 'walk' | 'fly' | 'orbit';

/** Live, tunable walker + camera settings — see lib/walkerConfig.js. */
export interface WalkerConfig {
  mode: WalkerMode;
  unitScale: number;
  eyeHeight: number;
  radius: number;
  speed: number;
  speedMul: number;
  near: number;
  far: number;
  orbitTarget: [number, number, number];
  orbitDist: number;
  /** Where the orbit camera actually is after the wall/ceiling check — can be
   *  less than orbitDist. Zooming in starts from here, or it would do nothing
   *  until orbitDist caught up with the wall. */
  orbitActual: number;
  /** Visitor Fly speed multiplier — the scroll wheel and the − + buttons set
   *  it, like an Unreal viewport's camera speed. */
  flyBoost: number;
}

/** Visitor-facing presentation settings — see lib/uiConfig.js. */
export interface UiConfig {
  brand: string;
  showBrand: boolean;
  showLabels: boolean;
  labelAlign: 'left' | 'center' | 'right';
  accent: string;
  background: string;
  /** Visitor's HD toggle: false renders at 1× pixel ratio. Remembered per browser. */
  hd?: boolean;
  /** The project's branding (uiConfig.ts applyTheme): logo URL and heading font. */
  logo?: string | null;
  font?: BrandFont;
}

export type BrandFont = 'serif' | 'sans' | 'classic';
/** A project's branding, as stored on it (server/src/store.js setPropertyTheme). */
export interface ProjectTheme { brand?: string; accent?: string; font?: BrandFont; logo?: string }

export type VisitorMode = 'viewpoints' | 'walk' | 'orbit' | 'fly';

export interface NavModeState {
  walkEnabled: boolean;
  /** Aerial view circling the whole space (the walker's orbit, for visitors). */
  flyEnabled: boolean;
  /** The same orbit at eye level: circling the middle of the room standing up. */
  orbitEnabled: boolean;
}

/** Shared mutable touch-input state — see lib/mobileInput.js. */
export interface TouchState {
  enabled: boolean;
  move: { x: number; y: number };
  look: { dx: number; dy: number };
  jump: boolean;
  run: boolean;
}

export type Tier = 'low' | 'medium' | 'high';

export interface TierProfileEntry {
  useEnv: boolean;
  farPlane: number;
  dpr: number;
}

export interface TierResolution {
  tier: Tier;
  guessed: Tier;
  source: 'no-webgl2' | 'manual' | 'url' | 'measured' | 'guess';
  deviceStorageKey?: string;
}
