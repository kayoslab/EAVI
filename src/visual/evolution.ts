/**
 * Time-based evolution of visual parameters.
 *
 * Uses seeded modulation curves (layered sine waves) to smoothly drift
 * paletteHue, cadence, and paletteSaturation over elapsed session time.
 * Each session produces unique evolution via PRNG-derived curve parameters.
 *
 * Non-evolved params (density, motionAmplitude, pointerDisturbance,
 * bassEnergy, trebleEnergy) pass through unchanged.
 */

import { createPRNG } from './prng';
import type { VisualParams } from './mappings';

interface Harmonic {
  amplitude: number;
  frequency: number;
  phase: number;
}

interface CurveParams {
  paletteHue: Harmonic[];
  cadence: Harmonic[];
  paletteSaturation: Harmonic[];
  noiseFrequency: Harmonic[];
  radialScale: Harmonic[];
  twistStrength: Harmonic[];
  fieldSpread: Harmonic[];
}

const curveCache = new Map<string, CurveParams>();

function buildCurves(seed: string): CurveParams {
  const cached = curveCache.get(seed);
  if (cached) return cached;

  const rng = createPRNG(seed + ':evo');

  // Helper: generate 2-3 harmonics with incommensurate frequencies
  function harmonics(
    ampMin: number,
    ampMax: number,
    freqMin: number,
    freqMax: number,
    count: number,
  ): Harmonic[] {
    const result: Harmonic[] = [];
    for (let i = 0; i < count; i++) {
      result.push({
        amplitude: ampMin + rng() * (ampMax - ampMin),
        frequency: freqMin + rng() * (freqMax - freqMin),
        phase: rng() * Math.PI * 2,
      });
    }
    return result;
  }

  const curves: CurveParams = {
    // paletteHue: slow drift ±15-30 degrees, primary period ~90-180s, secondary ~30-60s
    paletteHue: harmonics(
      7, 15, // amplitude per harmonic (degrees), sums to ~15-30
      (2 * Math.PI) / 180000, (2 * Math.PI) / 90000, // freq range: periods 90-180s
      3,
    ),
    // cadence: medium oscillation ±0.1-0.2, period ~20-50s
    cadence: harmonics(
      0.03, 0.07, // amplitude per harmonic, sums to ~0.1-0.2
      (2 * Math.PI) / 50000, (2 * Math.PI) / 20000, // freq range: periods 20-50s
      3,
    ),
    // paletteSaturation: very slow drift ±0.05-0.15, period ~120-300s
    paletteSaturation: harmonics(
      0.02, 0.05, // amplitude per harmonic, sums to ~0.05-0.15
      (2 * Math.PI) / 300000, (2 * Math.PI) / 120000, // freq range: periods 120-300s
      3,
    ),
    // Structural evolution curves
    noiseFrequency: harmonics(
      0.05, 0.15, // amplitude per harmonic, sums to ~0.15-0.45
      (2 * Math.PI) / 180000, (2 * Math.PI) / 60000, // periods 60-180s
      3,
    ),
    radialScale: harmonics(
      0.03, 0.08, // amplitude per harmonic, sums to ~0.09-0.24
      (2 * Math.PI) / 200000, (2 * Math.PI) / 80000, // periods 80-200s
      3,
    ),
    twistStrength: harmonics(
      0.1, 0.25, // amplitude per harmonic, sums to ~0.3-0.75
      (2 * Math.PI) / 120000, (2 * Math.PI) / 45000, // periods 45-120s
      3,
    ),
    fieldSpread: harmonics(
      0.02, 0.06, // amplitude per harmonic, sums to ~0.06-0.18
      (2 * Math.PI) / 240000, (2 * Math.PI) / 100000, // periods 100-240s
      3,
    ),
  };

  curveCache.set(seed, curves);
  return curves;
}

function evalCurve(harmonics: Harmonic[], elapsedMs: number): number {
  let sum = 0;
  for (const h of harmonics) {
    sum += h.amplitude * Math.sin(elapsedMs * h.frequency + h.phase);
  }
  return sum;
}

/** Wrap hue to [0, 360) */
function wrapHue(h: number): number {
  return ((h % 360) + 360) % 360;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function evolveParams(
  base: VisualParams,
  elapsedMs: number,
  seed: string,
): VisualParams {
  const curves = buildCurves(seed);

  const hueDrift = evalCurve(curves.paletteHue, elapsedMs);
  const cadenceDrift = evalCurve(curves.cadence, elapsedMs);
  const satDrift = evalCurve(curves.paletteSaturation, elapsedMs);
  const noiseDrift = evalCurve(curves.noiseFrequency, elapsedMs);
  const radialDrift = evalCurve(curves.radialScale, elapsedMs);
  const twistDrift = evalCurve(curves.twistStrength, elapsedMs);
  const spreadDrift = evalCurve(curves.fieldSpread, elapsedMs);

  return {
    paletteHue: wrapHue(base.paletteHue + hueDrift),
    paletteSaturation: clamp(base.paletteSaturation + satDrift, 0.15, 0.9),
    cadence: clamp(base.cadence + cadenceDrift, 0.3, 1.0),
    // Pass-through: not evolved
    density: base.density,
    motionAmplitude: base.motionAmplitude,
    pointerDisturbance: base.pointerDisturbance,
    bassEnergy: base.bassEnergy,
    trebleEnergy: base.trebleEnergy,
    curveSoftness: base.curveSoftness,
    structureComplexity: base.structureComplexity,
    // Structural evolution
    noiseFrequency: clamp(base.noiseFrequency + noiseDrift, 0.3, 2.5),
    radialScale: clamp(base.radialScale + radialDrift, 0.5, 1.6),
    twistStrength: clamp(base.twistStrength + twistDrift, 0.1, 2.5),
    fieldSpread: clamp(base.fieldSpread + spreadDrift, 0.7, 1.4),
  };
}

/** Exposed for testing — clears the curve parameter cache. */
export function _clearCurveCache(): void {
  curveCache.clear();
}
