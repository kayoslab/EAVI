/** Tweakable post-stack parameters. Every preset is a complete PostParams; modulators add deltas per frame. */
export interface PostParams {
  // Feedback (after-image)
  feedbackDamp: number;
  feedbackZoom: number;
  feedbackRotate: number;
  // Bloom
  bloomThreshold: number;
  bloomKnee: number;
  bloomNear: number;
  bloomFar: number;
  // Composite
  exposure: number;
  // Warp (kaleidoscope, chromatic shift, CRT barrel, pixelation)
  kaleidoSegments: number;
  kaleidoAngle: number;
  kaleidoSpin: number;
  rgbShift: number;
  barrel: number;
  pixelSize: number;
  // Finish (CRT, grade, grain)
  bleed: number;
  scanlineIntensity: number;
  scanlineCount: number;
  vignette: number;
  grain: number;
  dither: number;
  rampStrength: number;
  hueShift: number;
  hueCycle: number;
  // Luminance limiter (always on in production; the slew is the only knob)
  limiterSlewUp: number;
  limiterSlewDown: number;
  // Slow automatic gain toward a perceived mean luminance (dark by design)
  agcTarget: number;
  agcRate: number;
}

export type NumericParamKey = keyof PostParams;

/** RGB stops at luminance 0, 1/3, 2/3, 1 — the palette ramp the finish pass grades toward. */
export type Ramp = readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];

/** [min, max, step] for the debug sliders and for clamping modulated values. */
export const PARAM_RANGES: Record<NumericParamKey, readonly [number, number, number]> = {
  feedbackDamp: [0, 0.97, 0.01],
  feedbackZoom: [-0.03, 0.03, 0.001],
  feedbackRotate: [-0.02, 0.02, 0.0005],
  bloomThreshold: [0, 2, 0.01],
  bloomKnee: [0, 1, 0.01],
  bloomNear: [0, 3, 0.01],
  bloomFar: [0, 3, 0.01],
  exposure: [0.1, 4, 0.01],
  kaleidoSegments: [0, 16, 1],
  kaleidoAngle: [0, 6.2832, 0.01],
  kaleidoSpin: [-1, 1, 0.005],
  rgbShift: [0, 0.03, 0.0005],
  barrel: [0, 0.5, 0.005],
  pixelSize: [0, 12, 1],
  bleed: [0, 1, 0.01],
  scanlineIntensity: [0, 0.8, 0.01],
  scanlineCount: [60, 1200, 1],
  vignette: [0, 1, 0.01],
  grain: [0, 0.3, 0.005],
  dither: [0, 1, 0.01],
  rampStrength: [0, 1, 0.01],
  hueShift: [0, 6.2832, 0.01],
  hueCycle: [-1, 1, 0.005],
  limiterSlewUp: [0.001, 0.2, 0.001],
  limiterSlewDown: [0.001, 1, 0.001],
  agcTarget: [0.02, 0.4, 0.005],
  agcRate: [0, 0.1, 0.001],
};

export const NUMERIC_PARAM_KEYS = Object.keys(PARAM_RANGES) as NumericParamKey[];

export function clampParam(key: NumericParamKey, value: number): number {
  const [min, max] = PARAM_RANGES[key];
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export const DEFAULT_POST: PostParams = {
  feedbackDamp: 0.82,
  feedbackZoom: 0.004,
  feedbackRotate: 0.0015,
  bloomThreshold: 0.55,
  bloomKnee: 0.3,
  bloomNear: 0.8,
  bloomFar: 0.55,
  exposure: 1.0,
  kaleidoSegments: 0,
  kaleidoAngle: 0,
  kaleidoSpin: 0,
  rgbShift: 0.0015,
  barrel: 0,
  pixelSize: 0,
  bleed: 0,
  scanlineIntensity: 0,
  scanlineCount: 480,
  vignette: 0.35,
  grain: 0.03,
  dither: 0,
  rampStrength: 0,
  hueShift: 0,
  hueCycle: 0,
  limiterSlewUp: 0.012,
  limiterSlewDown: 0.5,
  agcTarget: 0.11,
  agcRate: 0.012,
};

export const NEUTRAL_RAMP: Ramp = [[0, 0, 0], [0.33, 0.33, 0.33], [0.66, 0.66, 0.66], [1, 1, 1]];
