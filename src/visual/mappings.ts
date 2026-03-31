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
 * Hashes country + region + session seed to produce a hue (0-360)
 * and saturation (0.3-0.8). The same country biases toward a hue
 * family but the exact value shifts per session via the seed.
 * No country name is ever present in the output.
 */
function geoToPalette(
  country: string | null,
  region: string | null,
  seed: string,
): { hue: number; saturation: number } {
  const geoStr = `${country ?? 'unknown'}:${region ?? 'unknown'}`;
  const h = simpleHash(geoStr + seed);
  const hue = h % 360;
  // Saturation: use a different bit range to decorrelate from hue
  const saturation = 0.3 + (((h >>> 8) % 500) / 500) * 0.5; // 0.3-0.8
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
  };
}
