/**
 * Partially legible mapping rules.
 *
 * Transforms visitor signals and audio data into visual parameters.
 * Each mapping is indirect: visitors can feel the influence of their
 * context but cannot decode raw identifiers from the visuals.
 *
 * All outputs are plain numbers in normalized ranges.
 * No strings, country codes, timezone labels, or user-agent fragments
 * ever appear in the output.
 */

import type { BrowserSignals } from '../input/signals';
import type { GeoHint } from '../input/geo';
import type { PointerState } from '../input/pointer';
import { classifyGeo, getPaletteFamily } from './palette';

/** Visual parameters consumed by the render loop each frame. */
export interface VisualParams {
  /** Hue angle 0-360 derived from coarse geo + session seed */
  paletteHue: number;
  /** Saturation 0-1 derived from coarse geo + session seed */
  paletteSaturation: number;
  /** Modulation speed multiplier influenced by time of day */
  cadence: number;
  /** Particle/structure density band 0-1 based on device capability */
  density: number;
  /** Motion amplitude multiplier 0-1, reduced for prefers-reduced-motion */
  motionAmplitude: number;
  /** Field disturbance 0-1 from pointer/touch movement */
  pointerDisturbance: number;
  /** Macro motion driver 0-1 from low-frequency audio energy */
  bassEnergy: number;
  /** Shimmer/detail driver 0-1 from high-frequency audio energy */
  trebleEnergy: number;
  /** Shape roundness 0-1 driven by touch capability (0 = angular, 1 = round) */
  curveSoftness: number;
  /** Structural intricacy 0.2-1.0 driven by DPR, cores, and screen aspect ratio */
  structureComplexity: number;
  /** Spatial noise scale multiplier, evolved over time */
  noiseFrequency: number;
  /** Shell radius multiplier, evolved over time */
  radialScale: number;
  /** Y-axis twist amplitude multiplier, evolved over time */
  twistStrength: number;
  /** Overall point spread factor, evolved over time */
  fieldSpread: number;
  /** Chromatic dispersion intensity 0-1, driven by combined bass+treble energy */
  dispersion: number;
}

/** Bundled inputs for the mapping function — keeps it pure and testable. */
export interface MappingInputs {
  signals: BrowserSignals;
  geo: GeoHint;
  pointer: PointerState;
  /** Hex session seed from sessionSeed module */
  sessionSeed: string;
  /** Average of low-frequency analyser bins, 0-255 */
  bass: number;
  /** Average of high-frequency analyser bins, 0-255 */
  treble: number;
  /** Fractional hours 0-24 in visitor's local time */
  timeOfDay: number;
}

// ---------------------------------------------------------------------------
// Internal helpers — not exported
// ---------------------------------------------------------------------------

/**
 * Simple string hash producing a number.
 * Used to derive deterministic but indirect values from geo + seed.
 * Not cryptographic — just needs good distribution.
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash + ch) | 0;
  }
  return Math.abs(hash);
}

/**
 * Geo -> Palette family.
 *
 * Classifies the country into a coarse geo class, looks up the
 * corresponding palette family, then uses the session seed to pick
 * a specific hue within the family's range and a saturation near
 * the family's base. No country name is ever present in the output.
 */
function geoToPalette(
  country: string | null,
  region: string | null,
  seed: string,
): { hue: number; saturation: number } {
  const cls = classifyGeo(country, region);
  const family = getPaletteFamily(cls);

  const h = simpleHash(cls + seed);

  // Hue: pick a value within hueCenter ± hueRange/2
  const hueOffset = (h % 1000) / 1000; // 0-1
  const hue = ((family.hueCenter - family.hueRange / 2 + hueOffset * family.hueRange) % 360 + 360) % 360;

  // Saturation: family base ± 0.2, clamped to 0.3-0.8
  const satOffset = (((h >>> 8) % 1000) / 1000) * 0.4 - 0.2; // -0.2 to +0.2
  const saturation = Math.max(0.3, Math.min(0.8, family.saturationBase + satOffset));

  return { hue, saturation };
}

/**
 * Time of day -> Cadence (modulation speed multiplier).
 *
 * Uses smooth sine-based interpolation so transitions between periods
 * are gradual rather than stepped. Night is slowest, afternoon is peak.
 * The timezone string is consumed only to provide context — never output.
 *
 * Output range: ~0.4-1.0
 */
function timeToCadence(_timezone: string, timeOfDay: number): number {
  // Normalize to 0-1 over 24h
  const t = timeOfDay / 24;
  // Sine curve peaking around 14:00 (t ≈ 0.583)
  // Phase-shifted sine: peak at ~14h, trough at ~2h
  const phase = (t - 0.583) * 2 * Math.PI;
  const raw = 0.5 + 0.5 * Math.cos(phase); // 0 at trough, 1 at peak
  // Map to cadence range 0.4-1.0
  return 0.4 + raw * 0.6;
}

/**
 * Device capability -> Density band.
 *
 * Combines DPR and hardware concurrency into a single capability score,
 * then maps to a density range of 0.3-1.0. Low-end devices get simpler
 * scenes; high-end get richer ones. Also serves as performance adaptation.
 * Raw DPR/core-count values are never exposed.
 */
function capabilityToDensity(
  dpr: number | null,
  cores: number | null,
): number {
  const d = dpr ?? 1;
  const c = cores ?? 4;
  // DPR typically 1-3, cores 2-16+
  // Normalize each to ~0-1 range, then combine
  const dprScore = Math.min(d / 3, 1); // 1->0.33, 2->0.67, 3->1.0
  const coreScore = Math.min(c / 16, 1); // 4->0.25, 8->0.5, 16->1.0
  // Weighted combination: cores matter more for actual performance
  const combined = dprScore * 0.4 + coreScore * 0.6;
  // Map to 0.3-1.0 range
  return Math.max(0, Math.min(1, 0.3 + combined * 0.7));
}

/**
 * Reduced-motion preference -> Motion amplitude.
 *
 * The most direct mapping, but still only emits a scalar multiplier.
 * The render loop multiplies all motion-related values by this.
 */
function motionPref(prefersReducedMotion: boolean | null): number {
  if (prefersReducedMotion === true) return 0.2;
  return 1.0;
}

/**
 * Pointer entropy -> Field disturbance.
 *
 * Scales pointer speed (typically 0-~0.1) up to 0-1 range.
 * Returns 0 when pointer is inactive, creating organic perturbation
 * from mouse/touch movement without revealing coordinates.
 */
function pointerToDisturbance(pointer: PointerState): number {
  if (!pointer.active) return 0;
  // Speed is typically in 0-0.1 range; scale up and clamp
  return Math.min(pointer.speed * 10, 1);
}

/**
 * Bass (low-frequency energy) -> Macro motion.
 *
 * Normalizes 0-255 analyser output to 0-1 with a power curve
 * for organic response. Drives camera drift, wave amplitude, etc.
 */
function bassToMacro(bassAvg: number): number {
  if (bassAvg <= 0) return 0;
  const normalized = Math.min(bassAvg / 255, 1);
  // Square root easing — responds more to quiet sounds, compresses loud
  return Math.pow(normalized, 0.7);
}

/**
 * Treble (high-frequency energy) -> Shimmer / fine detail.
 *
 * Same normalization approach as bass but drives point jitter,
 * line brightness, and sparkle effects.
 */
function trebleToShimmer(trebleAvg: number): number {
  if (trebleAvg <= 0) return 0;
  const normalized = Math.min(trebleAvg / 255, 1);
  return Math.pow(normalized, 0.7);
}

/**
 * Combined audio energy -> Chromatic dispersion intensity.
 *
 * Near-zero when both bass and treble are low, moderate when one is active,
 * pronounced only when both are high simultaneously. The pow(1.5) curve
 * keeps it subtle at low-mid energy. Scaled by motionAmplitude for
 * prefers-reduced-motion support.
 */
function computeDispersion(
  bassNorm: number,
  trebleNorm: number,
  motionAmplitude: number,
): number {
  const combined = Math.max(bassNorm, trebleNorm) * 0.5 + bassNorm * trebleNorm * 0.5;
  const raw = Math.min(Math.pow(combined, 1.5), 1.0);
  return raw * motionAmplitude;
}

/**
 * Touch capability -> Curve softness.
 *
 * Touch-capable devices get rounder, finger-friendly shapes;
 * pointer devices get crisper, angular shapes.
 */
function touchToSoftness(touchCapable: boolean | null): number {
  if (touchCapable === true) return 0.8;
  if (touchCapable === false) return 0.3;
  return 0.5;
}

/**
 * Device profile -> Structure complexity.
 *
 * Combines DPR (weight 0.3), core count (weight 0.4), and screen
 * aspect-ratio modulation (weight 0.3) into a 0.2-1.0 range score.
 * Wider/ultrawide screens get slightly higher complexity.
 */
function profileToComplexity(
  dpr: number | null,
  cores: number | null,
  screenWidth: number,
  screenHeight: number,
): number {
  const d = dpr ?? 1;
  const c = cores ?? 4;
  const dprScore = Math.min(d / 3, 1);
  const coreScore = Math.min(c / 16, 1);

  // Aspect ratio: min/max gives 0-1 where 1 = square, lower = wider
  const maxDim = Math.max(screenWidth, screenHeight);
  const ratio = maxDim === 0 ? 1.0 : Math.min(screenWidth, screenHeight) / maxDim;
  // Wider screens (lower ratio) -> higher complexity modifier
  const aspectScore = 1 - ratio; // 0 for square, ~0.4 for 21:9

  const combined = dprScore * 0.3 + coreScore * 0.4 + aspectScore * 0.3;
  // Map to 0.2-1.0 range
  return Math.max(0.2, Math.min(1.0, 0.2 + combined * 0.8));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compose all mapping rules into a single pure function.
 *
 * This is the only function the render loop calls each frame.
 * It delegates to individual mapping helpers and returns a complete
 * VisualParams object of plain numbers — no raw identifiers.
 */
export function mapSignalsToVisuals(inputs: MappingInputs): VisualParams {
  const { signals, geo, pointer, sessionSeed, bass, treble, timeOfDay } =
    inputs;

  const palette = geoToPalette(geo.country, geo.region, sessionSeed);

  return {
    paletteHue: palette.hue,
    paletteSaturation: palette.saturation,
    cadence: timeToCadence(signals.timezone, timeOfDay),
    density: capabilityToDensity(
      signals.devicePixelRatio,
      signals.hardwareConcurrency,
    ),
    motionAmplitude: motionPref(signals.prefersReducedMotion),
    pointerDisturbance: pointerToDisturbance(pointer),
    bassEnergy: bassToMacro(bass),
    trebleEnergy: trebleToShimmer(treble),
    curveSoftness: touchToSoftness(signals.touchCapable),
    structureComplexity: profileToComplexity(
      signals.devicePixelRatio,
      signals.hardwareConcurrency,
      signals.screenWidth,
      signals.screenHeight,
    ),
    // Structural evolution base values — seeded per session
    ...structuralBase(sessionSeed),
    // Chromatic dispersion from combined audio energy
    dispersion: computeDispersion(
      bassToMacro(bass),
      trebleToShimmer(treble),
      motionPref(signals.prefersReducedMotion),
    ),
  };
}

/**
 * Seeded base values for structural evolution parameters.
 * Each value is derived from the session seed so different sessions
 * start with slightly different structures.
 */
function structuralBase(seed: string): Pick<VisualParams, 'noiseFrequency' | 'radialScale' | 'twistStrength' | 'fieldSpread'> {
  const h = simpleHash(seed + ':struct');
  const h2 = simpleHash(seed + ':struct2');
  return {
    noiseFrequency: 0.4 + ((h % 1000) / 1000) * 1.4,           // [0.4, 1.8]
    radialScale: 0.6 + (((h >>> 8) % 1000) / 1000) * 0.8,     // [0.6, 1.4]
    twistStrength: 0.2 + ((h2 % 1000) / 1000) * 2.0,            // [0.2, 2.2]
    fieldSpread: 0.75 + (((h2 >>> 8) % 1000) / 1000) * 0.55,   // [0.75, 1.3]
  };
}
