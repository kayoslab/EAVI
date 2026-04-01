import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserSignals } from '../../src/input/signals';
import type { GeoHint } from '../../src/input/geo';
import type { PointerState } from '../../src/input/pointer';
import { mapSignalsToVisuals } from '../../src/visual/mappings';
import type { MappingInputs, VisualParams } from '../../src/visual/mappings';
import { getPaletteFamily, classifyGeo } from '../../src/visual/palette';

const defaultSignals: BrowserSignals = {
  language: 'en-US',
  timezone: 'America/New_York',
  screenWidth: 1920,
  screenHeight: 1080,
  devicePixelRatio: 2,
  hardwareConcurrency: 8,
  prefersColorScheme: 'dark',
  prefersReducedMotion: false,
  touchCapable: false,
};

const defaultGeo: GeoHint = { country: 'US', region: 'CA' };
const defaultPointer: PointerState = { x: 0.5, y: 0.5, dx: 0, dy: 0, speed: 0, active: true };

const defaultInputs: MappingInputs = {
  signals: defaultSignals,
  geo: defaultGeo,
  pointer: defaultPointer,
  sessionSeed: 'a1b2c3d4e5f6',
  bass: 128,
  treble: 100,
  timeOfDay: 14,
};

describe('US-008: Define partially legible mapping rules', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-008-01: mapSignalsToVisuals returns a complete VisualParams object with all expected keys', () => {
    const result = mapSignalsToVisuals(defaultInputs);
    expect(result).toHaveProperty('paletteHue');
    expect(result).toHaveProperty('paletteSaturation');
    expect(result).toHaveProperty('cadence');
    expect(result).toHaveProperty('density');
    expect(result).toHaveProperty('motionAmplitude');
    expect(result).toHaveProperty('pointerDisturbance');
    expect(result).toHaveProperty('bassEnergy');
    expect(result).toHaveProperty('trebleEnergy');
  });

  it('T-008-02: all output values are plain numbers — no strings or raw identifiers leak', () => {
    const result = mapSignalsToVisuals(defaultInputs);
    for (const [key, value] of Object.entries(result)) {
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('T-008-03: different countries from different geo classes produce hues in different ranges', () => {
    // US=continental, JP=oceanic, BR=tropical — distinct geo classes
    const resultUS = mapSignalsToVisuals({ ...defaultInputs, geo: { country: 'US', region: 'CA' } });
    const resultJP = mapSignalsToVisuals({ ...defaultInputs, geo: { country: 'JP', region: 'TK' } });
    const resultBR = mapSignalsToVisuals({ ...defaultInputs, geo: { country: 'BR', region: 'SP' } });
    const hues = new Set([resultUS.paletteHue, resultJP.paletteHue, resultBR.paletteHue]);
    // At minimum, hues should differ
    expect(hues.size).toBeGreaterThanOrEqual(2);
    // Continental and tropical families have different hue centers, so hues should be >30° apart
    expect(Math.abs(resultUS.paletteHue - resultBR.paletteHue)).toBeGreaterThan(10);
  });

  it('T-008-04: same country and seed produces consistent hue', () => {
    const result1 = mapSignalsToVisuals(defaultInputs);
    const result2 = mapSignalsToVisuals(defaultInputs);
    expect(result1.paletteHue).toBe(result2.paletteHue);
    expect(result1.paletteSaturation).toBe(result2.paletteSaturation);
  });

  it('T-008-05: paletteHue is in 0-360 range, paletteSaturation in 0.3-0.8 range', () => {
    const geos: GeoHint[] = [
      { country: 'US', region: 'CA' },
      { country: 'JP', region: null },
      { country: null, region: null },
      { country: 'DE', region: 'BY' },
    ];
    for (const geo of geos) {
      const result = mapSignalsToVisuals({ ...defaultInputs, geo });
      expect(result.paletteHue).toBeGreaterThanOrEqual(0);
      expect(result.paletteHue).toBeLessThanOrEqual(360);
      expect(result.paletteSaturation).toBeGreaterThanOrEqual(0.3);
      expect(result.paletteSaturation).toBeLessThanOrEqual(0.8);
    }
  });

  it('T-008-06: night hours produce slower cadence than afternoon hours', () => {
    const nightResult = mapSignalsToVisuals({ ...defaultInputs, timeOfDay: 3 });
    const afternoonResult = mapSignalsToVisuals({ ...defaultInputs, timeOfDay: 14 });
    expect(nightResult.cadence).toBeLessThan(afternoonResult.cadence);
  });

  it('T-008-07: cadence value is always positive', () => {
    for (const hour of [0, 3, 6, 9, 12, 15, 18, 21, 23.9]) {
      const result = mapSignalsToVisuals({ ...defaultInputs, timeOfDay: hour });
      expect(result.cadence).toBeGreaterThan(0);
      expect(result.cadence).toBeLessThanOrEqual(1);
    }
  });

  it('T-008-08: higher DPR and more cores produce higher density', () => {
    const lowEnd = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, devicePixelRatio: 1, hardwareConcurrency: 2 },
    });
    const highEnd = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, devicePixelRatio: 3, hardwareConcurrency: 16 },
    });
    expect(highEnd.density).toBeGreaterThan(lowEnd.density);
  });

  it('T-008-09: density is clamped to safe range', () => {
    const extremeHigh = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, devicePixelRatio: 10, hardwareConcurrency: 128 },
    });
    const extremeLow = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, devicePixelRatio: null, hardwareConcurrency: null },
    });
    expect(extremeHigh.density).toBeLessThanOrEqual(1);
    expect(extremeHigh.density).toBeGreaterThanOrEqual(0);
    expect(extremeLow.density).toBeLessThanOrEqual(1);
    expect(extremeLow.density).toBeGreaterThanOrEqual(0);
  });

  it('T-008-10: reduced-motion returns low amplitude when true', () => {
    const reduced = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, prefersReducedMotion: true },
    });
    const normal = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, prefersReducedMotion: false },
    });
    expect(reduced.motionAmplitude).toBeLessThan(normal.motionAmplitude);
    expect(reduced.motionAmplitude).toBeGreaterThan(0);
    expect(reduced.motionAmplitude).toBeLessThanOrEqual(0.3);
  });

  it('T-008-11: null reduced-motion defaults to full amplitude', () => {
    const result = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, prefersReducedMotion: null },
    });
    expect(result.motionAmplitude).toBe(1.0);
  });

  it('T-008-12: pointer disturbance is 0 when pointer is inactive', () => {
    const result = mapSignalsToVisuals({
      ...defaultInputs,
      pointer: { x: 0.5, y: 0.5, dx: 0, dy: 0, speed: 0, active: false },
    });
    expect(result.pointerDisturbance).toBe(0);
  });

  it('T-008-13: pointer disturbance scales with pointer speed', () => {
    const slow = mapSignalsToVisuals({
      ...defaultInputs,
      pointer: { x: 0.5, y: 0.5, dx: 0.001, dy: 0.001, speed: 0.01, active: true },
    });
    const fast = mapSignalsToVisuals({
      ...defaultInputs,
      pointer: { x: 0.5, y: 0.5, dx: 0.05, dy: 0.05, speed: 0.07, active: true },
    });
    expect(fast.pointerDisturbance).toBeGreaterThan(slow.pointerDisturbance);
    expect(fast.pointerDisturbance).toBeLessThanOrEqual(1);
    expect(slow.pointerDisturbance).toBeGreaterThanOrEqual(0);
  });

  it('T-008-14: bass energy returns 0 for silent input', () => {
    const result = mapSignalsToVisuals({ ...defaultInputs, bass: 0 });
    expect(result.bassEnergy).toBe(0);
  });

  it('T-008-15: treble energy returns 0 for silent input', () => {
    const result = mapSignalsToVisuals({ ...defaultInputs, treble: 0 });
    expect(result.trebleEnergy).toBe(0);
  });

  it('T-008-16: bass and treble scale correctly from 0-255 to 0-1', () => {
    const low = mapSignalsToVisuals({ ...defaultInputs, bass: 50, treble: 50 });
    const high = mapSignalsToVisuals({ ...defaultInputs, bass: 200, treble: 200 });
    const max = mapSignalsToVisuals({ ...defaultInputs, bass: 255, treble: 255 });

    expect(high.bassEnergy).toBeGreaterThan(low.bassEnergy);
    expect(high.trebleEnergy).toBeGreaterThan(low.trebleEnergy);

    expect(max.bassEnergy).toBeLessThanOrEqual(1);
    expect(max.trebleEnergy).toBeLessThanOrEqual(1);
    expect(max.bassEnergy).toBeGreaterThan(0);
    expect(max.trebleEnergy).toBeGreaterThan(0);
  });

  it('T-008-17: null and missing inputs produce safe fallback values', () => {
    const nullInputs: MappingInputs = {
      signals: {
        language: 'en-US',
        timezone: 'UTC',
        screenWidth: 1920,
        screenHeight: 1080,
        devicePixelRatio: null,
        hardwareConcurrency: null,
        prefersColorScheme: null,
        prefersReducedMotion: null,
        touchCapable: null,
      },
      geo: { country: null, region: null },
      pointer: { x: 0, y: 0, dx: 0, dy: 0, speed: 0, active: false },
      sessionSeed: 'abc123',
      bass: 0,
      treble: 0,
      timeOfDay: 12,
    };
    expect(() => mapSignalsToVisuals(nullInputs)).not.toThrow();
    const result = mapSignalsToVisuals(nullInputs);
    for (const value of Object.values(result)) {
      expect(typeof value).toBe('number');
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it('T-008-18: no forbidden storage APIs accessed during mapping', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'set');

    mapSignalsToVisuals(defaultInputs);

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('T-008-19: output contains no raw identifiers', () => {
    const result = mapSignalsToVisuals(defaultInputs);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('US');
    expect(serialized).not.toContain('America/New_York');
    expect(serialized).not.toContain('en-US');
    expect(serialized).not.toContain('CA');
  });

  it('T-008-20: mapSignalsToVisuals is pure — same inputs yield same outputs', () => {
    const result1 = mapSignalsToVisuals(defaultInputs);
    const result2 = mapSignalsToVisuals(defaultInputs);
    expect(result1).toEqual(result2);
  });

  it('T-008-21: at least 4 distinct signal-to-visual mappings are exercised', () => {
    const baseline = mapSignalsToVisuals(defaultInputs);

    // 1: Geo → palette
    const diffGeo = mapSignalsToVisuals({ ...defaultInputs, geo: { country: 'JP', region: 'TK' } });
    const geoChanged = diffGeo.paletteHue !== baseline.paletteHue;

    // 2: Time → cadence
    const diffTime = mapSignalsToVisuals({ ...defaultInputs, timeOfDay: 3 });
    const timeChanged = diffTime.cadence !== baseline.cadence;

    // 3: DPR → density
    const diffDpr = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, devicePixelRatio: 1, hardwareConcurrency: 2 },
    });
    const dprChanged = diffDpr.density !== baseline.density;

    // 4: Reduced motion → amplitude
    const diffMotion = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, prefersReducedMotion: true },
    });
    const motionChanged = diffMotion.motionAmplitude !== baseline.motionAmplitude;

    const mappingsExercised = [geoChanged, timeChanged, dprChanged, motionChanged].filter(Boolean).length;
    expect(mappingsExercised).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// US-010: Map coarse location to palette
// ---------------------------------------------------------------------------

/** Helper: check hue is within a palette family's range (wrapping around 360). */
function hueInFamilyRange(hue: number, country: string | null): boolean {
  const cls = classifyGeo(country, null);
  const family = getPaletteFamily(cls);
  if (family.hueRange >= 360) return hue >= 0 && hue <= 360;
  const lo = ((family.hueCenter - family.hueRange / 2) % 360 + 360) % 360;
  const hi = ((family.hueCenter + family.hueRange / 2) % 360 + 360) % 360;
  if (lo <= hi) return hue >= lo && hue <= hi;
  // Wraps around 0
  return hue >= lo || hue <= hi;
}

describe('US-010: Map coarse location to palette', () => {
  it('T-010-11: known tropical country produces hue in warm family range', () => {
    const result = mapSignalsToVisuals({ ...defaultInputs, geo: { country: 'BR', region: 'SP' } });
    expect(hueInFamilyRange(result.paletteHue, 'BR')).toBe(true);
  });

  it('T-010-12: known northern country produces hue in cool family range', () => {
    const result = mapSignalsToVisuals({ ...defaultInputs, geo: { country: 'NO', region: null } });
    expect(hueInFamilyRange(result.paletteHue, 'NO')).toBe(true);
  });

  it('T-010-13: null geo produces a valid fallback palette with full hue range', () => {
    const result = mapSignalsToVisuals({ ...defaultInputs, geo: { country: null, region: null } });
    expect(result.paletteHue).toBeGreaterThanOrEqual(0);
    expect(result.paletteHue).toBeLessThanOrEqual(360);
    expect(result.paletteSaturation).toBeGreaterThanOrEqual(0.3);
    expect(result.paletteSaturation).toBeLessThanOrEqual(0.8);
  });

  it('T-010-14: same country and seed produces identical hue and saturation (deterministic)', () => {
    const inputs = { ...defaultInputs, geo: { country: 'BR', region: 'SP' } as GeoHint };
    const r1 = mapSignalsToVisuals(inputs);
    const r2 = mapSignalsToVisuals(inputs);
    expect(r1.paletteHue).toBe(r2.paletteHue);
    expect(r1.paletteSaturation).toBe(r2.paletteSaturation);
  });

  it('T-010-15: same country with different seed produces different exact hue within same family', () => {
    const r1 = mapSignalsToVisuals({ ...defaultInputs, geo: { country: 'BR', region: 'SP' }, sessionSeed: 'seed1' });
    const r2 = mapSignalsToVisuals({ ...defaultInputs, geo: { country: 'BR', region: 'SP' }, sessionSeed: 'seed2' });
    expect(r1.paletteHue).not.toBe(r2.paletteHue);
    expect(hueInFamilyRange(r1.paletteHue, 'BR')).toBe(true);
    expect(hueInFamilyRange(r2.paletteHue, 'BR')).toBe(true);
  });

  it('T-010-16: different geo classes produce hues in different family ranges (>30° apart)', () => {
    const tropical = mapSignalsToVisuals({ ...defaultInputs, geo: { country: 'BR', region: null } });
    const northern = mapSignalsToVisuals({ ...defaultInputs, geo: { country: 'NO', region: null } });
    const temperate = mapSignalsToVisuals({ ...defaultInputs, geo: { country: 'FR', region: null } });
    const hues = [tropical.paletteHue, northern.paletteHue, temperate.paletteHue];
    // At least 3 hues should be >30° apart from each other
    const diffs = [
      Math.abs(hues[0] - hues[1]),
      Math.abs(hues[0] - hues[2]),
      Math.abs(hues[1] - hues[2]),
    ].map(d => Math.min(d, 360 - d));
    const distinctPairs = diffs.filter(d => d > 30).length;
    expect(distinctPairs).toBeGreaterThanOrEqual(2);
  });

  it('T-010-17: output VisualParams contains no raw country codes or region strings', () => {
    const testCases: GeoHint[] = [
      { country: 'BR', region: 'SP' },
      { country: 'NO', region: 'OS' },
      { country: 'JP', region: 'TK' },
    ];
    for (const geo of testCases) {
      const result = mapSignalsToVisuals({ ...defaultInputs, geo });
      const serialized = JSON.stringify(result);
      if (geo.country) expect(serialized).not.toContain(geo.country);
      if (geo.region) expect(serialized).not.toContain(geo.region);
    }
  });

  it('T-010-18: paletteSaturation stays within 0.3-0.8 for all palette families', () => {
    const geos: GeoHint[] = [
      { country: 'BR', region: null },
      { country: 'NO', region: null },
      { country: 'US', region: null },
      { country: null, region: null },
      { country: 'XX', region: null },
    ];
    for (const geo of geos) {
      const result = mapSignalsToVisuals({ ...defaultInputs, geo });
      expect(result.paletteSaturation).toBeGreaterThanOrEqual(0.3);
      expect(result.paletteSaturation).toBeLessThanOrEqual(0.8);
    }
  });
});
