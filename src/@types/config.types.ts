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
}

export interface NavModeState {
  walkEnabled: boolean;
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
