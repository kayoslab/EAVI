import { describe, it, expect } from 'vitest';

// The module under test — will be created by US-075 implementation
// Exports: SpatialGradientPalette, createSpatialGradient, sampleGradient, computeVertexColors
import {
  createSpatialGradient,
  sampleGradient,
  computeVertexColors,
} from '../../src/visual/spatialGradient';

describe('US-075: Spatial gradient palette — createSpatialGradient', () => {
  it('T-075-01: returns 3-5 color stops', () => {
    const palette = createSpatialGradient(180, 0.5, 'seed-a');
    expect(palette.stops.length).toBeGreaterThanOrEqual(3);
    expect(palette.stops.length).toBeLessThanOrEqual(5);
  });

  it('T-075-02: every stop has valid RGB values in [0,1] range', () => {
    const palette = createSpatialGradient(220, 0.6, 'seed-rgb');
    for (const stop of palette.stops) {
      expect(stop.r).toBeGreaterThanOrEqual(0);
      expect(stop.r).toBeLessThanOrEqual(1);
      expect(stop.g).toBeGreaterThanOrEqual(0);
      expect(stop.g).toBeLessThanOrEqual(1);
      expect(stop.b).toBeGreaterThanOrEqual(0);
      expect(stop.b).toBeLessThanOrEqual(1);
    }
  });

  it('T-075-03: every stop has a position in [0,1] range', () => {
    const palette = createSpatialGradient(180, 0.5, 'seed-pos');
    for (const stop of palette.stops) {
      expect(stop.position).toBeGreaterThanOrEqual(0);
      expect(stop.position).toBeLessThanOrEqual(1);
    }
  });

  it('T-075-04: stops are ordered by ascending position', () => {
    const palette = createSpatialGradient(90, 0.7, 'seed-order');
    for (let i = 1; i < palette.stops.length; i++) {
      expect(palette.stops[i].position).toBeGreaterThanOrEqual(palette.stops[i - 1].position);
    }
  });

  it('T-075-05: first stop position is 0 and last stop position is 1', () => {
    const palette = createSpatialGradient(180, 0.5, 'seed-bounds');
    expect(palette.stops[0].position).toBe(0);
    expect(palette.stops[palette.stops.length - 1].position).toBe(1);
  });

  it('T-075-06: deterministic — same seed produces identical palette', () => {
    const a = createSpatialGradient(180, 0.5, 'deterministic');
    const b = createSpatialGradient(180, 0.5, 'deterministic');
    expect(a.stops).toEqual(b.stops);
  });

  it('T-075-07: different seeds produce different palettes', () => {
    const a = createSpatialGradient(180, 0.5, 'seed-alpha');
    const b = createSpatialGradient(180, 0.5, 'seed-beta');
    // At least one stop should differ
    const same = a.stops.every(
      (s, i) => s.r === b.stops[i]?.r && s.g === b.stops[i]?.g && s.b === b.stops[i]?.b,
    );
    expect(same).toBe(false);
  });

  it('T-075-08: different hue values produce different palettes', () => {
    const a = createSpatialGradient(30, 0.5, 'same-seed');
    const b = createSpatialGradient(270, 0.5, 'same-seed');
    const same = a.stops.every(
      (s, i) => s.r === b.stops[i]?.r && s.g === b.stops[i]?.g && s.b === b.stops[i]?.b,
    );
    expect(same).toBe(false);
  });

  it('T-075-09: colors are bright (lightness not too dark)', () => {
    const palette = createSpatialGradient(180, 0.6, 'bright-check');
    for (const stop of palette.stops) {
      // At least one channel should be above 0.2 for "bright" colors
      const maxChannel = Math.max(stop.r, stop.g, stop.b);
      expect(maxChannel).toBeGreaterThan(0.2);
    }
  });
});

describe('US-075: Spatial gradient palette — sampleGradient', () => {
  it('T-075-10: t=0 returns the first stop color', () => {
    const palette = createSpatialGradient(180, 0.5, 'sample-first');
    const color = sampleGradient(palette, 0);
    const first = palette.stops[0];
    expect(color.r).toBeCloseTo(first.r, 5);
    expect(color.g).toBeCloseTo(first.g, 5);
    expect(color.b).toBeCloseTo(first.b, 5);
  });

  it('T-075-11: t=1 returns the last stop color', () => {
    const palette = createSpatialGradient(180, 0.5, 'sample-last');
    const color = sampleGradient(palette, 1);
    const last = palette.stops[palette.stops.length - 1];
    expect(color.r).toBeCloseTo(last.r, 5);
    expect(color.g).toBeCloseTo(last.g, 5);
    expect(color.b).toBeCloseTo(last.b, 5);
  });

  it('T-075-12: t=0.5 returns a blended intermediate (not identical to any stop)', () => {
    const palette = createSpatialGradient(180, 0.5, 'sample-mid');
    const mid = sampleGradient(palette, 0.5);
    // Should be a valid RGB color
    expect(mid.r).toBeGreaterThanOrEqual(0);
    expect(mid.r).toBeLessThanOrEqual(1);
    expect(mid.g).toBeGreaterThanOrEqual(0);
    expect(mid.g).toBeLessThanOrEqual(1);
    expect(mid.b).toBeGreaterThanOrEqual(0);
    expect(mid.b).toBeLessThanOrEqual(1);
    // If there are >2 stops, mid should differ from first and last
    if (palette.stops.length > 2) {
      const first = palette.stops[0];
      const last = palette.stops[palette.stops.length - 1];
      const isFirst = Math.abs(mid.r - first.r) < 1e-5 && Math.abs(mid.g - first.g) < 1e-5 && Math.abs(mid.b - first.b) < 1e-5;
      const isLast = Math.abs(mid.r - last.r) < 1e-5 && Math.abs(mid.g - last.g) < 1e-5 && Math.abs(mid.b - last.b) < 1e-5;
      expect(isFirst || isLast).toBe(false);
    }
  });

  it('T-075-13: output values are clamped to [0,1]', () => {
    const palette = createSpatialGradient(180, 0.5, 'clamp-test');
    for (const t of [-0.1, 0.0, 0.25, 0.5, 0.75, 1.0, 1.1]) {
      const c = sampleGradient(palette, t);
      expect(c.r).toBeGreaterThanOrEqual(0);
      expect(c.r).toBeLessThanOrEqual(1);
      expect(c.g).toBeGreaterThanOrEqual(0);
      expect(c.g).toBeLessThanOrEqual(1);
      expect(c.b).toBeGreaterThanOrEqual(0);
      expect(c.b).toBeLessThanOrEqual(1);
    }
  });

  it('T-075-14: interpolation is monotonically smooth between adjacent stops', () => {
    const palette = createSpatialGradient(180, 0.5, 'smooth-test');
    // Sample at many points and verify no sudden jumps > threshold
    const samples = 20;
    let prev = sampleGradient(palette, 0);
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const curr = sampleGradient(palette, t);
      const dr = Math.abs(curr.r - prev.r);
      const dg = Math.abs(curr.g - prev.g);
      const db = Math.abs(curr.b - prev.b);
      // No channel should jump more than 0.5 in a single 1/20th step
      expect(dr).toBeLessThan(0.5);
      expect(dg).toBeLessThan(0.5);
      expect(db).toBeLessThan(0.5);
      prev = curr;
    }
  });
});

describe('US-075: Spatial gradient palette — computeVertexColors', () => {
  it('T-075-15: returns Float32Array with correct length for point data (stride 3)', () => {
    const palette = createSpatialGradient(180, 0.5, 'vc-len');
    // 4 vertices: each 3 floats for position
    const positions = new Float32Array([
      -5, 0, 0,
       0, 1, 0,
       2, 0, 0,
       5, 0, 0,
    ]);
    const colors = computeVertexColors(positions, palette);
    // Should return 4 vertices × 3 RGB = 12 floats
    expect(colors).toBeInstanceOf(Float32Array);
    expect(colors.length).toBe(12);
  });

  it('T-075-16: all output color values are in [0,1] range', () => {
    const palette = createSpatialGradient(180, 0.5, 'vc-range');
    const positions = new Float32Array([
      -10, 0, 0,
        0, 5, 0,
       10, 0, 0,
    ]);
    const colors = computeVertexColors(positions, palette);
    for (let i = 0; i < colors.length; i++) {
      expect(colors[i]).toBeGreaterThanOrEqual(0);
      expect(colors[i]).toBeLessThanOrEqual(1);
    }
  });

  it('T-075-17: known positions map to expected gradient samples (axis=x)', () => {
    const palette = createSpatialGradient(180, 0.5, 'vc-known');
    // Two vertices at extremes of x-axis
    const positions = new Float32Array([
      -5, 0, 0,   // min x → t=0
       5, 0, 0,   // max x → t=1
    ]);
    const colors = computeVertexColors(positions, palette, { axis: 'x' });

    const firstStop = sampleGradient(palette, 0);
    const lastStop = sampleGradient(palette, 1);

    // First vertex should match t=0 gradient color
    expect(colors[0]).toBeCloseTo(firstStop.r, 3);
    expect(colors[1]).toBeCloseTo(firstStop.g, 3);
    expect(colors[2]).toBeCloseTo(firstStop.b, 3);

    // Second vertex should match t=1 gradient color
    expect(colors[3]).toBeCloseTo(lastStop.r, 3);
    expect(colors[4]).toBeCloseTo(lastStop.g, 3);
    expect(colors[5]).toBeCloseTo(lastStop.b, 3);
  });

  it('T-075-18: default axis is x', () => {
    const palette = createSpatialGradient(180, 0.5, 'vc-default');
    const positions = new Float32Array([
      -5, 0, 0,
       5, 0, 0,
    ]);
    const colorsDefault = computeVertexColors(positions, palette);
    const colorsExplicitX = computeVertexColors(positions, palette, { axis: 'x' });
    expect(Array.from(colorsDefault)).toEqual(Array.from(colorsExplicitX));
  });

  it('T-075-19: axis=z normalizes along z-axis', () => {
    const palette = createSpatialGradient(180, 0.5, 'vc-z');
    // Positions spread along z, not x
    const positions = new Float32Array([
      0, 0, -5,
      0, 0,  5,
    ]);
    const colors = computeVertexColors(positions, palette, { axis: 'z' });

    const firstStop = sampleGradient(palette, 0);
    const lastStop = sampleGradient(palette, 1);

    expect(colors[0]).toBeCloseTo(firstStop.r, 3);
    expect(colors[1]).toBeCloseTo(firstStop.g, 3);
    expect(colors[2]).toBeCloseTo(firstStop.b, 3);
    expect(colors[3]).toBeCloseTo(lastStop.r, 3);
    expect(colors[4]).toBeCloseTo(lastStop.g, 3);
    expect(colors[5]).toBeCloseTo(lastStop.b, 3);
  });

  it('T-075-20: axis=radial normalizes by distance from origin in xz-plane', () => {
    const palette = createSpatialGradient(180, 0.5, 'vc-radial');
    // Vertex at origin and one at radius 5
    const positions = new Float32Array([
      0, 0, 0,
      3, 0, 4,   // radial distance = 5
    ]);
    const colors = computeVertexColors(positions, palette, { axis: 'radial' });

    const firstStop = sampleGradient(palette, 0);
    const lastStop = sampleGradient(palette, 1);

    // Origin vertex → t=0 (min radial distance)
    expect(colors[0]).toBeCloseTo(firstStop.r, 3);
    expect(colors[1]).toBeCloseTo(firstStop.g, 3);
    expect(colors[2]).toBeCloseTo(firstStop.b, 3);

    // Far vertex → t=1 (max radial distance)
    expect(colors[3]).toBeCloseTo(lastStop.r, 3);
    expect(colors[4]).toBeCloseTo(lastStop.g, 3);
    expect(colors[5]).toBeCloseTo(lastStop.b, 3);
  });

  it('T-075-21: handles edge stride (itemStride=6) — both endpoints get correct colors', () => {
    const palette = createSpatialGradient(180, 0.5, 'vc-edge');
    // One edge: two endpoints, each a vec3 — total 6 floats per edge
    // Edge from x=-5 to x=5
    const positions = new Float32Array([
      -5, 0, 0,   5, 0, 0,   // edge 1
      -5, 0, 0,   0, 0, 0,   // edge 2
    ]);
    const colors = computeVertexColors(positions, palette, { axis: 'x', itemStride: 6 });

    const firstStop = sampleGradient(palette, 0);
    const lastStop = sampleGradient(palette, 1);
    const midStop = sampleGradient(palette, 0.5);

    // Edge 1, endpoint 1 (x=-5 → t=0)
    expect(colors[0]).toBeCloseTo(firstStop.r, 3);
    expect(colors[1]).toBeCloseTo(firstStop.g, 3);
    expect(colors[2]).toBeCloseTo(firstStop.b, 3);

    // Edge 1, endpoint 2 (x=5 → t=1)
    expect(colors[3]).toBeCloseTo(lastStop.r, 3);
    expect(colors[4]).toBeCloseTo(lastStop.g, 3);
    expect(colors[5]).toBeCloseTo(lastStop.b, 3);

    // Edge 2, endpoint 1 (x=-5 → t=0)
    expect(colors[6]).toBeCloseTo(firstStop.r, 3);
    expect(colors[7]).toBeCloseTo(firstStop.g, 3);
    expect(colors[8]).toBeCloseTo(firstStop.b, 3);

    // Edge 2, endpoint 2 (x=0 → t=0.5)
    expect(colors[9]).toBeCloseTo(midStop.r, 3);
    expect(colors[10]).toBeCloseTo(midStop.g, 3);
    expect(colors[11]).toBeCloseTo(midStop.b, 3);
  });

  it('T-075-22: handles single vertex (all same position) gracefully', () => {
    const palette = createSpatialGradient(180, 0.5, 'vc-single');
    const positions = new Float32Array([3, 0, 0]);
    const colors = computeVertexColors(positions, palette);
    expect(colors.length).toBe(3);
    // With a single vertex, min=max → t should fallback (e.g. 0.5 or 0)
    for (let i = 0; i < 3; i++) {
      expect(colors[i]).toBeGreaterThanOrEqual(0);
      expect(colors[i]).toBeLessThanOrEqual(1);
    }
  });

  it('T-075-23: handles empty positions array', () => {
    const palette = createSpatialGradient(180, 0.5, 'vc-empty');
    const positions = new Float32Array(0);
    const colors = computeVertexColors(positions, palette);
    expect(colors.length).toBe(0);
  });

  it('T-075-24: mid-range vertex gets interpolated color, not endpoint color', () => {
    const palette = createSpatialGradient(180, 0.5, 'vc-mid');
    const positions = new Float32Array([
      -5, 0, 0,
       0, 0, 0,
       5, 0, 0,
    ]);
    const colors = computeVertexColors(positions, palette, { axis: 'x' });

    const firstStop = sampleGradient(palette, 0);
    const lastStop = sampleGradient(palette, 1);

    // Middle vertex (x=0 → t=0.5) should differ from both endpoints
    const midR = colors[3];
    const midG = colors[4];
    const midB = colors[5];

    const isFirst = Math.abs(midR - firstStop.r) < 1e-3 && Math.abs(midG - firstStop.g) < 1e-3 && Math.abs(midB - firstStop.b) < 1e-3;
    const isLast = Math.abs(midR - lastStop.r) < 1e-3 && Math.abs(midG - lastStop.g) < 1e-3 && Math.abs(midB - lastStop.b) < 1e-3;
    expect(isFirst || isLast).toBe(false);
  });
});
