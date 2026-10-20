import { DEFAULT_POST, NEUTRAL_RAMP, type PostParams, type Ramp } from './params';
import type { Modulator } from './modulators';
import { createPRNG } from '../visual/prng';

export interface PostPreset {
  readonly name: PresetName;
  readonly params: PostParams;
  readonly ramp: Ramp;
  readonly modulators: readonly Modulator[];
}

export type PresetName = 'clean' | 'phosphor' | 'amber' | 'vhs' | 'crt' | 'acid';

const PHOSPHOR_GREEN: Ramp = [[0, 0.01, 0], [0.02, 0.28, 0.08], [0.2, 0.85, 0.35], [0.8, 1, 0.85]];
const PHOSPHOR_AMBER: Ramp = [[0.01, 0, 0], [0.32, 0.14, 0.01], [0.95, 0.55, 0.08], [1, 0.92, 0.7]];
const WARM_CRT: Ramp = [[0, 0, 0.02], [0.3, 0.26, 0.32], [0.7, 0.62, 0.6], [1, 0.97, 0.9]];

const COMMON_MODULATORS: readonly Modulator[] = [
  { param: 'bloomNear', source: 'bass', amount: 0.5, curve: 1.3 },
  { param: 'rgbShift', source: 'treble', amount: 0.0025, curve: 1.6 },
  { param: 'feedbackDamp', source: 'beat', amount: -0.04 },
];

function params(overrides: Partial<PostParams>): PostParams {
  return { ...DEFAULT_POST, ...overrides };
}

export const PRESETS: Record<PresetName, PostPreset> = {
  clean: {
    name: 'clean',
    ramp: NEUTRAL_RAMP,
    params: params({ feedbackDamp: 0.8, bloomNear: 0.7, bloomFar: 0.45, grain: 0, vignette: 0.12, rgbShift: 0.001 }),
    modulators: [
      { param: 'bloomNear', source: 'bass', amount: 0.4, curve: 1.3 },
      { param: 'feedbackDamp', source: 'beat', amount: -0.04 },
    ],
  },
  phosphor: {
    name: 'phosphor',
    ramp: PHOSPHOR_GREEN,
    params: params({
      feedbackDamp: 0.86, feedbackZoom: 0.003, bloomNear: 1.0, bloomFar: 0.7, bloomThreshold: 0.4,
      barrel: 0, bleed: 0.45, scanlineIntensity: 0.28, scanlineCount: 540, vignette: 0.12,
      grain: 0, rampStrength: 0.9, rgbShift: 0.0008,
    }),
    modulators: [
      ...COMMON_MODULATORS,
      { param: 'bleed', source: 'mid', amount: 0.25 },
      { param: 'scanlineIntensity', source: 'treble', amount: 0.1 },
    ],
  },
  amber: {
    name: 'amber',
    ramp: PHOSPHOR_AMBER,
    params: params({
      feedbackDamp: 0.86, bloomNear: 0.9, bloomFar: 0.75, bloomThreshold: 0.45,
      barrel: 0, bleed: 0.35, scanlineIntensity: 0.22, scanlineCount: 480, vignette: 0.12,
      grain: 0, rampStrength: 0.85, rgbShift: 0.0006,
    }),
    modulators: [...COMMON_MODULATORS, { param: 'bleed', source: 'mid', amount: 0.2 }],
  },
  vhs: {
    name: 'vhs',
    ramp: WARM_CRT,
    params: params({
      feedbackDamp: 0.88, feedbackZoom: 0.002, bloomNear: 0.7, bloomFar: 0.5,
      bleed: 0.5, rgbShift: 0.003, grain: 0, scanlineIntensity: 0.15, scanlineCount: 360,
      vignette: 0.12, rampStrength: 0.25, barrel: 0,
    }),
    modulators: [
      ...COMMON_MODULATORS,
      { param: 'bleed', source: 'bass', amount: 0.2 },
      { param: 'feedbackZoom', source: 'mid', amount: 0.006 },
    ],
  },
  crt: {
    name: 'crt',
    ramp: WARM_CRT,
    params: params({
      feedbackDamp: 0.82, bloomNear: 0.85, bloomFar: 0.5,
      barrel: 0, bleed: 0.3, scanlineIntensity: 0.3, scanlineCount: 600, vignette: 0.12,
      grain: 0, dither: 0, pixelSize: 0, rampStrength: 0.2, rgbShift: 0.0012,
    }),
    modulators: [
      ...COMMON_MODULATORS,
    ],
  },
  acid: {
    name: 'acid',
    ramp: NEUTRAL_RAMP,
    params: params({
      feedbackDamp: 0.88, feedbackZoom: 0.005, feedbackRotate: 0.002,
      bloomNear: 0.8, bloomFar: 0.6, bloomThreshold: 0.55,
      kaleidoSegments: 6, kaleidoMix: 1, kaleidoSpin: 0.03, rgbShift: 0.004, hueCycle: 0.08,
      vignette: 0.12, grain: 0, rampStrength: 0,
    }),
    modulators: [
      ...COMMON_MODULATORS,
      { param: 'feedbackZoom', source: 'bass', amount: 0.006 },
      { param: 'kaleidoSpin', source: 'mid', amount: 0.04 },
      { param: 'feedbackRotate', source: 'treble', amount: 0.002 },
      { param: 'hueCycle', source: 'build', amount: 0.3 },
    ],
  },
};

export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];

/** Seeded preset choice with a mild bias toward the CRT family (the 90s core look). */
export function presetForSeed(seed: string): PostPreset {
  const rng = createPRNG(seed + ':post-preset');
  const pool: PresetName[] = ['phosphor', 'amber', 'crt', 'crt', 'vhs', 'acid', 'acid', 'clean'];
  return PRESETS[pool[Math.floor(rng() * pool.length) % pool.length]];
}
