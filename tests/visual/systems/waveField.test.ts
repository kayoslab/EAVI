import { describe, it, expect, vi } from 'vitest';
import {
  createWaveField,
  getWaveCount,
  getWavePositions,
} from '../../../src/visual/systems/waveField';
import type { VisualParams } from '../../../src/visual/mappings';
import type { FrameState } from '../../../src/visual/types';

const defaultParams: VisualParams = {
  paletteHue: 180,
  paletteSaturation: 0.5,
  cadence: 0.7,
  density: 0.6,
  motionAmplitude: 1.0,
  pointerDisturbance: 0,
  bassEnergy: 0,
  trebleEnergy: 0,
  curveSoftness: 0.5,
  structureComplexity: 0.5,
};

function createTestCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function makeFrame(overrides?: Partial<FrameState>): FrameState {
  return {
    time: 1000,
    delta: 16,
    elapsed: 1000,
    width: 800,
    height: 600,
    params: { ...defaultParams },
    ...overrides,
  };
}

describe('US-026: WaveField geometry system', () => {
  it('T-026-01: init creates waves based on density and maxWaves config', () => {
    const { ctx } = createTestCanvas();

    const low = createWaveField({ maxWaves: 20 });
    low.init(ctx, 'seed-a', { ...defaultParams, density: 0.3 });
    const lowCount = getWaveCount(low);

    const high = createWaveField({ maxWaves: 20 });
    high.init(ctx, 'seed-a', { ...defaultParams, density: 1.0 });
    const highCount = getWaveCount(high);

    expect(highCount).toBeGreaterThan(lowCount);

    const capped = createWaveField({ maxWaves: 8 });
    capped.init(ctx, 'seed-a', { ...defaultParams, density: 1.0 });
    expect(getWaveCount(capped)).toBeLessThanOrEqual(8);
  });

  it('T-026-02: same seed produces same initial wave configuration', () => {
    const { ctx } = createTestCanvas();

    const a = createWaveField();
    a.init(ctx, 'deterministic-seed', defaultParams);

    const b = createWaveField();
    b.init(ctx, 'deterministic-seed', defaultParams);

    expect(getWavePositions(a)).toEqual(getWavePositions(b));
  });

  it('T-026-03: different seeds produce different wave configurations', () => {
    const { ctx } = createTestCanvas();

    const a = createWaveField();
    a.init(ctx, 'seed-one', defaultParams);

    const b = createWaveField();
    b.init(ctx, 'seed-two', defaultParams);

    expect(getWavePositions(a)).not.toEqual(getWavePositions(b));
  });

  it('T-026-04: draw does not throw with valid FrameState', () => {
    const { ctx } = createTestCanvas();
    const field = createWaveField();
    field.init(ctx, 'test-seed', defaultParams);

    expect(() => field.draw(ctx, makeFrame())).not.toThrow();
  });

  it('T-026-05: draw does not throw with edge-case params (zero bass, zero treble, no pointer)', () => {
    const { ctx } = createTestCanvas();
    const field = createWaveField();
    const params = {
      ...defaultParams,
      bassEnergy: 0,
      trebleEnergy: 0,
      pointerDisturbance: 0,
    };
    field.init(ctx, 'edge-seed', params);

    expect(() => field.draw(ctx, makeFrame({
      params,
      pointerX: undefined,
      pointerY: undefined,
    }))).not.toThrow();
  });

  it('T-026-06: draw does not throw at boundary parameter values', () => {
    const { ctx } = createTestCanvas();

    const combos: Partial<VisualParams>[] = [
      { bassEnergy: 0, trebleEnergy: 0, density: 0, motionAmplitude: 0.2 },
      { bassEnergy: 1, trebleEnergy: 1, density: 1, motionAmplitude: 1 },
      { curveSoftness: 0, structureComplexity: 0 },
      { curveSoftness: 1, structureComplexity: 1 },
    ];

    for (const combo of combos) {
      const params = { ...defaultParams, ...combo };
      const field = createWaveField();
      field.init(ctx, 'boundary-seed', params);
      expect(() => field.draw(ctx, makeFrame({ params }))).not.toThrow();
    }
  });

  it('T-026-07: bass energy influences wave amplitude', () => {
    const { ctx } = createTestCanvas();
    const lineToSpy = vi.spyOn(ctx, 'lineTo');

    const field = createWaveField();
    field.init(ctx, 'bass-seed', defaultParams);

    // Draw with zero bass
    field.draw(ctx, makeFrame({ params: { ...defaultParams, bassEnergy: 0 } }));
    const zeroBassYs = lineToSpy.mock.calls.map(([, y]) => y as number);
    const zeroBassRange = Math.max(...zeroBassYs) - Math.min(...zeroBassYs);

    lineToSpy.mockClear();

    // Draw with max bass
    field.draw(ctx, makeFrame({ params: { ...defaultParams, bassEnergy: 1 } }));
    const highBassYs = lineToSpy.mock.calls.map(([, y]) => y as number);
    const highBassRange = Math.max(...highBassYs) - Math.min(...highBassYs);

    expect(highBassRange).toBeGreaterThan(zeroBassRange);

    lineToSpy.mockRestore();
  });

  it('T-026-08: treble energy influences visual properties (stroke style or line width)', () => {
    const { ctx } = createTestCanvas();

    const strokeStyles: string[] = [];
    const lineWidths: number[] = [];

    const origStrokeStyleDesc = Object.getOwnPropertyDescriptor(ctx, 'strokeStyle')
      ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'strokeStyle');
    const origLineWidthDesc = Object.getOwnPropertyDescriptor(ctx, 'lineWidth')
      ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'lineWidth');

    Object.defineProperty(ctx, 'strokeStyle', {
      set(v: string) { strokeStyles.push(v); },
      get() { return ''; },
      configurable: true,
    });
    Object.defineProperty(ctx, 'lineWidth', {
      set(v: number) { lineWidths.push(v); },
      get() { return 1; },
      configurable: true,
    });

    const field = createWaveField();
    field.init(ctx, 'treble-seed', defaultParams);

    field.draw(ctx, makeFrame({ params: { ...defaultParams, trebleEnergy: 0 } }));
    const zeroStyles = [...strokeStyles];
    const zeroWidths = [...lineWidths];

    strokeStyles.length = 0;
    lineWidths.length = 0;

    field.draw(ctx, makeFrame({ params: { ...defaultParams, trebleEnergy: 1 } }));
    const highStyles = [...strokeStyles];
    const highWidths = [...lineWidths];

    const stylesDiffer = JSON.stringify(zeroStyles) !== JSON.stringify(highStyles);
    const widthsDiffer = JSON.stringify(zeroWidths) !== JSON.stringify(highWidths);

    expect(stylesDiffer || widthsDiffer).toBe(true);

    // Restore
    if (origStrokeStyleDesc) Object.defineProperty(ctx, 'strokeStyle', origStrokeStyleDesc);
    if (origLineWidthDesc) Object.defineProperty(ctx, 'lineWidth', origLineWidthDesc);
  });

  it('T-026-09: pointer disturbance warps wave output', () => {
    const { ctx } = createTestCanvas();
    const lineToSpy = vi.spyOn(ctx, 'lineTo');

    const field = createWaveField();
    field.init(ctx, 'pointer-seed', defaultParams);

    field.draw(ctx, makeFrame({
      params: { ...defaultParams, pointerDisturbance: 0 },
      pointerX: 0.5,
      pointerY: 0.5,
    }));
    const zeroCalls = lineToSpy.mock.calls.map(([x, y]) => [x, y]);

    lineToSpy.mockClear();

    field.draw(ctx, makeFrame({
      params: { ...defaultParams, pointerDisturbance: 1 },
      pointerX: 0.5,
      pointerY: 0.5,
    }));
    const highCalls = lineToSpy.mock.calls.map(([x, y]) => [x, y]);

    expect(JSON.stringify(zeroCalls)).not.toEqual(JSON.stringify(highCalls));

    lineToSpy.mockRestore();
  });

  it('T-026-10: reduced motion (low motionAmplitude) is respected', () => {
    const { ctx } = createTestCanvas();
    const lineToSpy = vi.spyOn(ctx, 'lineTo');

    const field = createWaveField();
    const lowMotionParams = { ...defaultParams, motionAmplitude: 0.2 };
    field.init(ctx, 'motion-seed', lowMotionParams);

    // Frame 1 at time=0
    field.draw(ctx, makeFrame({ time: 0, params: lowMotionParams }));
    const lowFrame1 = lineToSpy.mock.calls.map(([, y]) => y as number);
    lineToSpy.mockClear();

    // Frame 2 at time=1000
    field.draw(ctx, makeFrame({ time: 1000, params: lowMotionParams }));
    const lowFrame2 = lineToSpy.mock.calls.map(([, y]) => y as number);
    lineToSpy.mockClear();

    let lowDisplacement = 0;
    const lowLen = Math.min(lowFrame1.length, lowFrame2.length);
    for (let i = 0; i < lowLen; i++) {
      lowDisplacement += Math.abs(lowFrame1[i] - lowFrame2[i]);
    }

    // High motion
    const field2 = createWaveField();
    const highMotionParams = { ...defaultParams, motionAmplitude: 1.0 };
    field2.init(ctx, 'motion-seed', highMotionParams);

    field2.draw(ctx, makeFrame({ time: 0, params: highMotionParams }));
    const highFrame1 = lineToSpy.mock.calls.map(([, y]) => y as number);
    lineToSpy.mockClear();

    field2.draw(ctx, makeFrame({ time: 1000, params: highMotionParams }));
    const highFrame2 = lineToSpy.mock.calls.map(([, y]) => y as number);
    lineToSpy.mockClear();

    let highDisplacement = 0;
    const highLen = Math.min(highFrame1.length, highFrame2.length);
    for (let i = 0; i < highLen; i++) {
      highDisplacement += Math.abs(highFrame1[i] - highFrame2[i]);
    }

    expect(lowDisplacement).toBeLessThan(highDisplacement);

    lineToSpy.mockRestore();
  });

  it('T-026-11: waves use canvas stroke API (beginPath, lineTo, stroke)', () => {
    const { ctx } = createTestCanvas();
    const beginPathSpy = vi.spyOn(ctx, 'beginPath');
    const lineToSpy = vi.spyOn(ctx, 'lineTo');
    const strokeSpy = vi.spyOn(ctx, 'stroke');

    const field = createWaveField();
    field.init(ctx, 'api-seed', defaultParams);
    field.draw(ctx, makeFrame());

    expect(beginPathSpy).toHaveBeenCalled();
    expect(lineToSpy).toHaveBeenCalled();
    expect(strokeSpy).toHaveBeenCalled();

    const waveCount = getWaveCount(field);
    expect(lineToSpy.mock.calls.length).toBeGreaterThanOrEqual(waveCount * 10);

    beginPathSpy.mockRestore();
    lineToSpy.mockRestore();
    strokeSpy.mockRestore();
  });

  it('T-026-12: wave colors derive from paletteHue and paletteSaturation', () => {
    const { ctx } = createTestCanvas();
    const strokeStyles: string[] = [];

    Object.defineProperty(ctx, 'strokeStyle', {
      set(v: string) { strokeStyles.push(v); },
      get() { return ''; },
      configurable: true,
    });

    const field = createWaveField();
    const params = { ...defaultParams, paletteHue: 200 };
    field.init(ctx, 'color-seed', params);
    field.draw(ctx, makeFrame({ params }));

    const hslStrings = strokeStyles.filter((s) => s.startsWith('hsla('));
    expect(hslStrings.length).toBeGreaterThan(0);

    // Parse hues and check they're in neighborhood of 200
    for (const hsl of hslStrings) {
      const match = hsl.match(/hsla\((\d+)/);
      expect(match).not.toBeNull();
      const hue = parseInt(match![1], 10);
      // Hue should be within 40 of 200 (accounting for per-wave hueOffset)
      const dist = Math.min(Math.abs(hue - 200), 360 - Math.abs(hue - 200));
      expect(dist).toBeLessThanOrEqual(40);
    }
  });

  it('T-026-13: no localStorage or cookie access during wave operations', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    const cookieGet = vi.fn().mockReturnValue('');
    Object.defineProperty(document, 'cookie', {
      get: cookieGet,
      configurable: true,
    });

    const { ctx } = createTestCanvas();
    const field = createWaveField();
    field.init(ctx, 'privacy-seed', defaultParams);
    field.draw(ctx, makeFrame());

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(cookieGet).not.toHaveBeenCalled();

    getItemSpy.mockRestore();
    if (cookieDescriptor) {
      Object.defineProperty(document, 'cookie', cookieDescriptor);
    }
  });
});
