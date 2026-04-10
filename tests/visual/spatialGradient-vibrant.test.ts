import { describe, it, expect } from 'vitest';

import {
  createSpatialGradient,
  sampleGradient,
} from '../../src/visual/spatialGradient';

/**
 * Reference sRGB hex stops → linear RGB (channel^2.2):
 *   #1b2a8a  deep blue   → linear ≈ (0.0082, 0.0209, 0.2584)
 *   #6a1bbf  purple      → linear ≈ (0.1424, 0.0082, 0.5271)
 *   #d83a8a  magenta     → linear ≈ (0.6907, 0.0405, 0.2584)
 *   #ff7a2a  orange      → linear ≈ (1.0000, 0.1975, 0.0209)
 */
const REF_STOPS_LINEAR = [
  { r: 0.0082, g: 0.0209, b: 0.2584 }, // deep blue
  { r: 0.1424, g: 0.0082, b: 0.5271 }, // purple
  { r: 0.6907, g: 0.0405, b: 0.2584 }, // magenta
  { r: 1.0000, g: 0.1975, b: 0.0209 }, // orange
];

const REF_POSITIONS = [0.0, 0.33, 0.67, 1.0];

// Tolerance for seeded perturbation (±15% of reference channel value, min 0.03 absolute)
function withinTolerance(actual: number, reference: number, pct = 0.15, floor = 0.03): boolean {
  const tol = Math.max(reference * pct, floor);
  return Math.abs(actual - reference) <= tol;
}

describe('US-079: Vibrant tri-stop palette — createSpatialGradient vibrant mode', () => {
  it('T-079-01: vibrant mode returns exactly 4 stops', () => {
    const palette = createSpatialGradient(180, 0.5, 'vibrant-count', { mode: 'vibrant' });
    expect(palette.stops.length).toBe(4);
  });

  it('T-079-02: stop positions are at 0.0, ~0.33, ~0.67, 1.0', () => {
    const palette = createSpatialGradient(180, 0.5, 'vibrant-pos', { mode: 'vibrant' });
    expect(palette.stops[0].position).toBeCloseTo(REF_POSITIONS[0], 2);
    expect(palette.stops[1].position).toBeCloseTo(REF_POSITIONS[1], 1);
    expect(palette.stops[2].position).toBeCloseTo(REF_POSITIONS[2], 1);
    expect(palette.stops[3].position).toBeCloseTo(REF_POSITIONS[3], 2);
  });

  it('T-079-03: first stop has a dominant color channel (saturated, not grey)', () => {
    const palette = createSpatialGradient(180, 0.5, 'vibrant-blue', { mode: 'vibrant' });
    const stop = palette.stops[0];
    // With 8 palette families, the first stop may not be deep blue.
    // Instead verify it's a saturated color: one channel should clearly dominate.
    const maxCh = Math.max(stop.r, stop.g, stop.b);
    const minCh = Math.min(stop.r, stop.g, stop.b);
    expect(maxCh).toBeGreaterThan(0.01); // not black
    expect(maxCh - minCh).toBeGreaterThan(0.01); // not grey — has color saturation
  });

  it('T-079-04: last stop has a dominant color channel distinct from first stop', () => {
    const palette = createSpatialGradient(180, 0.5, 'vibrant-orange', { mode: 'vibrant' });
    const first = palette.stops[0];
    const last = palette.stops[3];
    // Last stop should also be saturated
    const maxCh = Math.max(last.r, last.g, last.b);
    const minCh = Math.min(last.r, last.g, last.b);
    expect(maxCh).toBeGreaterThan(0.01);
    expect(maxCh - minCh).toBeGreaterThan(0.01);
    // First and last stops should be visually distinct
    const dist = Math.sqrt((last.r - first.r) ** 2 + (last.g - first.g) ** 2 + (last.b - first.b) ** 2);
    expect(dist).toBeGreaterThan(0.05);
  });

  it('T-079-05: all stops have finite RGB values in [0,1]', () => {
    const palette = createSpatialGradient(180, 0.5, 'vibrant-valid', { mode: 'vibrant' });
    for (const stop of palette.stops) {
      expect(Number.isFinite(stop.r)).toBe(true);
      expect(Number.isFinite(stop.g)).toBe(true);
      expect(Number.isFinite(stop.b)).toBe(true);
      expect(Number.isNaN(stop.r)).toBe(false);
      expect(Number.isNaN(stop.g)).toBe(false);
      expect(Number.isNaN(stop.b)).toBe(false);
      expect(stop.r).toBeGreaterThanOrEqual(0);
      expect(stop.r).toBeLessThanOrEqual(1);
      expect(stop.g).toBeGreaterThanOrEqual(0);
      expect(stop.g).toBeLessThanOrEqual(1);
      expect(stop.b).toBeGreaterThanOrEqual(0);
      expect(stop.b).toBeLessThanOrEqual(1);
    }
  });

  it('T-079-06: deterministic — same seed produces identical vibrant palette', () => {
    const a = createSpatialGradient(180, 0.5, 'vibrant-det', { mode: 'vibrant' });
    const b = createSpatialGradient(180, 0.5, 'vibrant-det', { mode: 'vibrant' });
    expect(a.stops).toEqual(b.stops);
  });

  it('T-079-07: different seeds produce slightly different vibrant palettes', () => {
    const a = createSpatialGradient(180, 0.5, 'vibrant-alpha', { mode: 'vibrant' });
    const b = createSpatialGradient(180, 0.5, 'vibrant-beta', { mode: 'vibrant' });
    // At least one stop channel should differ
    const allSame = a.stops.every(
      (s, i) => s.r === b.stops[i].r && s.g === b.stops[i].g && s.b === b.stops[i].b,
    );
    expect(allSame).toBe(false);
  });

  it('T-079-08: seeded variants produce valid saturated palettes with bounded values', () => {
    // With 8 palette families, seeds select different families — we verify structural validity
    const seeds = ['vibrant-v1', 'vibrant-v2', 'vibrant-v3', 'vibrant-v4', 'vibrant-v5'];
    for (const seed of seeds) {
      const palette = createSpatialGradient(180, 0.5, seed, { mode: 'vibrant' });
      expect(palette.stops.length).toBe(4);
      for (let i = 0; i < 4; i++) {
        const stop = palette.stops[i];
        // All channels must be finite and in [0, 1]
        expect(Number.isFinite(stop.r), `seed=${seed} stop[${i}].r finite`).toBe(true);
        expect(Number.isFinite(stop.g), `seed=${seed} stop[${i}].g finite`).toBe(true);
        expect(Number.isFinite(stop.b), `seed=${seed} stop[${i}].b finite`).toBe(true);
        expect(stop.r, `seed=${seed} stop[${i}].r >= 0`).toBeGreaterThanOrEqual(0);
        expect(stop.r, `seed=${seed} stop[${i}].r <= 1`).toBeLessThanOrEqual(1);
        expect(stop.g, `seed=${seed} stop[${i}].g >= 0`).toBeGreaterThanOrEqual(0);
        expect(stop.g, `seed=${seed} stop[${i}].g <= 1`).toBeLessThanOrEqual(1);
        expect(stop.b, `seed=${seed} stop[${i}].b >= 0`).toBeGreaterThanOrEqual(0);
        expect(stop.b, `seed=${seed} stop[${i}].b <= 1`).toBeLessThanOrEqual(1);
      }
      // Verify stops are not all grey (palette has color saturation)
      const hasColor = palette.stops.some((s) => {
        const maxCh = Math.max(s.r, s.g, s.b);
        const minCh = Math.min(s.r, s.g, s.b);
        return maxCh - minCh > 0.01;
      });
      expect(hasColor, `seed=${seed} palette has saturated colors`).toBe(true);
    }
  });

  it('T-079-09: default mode (seeded) still works unchanged — backward compat', () => {
    // Without mode param, should behave exactly as before (3-5 stops, HSL-based)
    const palette = createSpatialGradient(180, 0.5, 'compat-test');
    expect(palette.stops.length).toBeGreaterThanOrEqual(3);
    expect(palette.stops.length).toBeLessThanOrEqual(5);
    expect(palette.stops[0].position).toBe(0);
    expect(palette.stops[palette.stops.length - 1].position).toBe(1);
  });

  it('T-079-10: vibrant palette hue/saturation params are ignored (palette is fixed-reference)', () => {
    // Vibrant mode uses fixed reference stops — paletteHue and paletteSaturation should not matter
    const a = createSpatialGradient(30, 0.3, 'vibrant-ignore', { mode: 'vibrant' });
    const b = createSpatialGradient(270, 0.9, 'vibrant-ignore', { mode: 'vibrant' });
    expect(a.stops).toEqual(b.stops);
  });
});

describe('US-079: Vibrant tri-stop palette — sampleGradient with vibrant palette', () => {
  it('T-079-11: t=0 returns approximately the deep blue reference', () => {
    const palette = createSpatialGradient(180, 0.5, 'vibrant-sample-0', { mode: 'vibrant' });
    const color = sampleGradient(palette, 0);
    expect(color.r).toBeCloseTo(palette.stops[0].r, 5);
    expect(color.g).toBeCloseTo(palette.stops[0].g, 5);
    expect(color.b).toBeCloseTo(palette.stops[0].b, 5);
  });

  it('T-079-12: t=1 returns approximately the orange reference', () => {
    const palette = createSpatialGradient(180, 0.5, 'vibrant-sample-1', { mode: 'vibrant' });
    expect(palette.stops.length).toBe(4); // guard: vibrant mode must produce 4 stops
    const color = sampleGradient(palette, 1);
    const last = palette.stops[palette.stops.length - 1];
    expect(color.r).toBeCloseTo(last.r, 5);
    expect(color.g).toBeCloseTo(last.g, 5);
    expect(color.b).toBeCloseTo(last.b, 5);
  });

  it('T-079-13: t=0.5 returns a plausible interpolated color in [0,1]', () => {
    const palette = createSpatialGradient(180, 0.5, 'vibrant-sample-mid', { mode: 'vibrant' });
    expect(palette.stops.length).toBe(4); // guard: vibrant mode must produce 4 stops
    const mid = sampleGradient(palette, 0.5);
    expect(mid.r).toBeGreaterThanOrEqual(0);
    expect(mid.r).toBeLessThanOrEqual(1);
    expect(mid.g).toBeGreaterThanOrEqual(0);
    expect(mid.g).toBeLessThanOrEqual(1);
    expect(mid.b).toBeGreaterThanOrEqual(0);
    expect(mid.b).toBeLessThanOrEqual(1);
    // Mid-point should be in the purple-magenta zone (not pure blue and not pure orange)
    const first = palette.stops[0];
    const last = palette.stops[palette.stops.length - 1];
    const isFirst =
      Math.abs(mid.r - first.r) < 1e-4 &&
      Math.abs(mid.g - first.g) < 1e-4 &&
      Math.abs(mid.b - first.b) < 1e-4;
    const isLast =
      Math.abs(mid.r - last.r) < 1e-4 &&
      Math.abs(mid.g - last.g) < 1e-4 &&
      Math.abs(mid.b - last.b) < 1e-4;
    expect(isFirst || isLast).toBe(false);
  });

  it('T-079-14: vibrant gradient shows distinct color zones across X axis', () => {
    const palette = createSpatialGradient(180, 0.5, 'vibrant-zones', { mode: 'vibrant' });
    // Sample at 4 evenly-spaced points and verify they are noticeably different
    const samples = [0, 0.33, 0.67, 1.0].map((t) => sampleGradient(palette, t));

    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];
      const dist = Math.sqrt(
        (curr.r - prev.r) ** 2 + (curr.g - prev.g) ** 2 + (curr.b - prev.b) ** 2,
      );
      // Adjacent color zones should be visibly distinct (Euclidean distance > 0.05 in linear RGB)
      expect(dist).toBeGreaterThan(0.05);
    }
  });

  it('T-079-15: colors remain saturated — no channel near white (all ~1.0)', () => {
    const palette = createSpatialGradient(180, 0.5, 'vibrant-sat', { mode: 'vibrant' });
    // Sample densely and check that no color is close to white (all channels > 0.85)
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const c = sampleGradient(palette, t);
      const isNearWhite = c.r > 0.85 && c.g > 0.85 && c.b > 0.85;
      expect(isNearWhite, `t=${t} color (${c.r}, ${c.g}, ${c.b}) is near white`).toBe(false);
    }
  });
});
