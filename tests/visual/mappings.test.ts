import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserSignals } from '../../src/input/signals';
import type { GeoHint } from '../../src/input/geo';
import type { PointerState } from '../../src/input/pointer';
import { mapSignalsToVisuals } from '../../src/visual/mappings';
import type { MappingInputs, VisualParams } from '../../src/visual/mappings';

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

  it('T-008-03: different countries produce different palette hues', () => {
    const resultUS = mapSignalsToVisuals({ ...defaultInputs, geo: { country: 'US', region: 'CA' } });
    const resultJP = mapSignalsToVisuals({ ...defaultInputs, geo: { country: 'JP', region: 'TK' } });
    const resultBR = mapSignalsToVisuals({ ...defaultInputs, geo: { country: 'BR', region: 'SP' } });
    const hues = new Set([resultUS.paletteHue, resultJP.paletteHue, resultBR.paletteHue]);
    expect(hues.size).toBeGreaterThanOrEqual(2);
  });

  it('T-008-04: same country and seed produces consistent hue', () => {
    const result1 = mapSignalsToVisuals(defaultInputs);
    const result2 = mapSignalsToVisuals(defaultInputs);
    expect(result1.paletteHue).toBe(result2.paletteHue);
    expect(result1.paletteSaturation).toBe(result2.paletteSaturation);
  });

  it('T-008-05: paletteHue is in 0-360 range, paletteSaturation in 0-1 range', () => {
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
      expect(result.paletteSaturation).toBeGreaterThanOrEqual(0);
      expect(result.paletteSaturation).toBeLessThanOrEqual(1);
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

  it('T-011-01: mapSignalsToVisuals returns curveSoftness and structureComplexity fields', () => {
    const result = mapSignalsToVisuals(defaultInputs);
    expect(result).toHaveProperty('curveSoftness');
    expect(result).toHaveProperty('structureComplexity');
    expect(typeof result.curveSoftness).toBe('number');
    expect(typeof result.structureComplexity).toBe('number');
    expect(Number.isFinite(result.curveSoftness)).toBe(true);
    expect(Number.isFinite(result.structureComplexity)).toBe(true);
  });

  it('T-011-02: curveSoftness is 0.8 for touch devices, 0.3 for non-touch, 0.5 for null', () => {
    const touch = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, touchCapable: true },
    });
    const noTouch = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, touchCapable: false },
    });
    const nullTouch = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, touchCapable: null },
    });
    expect(touch.curveSoftness).toBe(0.8);
    expect(noTouch.curveSoftness).toBe(0.3);
    expect(nullTouch.curveSoftness).toBe(0.5);
  });

  it('T-011-03: structureComplexity is in 0.2-1.0 range for various device profiles', () => {
    const profiles = [
      { devicePixelRatio: 1, hardwareConcurrency: 2, screenWidth: 1024, screenHeight: 768 },
      { devicePixelRatio: 2, hardwareConcurrency: 8, screenWidth: 1920, screenHeight: 1080 },
      { devicePixelRatio: 3, hardwareConcurrency: 16, screenWidth: 2560, screenHeight: 1440 },
      { devicePixelRatio: null, hardwareConcurrency: null, screenWidth: 1920, screenHeight: 1080 },
      { devicePixelRatio: 1, hardwareConcurrency: 2, screenWidth: 3440, screenHeight: 1440 },
    ];
    for (const p of profiles) {
      const result = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultInputs.signals, ...p },
      });
      expect(result.structureComplexity).toBeGreaterThanOrEqual(0.2);
      expect(result.structureComplexity).toBeLessThanOrEqual(1.0);
    }
  });

  it('T-011-04: structureComplexity handles screenWidth=0 and screenHeight=0 without NaN or Infinity', () => {
    const result = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, screenWidth: 0, screenHeight: 0 },
    });
    expect(Number.isFinite(result.structureComplexity)).toBe(true);
    expect(Number.isNaN(result.structureComplexity)).toBe(false);
    expect(result.structureComplexity).toBeGreaterThanOrEqual(0.2);
    expect(result.structureComplexity).toBeLessThanOrEqual(1.0);
  });

  it('T-011-05: curveSoftness and structureComplexity contain no raw browser strings', () => {
    const result = mapSignalsToVisuals(defaultInputs);
    expect(typeof result.curveSoftness).toBe('number');
    expect(typeof result.structureComplexity).toBe('number');
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('true');
    expect(serialized).not.toContain('false');
    expect(serialized).not.toContain('1920');
    expect(serialized).not.toContain('1080');
  });

  it('T-011-06: curveSoftness and structureComplexity are stable — same inputs yield identical values', () => {
    const result1 = mapSignalsToVisuals(defaultInputs);
    const result2 = mapSignalsToVisuals(defaultInputs);
    expect(result1.curveSoftness).toBe(result2.curveSoftness);
    expect(result1.structureComplexity).toBe(result2.structureComplexity);
  });

  it('T-011-07: higher DPR/cores and wider aspect ratio produce higher structureComplexity', () => {
    const lowEnd = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, devicePixelRatio: 1, hardwareConcurrency: 2, screenWidth: 1024, screenHeight: 1024 },
    });
    const highEnd = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, devicePixelRatio: 3, hardwareConcurrency: 16, screenWidth: 3440, screenHeight: 1440 },
    });
    expect(highEnd.structureComplexity).toBeGreaterThan(lowEnd.structureComplexity);
  });

  it('T-011-08: curveSoftness and structureComplexity have safe defaults when signals are null/missing', () => {
    const nullInputs: MappingInputs = {
      signals: {
        language: 'en-US',
        timezone: 'UTC',
        screenWidth: 0,
        screenHeight: 0,
        devicePixelRatio: null,
        hardwareConcurrency: null,
        prefersColorScheme: null,
        prefersReducedMotion: null,
        touchCapable: null,
      },
      geo: { country: null, region: null },
      pointer: { x: 0, y: 0, dx: 0, dy: 0, speed: 0, active: false },
      sessionSeed: 'fallback-seed',
      bass: 0,
      treble: 0,
      timeOfDay: 12,
    };
    const result = mapSignalsToVisuals(nullInputs);
    expect(result.curveSoftness).toBe(0.5);
    expect(Number.isFinite(result.structureComplexity)).toBe(true);
    expect(result.structureComplexity).toBeGreaterThanOrEqual(0.2);
    expect(result.structureComplexity).toBeLessThanOrEqual(1.0);
  });

  it('T-011-16: at least two structural parameters are driven by device signals', () => {
    const baseline = mapSignalsToVisuals(defaultInputs);

    const touchChanged = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, touchCapable: true },
    });
    const curveSoftnessChanged = touchChanged.curveSoftness !== baseline.curveSoftness;

    const profileChanged = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultInputs.signals, devicePixelRatio: 1, hardwareConcurrency: 2, screenWidth: 800, screenHeight: 600 },
    });
    const structureComplexityChanged = profileChanged.structureComplexity !== baseline.structureComplexity;

    expect(curveSoftnessChanged).toBe(true);
    expect(structureComplexityChanged).toBe(true);
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
