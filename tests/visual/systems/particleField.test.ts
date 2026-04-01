import { describe, it, expect, vi } from 'vitest';
import {
  createParticleField,
  getParticleCount,
  getParticlePositions,
} from '../../../src/visual/systems/particleField';
import type { VisualParams } from '../../../src/visual/mappings';

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

function getInitialPositions(
  seed: string,
  params: VisualParams,
): Array<{ x: number; y: number }> {
  const ctx = document.createElement('canvas').getContext('2d')!;
  const f = createParticleField();
  f.init(ctx, seed, params);
  return getParticlePositions(f);
}

function computeTotalDisplacement(
  posA: Array<{ x: number; y: number }>,
  posB: Array<{ x: number; y: number }>,
): number {
  let total = 0;
  const len = Math.min(posA.length, posB.length);
  for (let i = 0; i < len; i++) {
    const dx = posA[i].x - posB[i].x;
    const dy = posA[i].y - posB[i].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

describe('US-009: ParticleField geometry system', () => {
  it('T-009-08: init creates particles based on density', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;

    const field = createParticleField();
    const lowDensity = { ...defaultParams, density: 0.3 };
    field.init(ctx, 'seed-a', lowDensity);
    const lowCount = getParticleCount(field);

    const field2 = createParticleField();
    const highDensity = { ...defaultParams, density: 1.0 };
    field2.init(ctx, 'seed-a', highDensity);
    const highCount = getParticleCount(field2);

    expect(highCount).toBeGreaterThan(lowCount);
  });

  it('T-009-09: same seed produces same initial particle positions', () => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const a = createParticleField();
    a.init(ctx, 'deterministic-seed', defaultParams);
    const b = createParticleField();
    b.init(ctx, 'deterministic-seed', defaultParams);
    expect(getParticlePositions(a)).toEqual(getParticlePositions(b));
  });

  it('T-009-10: different seeds produce different initial positions', () => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const a = createParticleField();
    a.init(ctx, 'seed-one', defaultParams);
    const b = createParticleField();
    b.init(ctx, 'seed-two', defaultParams);
    expect(getParticlePositions(a)).not.toEqual(getParticlePositions(b));
  });

  it('T-009-11: draw does not throw with valid FrameState', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    const field = createParticleField();
    field.init(ctx, 'safe-seed', defaultParams);
    const frame = {
      time: 1000,
      delta: 16,
      params: defaultParams,
      width: 800,
      height: 600,
    };
    expect(() => field.draw(ctx, frame)).not.toThrow();
  });

  it('T-009-12: particle positions change between frames (animation works)', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    const field = createParticleField();
    field.init(ctx, 'animate-seed', defaultParams);
    const frame1 = {
      time: 0,
      delta: 16,
      params: defaultParams,
      width: 800,
      height: 600,
    };
    field.draw(ctx, frame1);
    const pos1 = getParticlePositions(field);
    const frame2 = {
      time: 1000,
      delta: 16,
      params: defaultParams,
      width: 800,
      height: 600,
    };
    field.draw(ctx, frame2);
    const pos2 = getParticlePositions(field);
    expect(pos1).not.toEqual(pos2);
  });

  it('T-009-13: particles with low motionAmplitude move less than high', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;

    const lowMotion = createParticleField();
    const lowParams = { ...defaultParams, motionAmplitude: 0.2 };
    lowMotion.init(ctx, 'motion-seed', lowParams);
    const initialLow = getInitialPositions('motion-seed', lowParams);
    const frame = {
      time: 0,
      delta: 16,
      params: lowParams,
      width: 800,
      height: 600,
    };
    lowMotion.draw(ctx, frame);
    const posLow = getParticlePositions(lowMotion);

    const highMotion = createParticleField();
    const highParams = { ...defaultParams, motionAmplitude: 1.0 };
    highMotion.init(ctx, 'motion-seed', highParams);
    const initialHigh = getInitialPositions('motion-seed', highParams);
    const frame2 = {
      time: 0,
      delta: 16,
      params: highParams,
      width: 800,
      height: 600,
    };
    highMotion.draw(ctx, frame2);
    const posHigh = getParticlePositions(highMotion);

    const diffLow = computeTotalDisplacement(posLow, initialLow);
    const diffHigh = computeTotalDisplacement(posHigh, initialHigh);
    expect(diffHigh).toBeGreaterThan(diffLow);
  });

  it('T-009-14: particle count scales with density parameter', () => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const densities = [0.3, 0.5, 0.7, 1.0];
    const counts = densities.map((d) => {
      const f = createParticleField();
      f.init(ctx, 'density-seed', { ...defaultParams, density: d });
      return getParticleCount(f);
    });
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });

  it('T-009-15: all particle positions remain within canvas bounds after wrapping', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d')!;
    const field = createParticleField();
    field.init(ctx, 'wrap-seed', defaultParams);
    for (let t = 0; t < 100; t++) {
      field.draw(ctx, {
        time: t * 100,
        delta: 100,
        params: defaultParams,
        width: 200,
        height: 200,
      });
    }
    const positions = getParticlePositions(field);
    positions.forEach((p) => {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(200);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(200);
    });
  });

  it('T-009-16: particle colors derive from paletteHue and paletteSaturation', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d')!;

    const capturedStyles: string[] = [];
    Object.defineProperty(ctx, 'fillStyle', {
      set(v: string) {
        capturedStyles.push(v);
      },
      get() {
        return '';
      },
    });

    const field = createParticleField();
    const params = { ...defaultParams, paletteHue: 200, paletteSaturation: 0.7 };
    field.init(ctx, 'color-seed', params);
    field.draw(ctx, { time: 0, delta: 16, params, width: 400, height: 400 });

    const hslColors = capturedStyles.filter(
      (s) => s.startsWith('hsl') || s.startsWith('HSL'),
    );
    expect(hslColors.length).toBeGreaterThan(0);
  });

  describe('US-019: Treble detail effects', () => {
    it('T-019-03: treble energy influences visual detail properties (fillStyle and size differ)', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d')!;

      const capturedStylesZero: string[] = [];
      const capturedRectsZero: number[][] = [];
      const capturedStylesHigh: string[] = [];
      const capturedRectsHigh: number[][] = [];

      // --- Run with trebleEnergy = 0 ---
      const field0 = createParticleField();
      const params0 = { ...defaultParams, trebleEnergy: 0 };
      field0.init(ctx, 'treble-detail-seed', params0);

      let styleProxy: string = '';
      Object.defineProperty(ctx, 'fillStyle', {
        set(v: string) { styleProxy = v; capturedStylesZero.push(v); },
        get() { return styleProxy; },
        configurable: true,
      });
      const origFillRect = ctx.fillRect.bind(ctx);
      ctx.fillRect = (...args: [number, number, number, number]) => {
        capturedRectsZero.push([...args]);
        origFillRect(...args);
      };

      field0.draw(ctx, { time: 1000, delta: 16, params: params0, width: 400, height: 400 });

      // --- Run with trebleEnergy = 1 ---
      const field1 = createParticleField();
      const params1 = { ...defaultParams, trebleEnergy: 1 };
      field1.init(ctx, 'treble-detail-seed', params1);

      Object.defineProperty(ctx, 'fillStyle', {
        set(v: string) { styleProxy = v; capturedStylesHigh.push(v); },
        get() { return styleProxy; },
        configurable: true,
      });
      ctx.fillRect = (...args: [number, number, number, number]) => {
        capturedRectsHigh.push([...args]);
        origFillRect(...args);
      };

      field1.draw(ctx, { time: 1000, delta: 16, params: params1, width: 400, height: 400 });

      // Filter out the black background clear
      const particleStylesZero = capturedStylesZero.filter(s => s.startsWith('hsl'));
      const particleStylesHigh = capturedStylesHigh.filter(s => s.startsWith('hsl'));

      expect(particleStylesZero.length).toBeGreaterThan(0);
      expect(particleStylesHigh.length).toBeGreaterThan(0);

      // At least one style or rect dimension should differ
      const stylesDiffer = particleStylesZero[0] !== particleStylesHigh[0];
      // Compare particle sizes (3rd element = width of fillRect for particles, not bg)
      const particleRectsZero = capturedRectsZero.filter(r => !(r[0] === 0 && r[1] === 0 && r[2] === 400 && r[3] === 400));
      const particleRectsHigh = capturedRectsHigh.filter(r => !(r[0] === 0 && r[1] === 0 && r[2] === 400 && r[3] === 400));
      const sizesDiffer = particleRectsZero.length > 0 && particleRectsHigh.length > 0 &&
        particleRectsZero[0][2] !== particleRectsHigh[0][2];

      expect(stylesDiffer || sizesDiffer).toBe(true);
    });

    it('T-019-04: treble effect is distinct from bass — treble changes appearance, bass changes displacement', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d')!;

      const baseFrame = { time: 0, delta: 16, width: 800, height: 600 };

      // --- Treble only (bass=0, treble=1) ---
      const trebleOnly = createParticleField();
      const trebleParams = { ...defaultParams, bassEnergy: 0, trebleEnergy: 1 };
      trebleOnly.init(ctx, 'distinct-seed', trebleParams);
      const initialTreble = getParticlePositions(trebleOnly).map(p => ({ ...p }));
      trebleOnly.draw(ctx, { ...baseFrame, params: trebleParams });
      const afterTreble = getParticlePositions(trebleOnly);
      const trebleDisplacement = computeTotalDisplacement(afterTreble, initialTreble);

      // --- Bass only (bass=1, treble=0) ---
      const bassOnly = createParticleField();
      const bassParams = { ...defaultParams, bassEnergy: 1, trebleEnergy: 0 };
      bassOnly.init(ctx, 'distinct-seed', bassParams);
      const initialBass = getParticlePositions(bassOnly).map(p => ({ ...p }));
      bassOnly.draw(ctx, { ...baseFrame, params: bassParams });
      const afterBass = getParticlePositions(bassOnly);
      const bassDisplacement = computeTotalDisplacement(afterBass, initialBass);

      // Bass should cause significantly more displacement than treble
      expect(bassDisplacement).toBeGreaterThan(trebleDisplacement);

      // Treble-only displacement should be similar to zero-energy displacement
      const zeroField = createParticleField();
      const zeroParams = { ...defaultParams, bassEnergy: 0, trebleEnergy: 0 };
      zeroField.init(ctx, 'distinct-seed', zeroParams);
      const initialZero = getParticlePositions(zeroField).map(p => ({ ...p }));
      zeroField.draw(ctx, { ...baseFrame, params: zeroParams });
      const afterZero = getParticlePositions(zeroField);
      const zeroDisplacement = computeTotalDisplacement(afterZero, initialZero);

      expect(Math.abs(trebleDisplacement - zeroDisplacement)).toBeLessThan(0.01);
    });

    it('T-019-05: particle positions stay within bounds with maximum treble energy', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d')!;

      const field = createParticleField();
      const maxTrebleParams = { ...defaultParams, trebleEnergy: 1, bassEnergy: 1 };
      field.init(ctx, 'bounds-treble-seed', maxTrebleParams);

      // Run many frames with max treble
      for (let t = 0; t < 100; t++) {
        field.draw(ctx, {
          time: t * 100,
          delta: 100,
          params: maxTrebleParams,
          width: 800,
          height: 600,
        });
      }

      const positions = getParticlePositions(field);
      positions.forEach((p) => {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      });
    });

    it('T-019-06: treble does not cause unbounded position drift compared to zero treble', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d')!;
      const numFrames = 50;

      // --- With treble ---
      const fieldTreble = createParticleField();
      const trebleParams = { ...defaultParams, trebleEnergy: 1 };
      fieldTreble.init(ctx, 'drift-seed', trebleParams);
      for (let t = 0; t < numFrames; t++) {
        fieldTreble.draw(ctx, {
          time: t * 16,
          delta: 16,
          params: trebleParams,
          width: 800,
          height: 600,
        });
      }
      const posTreble = getParticlePositions(fieldTreble);

      // --- Without treble ---
      const fieldZero = createParticleField();
      const zeroParams = { ...defaultParams, trebleEnergy: 0 };
      fieldZero.init(ctx, 'drift-seed', zeroParams);
      for (let t = 0; t < numFrames; t++) {
        fieldZero.draw(ctx, {
          time: t * 16,
          delta: 16,
          params: zeroParams,
          width: 800,
          height: 600,
        });
      }
      const posZero = getParticlePositions(fieldZero);

      // Both should be within [0, 1] bounds
      posTreble.forEach((p) => {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      });

      posZero.forEach((p) => {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      });

      // Treble should not cause positions to diverge wildly from zero-treble run
      const displacement = computeTotalDisplacement(posTreble, posZero);
      expect(displacement).toBeLessThan(0.1);
    });
  });

  describe('US-011: Device profile to structure', () => {
    it('T-011-11: curveSoftness >= 0.5 renders circular particles via ctx.arc', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d')!;
      const arcSpy = vi.spyOn(ctx, 'arc');
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');

      const field = createParticleField();
      const params = { ...defaultParams, curveSoftness: 0.8, structureComplexity: 0.5 };
      field.init(ctx, 'soft-seed', params);

      arcSpy.mockClear();
      fillRectSpy.mockClear();

      field.draw(ctx, { time: 0, delta: 16, params, width: 400, height: 400 });

      expect(arcSpy).toHaveBeenCalled();
      const particleCount = getParticleCount(field);
      expect(arcSpy.mock.calls.length).toBeGreaterThanOrEqual(particleCount);
    });

    it('T-011-12: curveSoftness < 0.5 renders rectangular particles via ctx.fillRect', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d')!;
      const arcSpy = vi.spyOn(ctx, 'arc');
      const fillRectSpy = vi.spyOn(ctx, 'fillRect');

      const field = createParticleField();
      const params = { ...defaultParams, curveSoftness: 0.2, structureComplexity: 0.5 };
      field.init(ctx, 'sharp-seed', params);

      arcSpy.mockClear();
      fillRectSpy.mockClear();

      field.draw(ctx, { time: 0, delta: 16, params, width: 400, height: 400 });

      expect(arcSpy).not.toHaveBeenCalled();
      const particleCount = getParticleCount(field);
      expect(fillRectSpy.mock.calls.length).toBeGreaterThanOrEqual(particleCount);
    });

    it('T-011-13: structureComplexity affects effective particle count — lower produces fewer', () => {
      const ctx = document.createElement('canvas').getContext('2d')!;

      const fieldLow = createParticleField();
      const lowParams = { ...defaultParams, density: 0.6, curveSoftness: 0.5, structureComplexity: 0.0 };
      fieldLow.init(ctx, 'complexity-count-seed', lowParams);
      const lowCount = getParticleCount(fieldLow);

      const fieldHigh = createParticleField();
      const highParams = { ...defaultParams, density: 0.6, curveSoftness: 0.5, structureComplexity: 1.0 };
      fieldHigh.init(ctx, 'complexity-count-seed', highParams);
      const highCount = getParticleCount(fieldHigh);

      expect(highCount).toBeGreaterThan(lowCount);
    });

    it('T-011-14: scene renders without errors at boundary values (0 and 1) of new params', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d')!;

      const boundaries = [
        { curveSoftness: 0, structureComplexity: 0 },
        { curveSoftness: 0, structureComplexity: 1 },
        { curveSoftness: 1, structureComplexity: 0 },
        { curveSoftness: 1, structureComplexity: 1 },
        { curveSoftness: 0.5, structureComplexity: 0.5 },
      ];

      for (const b of boundaries) {
        const field = createParticleField();
        const params = { ...defaultParams, ...b };
        expect(() => {
          field.init(ctx, 'boundary-seed', params);
          field.draw(ctx, { time: 0, delta: 16, params, width: 400, height: 400 });
        }).not.toThrow();
      }
    });

    it('T-011-15: structureComplexity modulates hue spread — higher complexity has more color variety', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d')!;

      function captureHues(complexity: number): number[] {
        const styles: string[] = [];
        const field = createParticleField();
        const params = { ...defaultParams, curveSoftness: 0.3, structureComplexity: complexity, paletteHue: 180 };
        field.init(ctx, 'hue-spread-seed', params);

        let styleProxy = '';
        Object.defineProperty(ctx, 'fillStyle', {
          set(v: string) { styleProxy = v; styles.push(v); },
          get() { return styleProxy; },
          configurable: true,
        });

        field.draw(ctx, { time: 1000, delta: 16, params, width: 400, height: 400 });

        return styles
          .filter(s => s.startsWith('hsl'))
          .map(s => parseInt(s.match(/\d+/)![0], 10));
      }

      const huesLow = captureHues(0.0);
      const huesHigh = captureHues(1.0);

      if (huesLow.length > 1 && huesHigh.length > 1) {
        const spreadLow = Math.max(...huesLow) - Math.min(...huesLow);
        const spreadHigh = Math.max(...huesHigh) - Math.min(...huesHigh);
        expect(spreadHigh).toBeGreaterThanOrEqual(spreadLow);
      }
    });
  });

  describe('US-013: Pointer influence on particles', () => {
    it('T-013-04: particles near pointer position displace more than distant ones', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d')!;
      const numFrames = 20;
      const pointerX = 0.2;
      const pointerY = 0.2;

      // Control run: no pointer disturbance
      const controlField = createParticleField();
      const controlParams = { ...defaultParams, pointerDisturbance: 0, motionAmplitude: 0 };
      controlField.init(ctx, 'spatial-seed', controlParams);
      const initialPositions = getParticlePositions(controlField).map(p => ({ ...p }));
      for (let t = 0; t < numFrames; t++) {
        controlField.draw(ctx, {
          time: t * 16, delta: 16, elapsed: t * 16, params: controlParams,
          width: 800, height: 600, pointerX, pointerY,
        });
      }
      const controlPositions = getParticlePositions(controlField);

      // Test run: with pointer disturbance
      const testField = createParticleField();
      const testParams = { ...defaultParams, pointerDisturbance: 1, motionAmplitude: 0 };
      testField.init(ctx, 'spatial-seed', testParams);
      const testInitial = getParticlePositions(testField).map(p => ({ ...p }));
      for (let t = 0; t < numFrames; t++) {
        testField.draw(ctx, {
          time: t * 16, delta: 16, elapsed: t * 16, params: testParams,
          width: 800, height: 600, pointerX, pointerY,
        });
      }
      const testPositions = getParticlePositions(testField);

      // Compute per-particle extra displacement from pointer
      let nearExtraDisp = 0;
      let nearCount = 0;
      let farExtraDisp = 0;
      let farCount = 0;

      for (let i = 0; i < testInitial.length; i++) {
        const ix = testInitial[i].x;
        const iy = testInitial[i].y;
        const distToPointer = Math.sqrt((ix - pointerX) ** 2 + (iy - pointerY) ** 2);

        const controlDisp = Math.sqrt(
          (controlPositions[i].x - initialPositions[i].x) ** 2 +
          (controlPositions[i].y - initialPositions[i].y) ** 2,
        );
        const testDisp = Math.sqrt(
          (testPositions[i].x - testInitial[i].x) ** 2 +
          (testPositions[i].y - testInitial[i].y) ** 2,
        );
        const extraDisp = testDisp - controlDisp;

        if (distToPointer < 0.2) {
          nearExtraDisp += extraDisp;
          nearCount++;
        } else if (distToPointer > 0.5) {
          farExtraDisp += extraDisp;
          farCount++;
        }
      }

      if (nearCount > 0 && farCount > 0) {
        expect(nearExtraDisp / nearCount).toBeGreaterThan(farExtraDisp / farCount);
      }
    });

    it('T-013-05: zero pointerDisturbance produces no extra particle displacement', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d')!;

      // Run with pointerX/Y set but disturbance=0
      const fieldA = createParticleField();
      fieldA.init(ctx, 'zero-dist-seed', defaultParams);
      fieldA.draw(ctx, {
        time: 0, delta: 16, elapsed: 0, params: { ...defaultParams, pointerDisturbance: 0 },
        width: 800, height: 600, pointerX: 0.3, pointerY: 0.7,
      });
      const posA = getParticlePositions(fieldA);

      // Run without pointer position
      const fieldB = createParticleField();
      fieldB.init(ctx, 'zero-dist-seed', defaultParams);
      fieldB.draw(ctx, {
        time: 0, delta: 16, elapsed: 0, params: { ...defaultParams, pointerDisturbance: 0 },
        width: 800, height: 600,
      });
      const posB = getParticlePositions(fieldB);

      expect(posA).toEqual(posB);
    });

    it('T-013-06: idle scene without pointer input still animates (intentional motion)', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d')!;

      const field = createParticleField();
      const zeroParams = {
        ...defaultParams,
        pointerDisturbance: 0,
        bassEnergy: 0,
        trebleEnergy: 0,
      };
      field.init(ctx, 'idle-animate-seed', zeroParams);
      const initial = getParticlePositions(field).map(p => ({ ...p }));

      for (let t = 0; t < 10; t++) {
        field.draw(ctx, {
          time: t * 100, delta: 100, elapsed: t * 100, params: zeroParams,
          width: 800, height: 600,
        });
      }
      const after = getParticlePositions(field);
      const disp = computeTotalDisplacement(after, initial);
      expect(disp).toBeGreaterThan(0);
    });

    it('T-013-09: particle positions stay within bounds with maximum pointer disturbance', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      const ctx = canvas.getContext('2d')!;

      const field = createParticleField();
      const maxParams = { ...defaultParams, pointerDisturbance: 1, bassEnergy: 1 };
      field.init(ctx, 'bounds-ptr-seed', maxParams);

      for (let t = 0; t < 100; t++) {
        field.draw(ctx, {
          time: t * 100, delta: 100, elapsed: t * 100, params: maxParams,
          width: 800, height: 600, pointerX: 0.5, pointerY: 0.5,
        });
      }

      const positions = getParticlePositions(field);
      positions.forEach((p) => {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(1);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('US-025: Quality config', () => {
    it('T-025-12: createParticleField with maxParticles config caps particle count', () => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      const field = createParticleField({ maxParticles: 150 });
      field.init(ctx, 'cap-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
      expect(getParticleCount(field)).toBeLessThanOrEqual(150);
    });

    it('T-025-13: createParticleField without config defaults to 600 max particles', () => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      const field = createParticleField();
      field.init(ctx, 'default-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
      expect(getParticleCount(field)).toBeLessThanOrEqual(600);
      expect(getParticleCount(field)).toBeGreaterThan(150);
    });

    it('T-025-14: enableSparkle=false still renders particles without jitter', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 400;
      const ctx = canvas.getContext('2d')!;

      // Sparkle disabled
      const fieldOff = createParticleField({ maxParticles: 300, enableSparkle: false });
      const params = { ...defaultParams, trebleEnergy: 1.0, curveSoftness: 0.3 };
      fieldOff.init(ctx, 'sparkle-seed', params);

      const rectsOff: number[][] = [];
      const origFillRect = ctx.fillRect.bind(ctx);
      ctx.fillRect = (...args: [number, number, number, number]) => {
        rectsOff.push([...args]);
        origFillRect(...args);
      };
      fieldOff.draw(ctx, { time: 1000, delta: 16, params, width: 400, height: 400 });
      expect(rectsOff.length).toBeGreaterThan(0);

      // Sparkle enabled
      const fieldOn = createParticleField({ maxParticles: 300, enableSparkle: true });
      fieldOn.init(ctx, 'sparkle-seed', params);

      const rectsOn: number[][] = [];
      ctx.fillRect = (...args: [number, number, number, number]) => {
        rectsOn.push([...args]);
        origFillRect(...args);
      };
      fieldOn.draw(ctx, { time: 1000, delta: 16, params, width: 400, height: 400 });

      // Both render particles but sparkle-off should have less size variance
      const sizesOff = rectsOff.map(r => r[2]);
      const sizesOn = rectsOn.map(r => r[2]);

      const variance = (arr: number[]) => {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
      };

      if (sizesOff.length > 1 && sizesOn.length > 1) {
        expect(variance(sizesOff)).toBeLessThanOrEqual(variance(sizesOn));
      }
    });

    it('T-025-15: maxParticles config preserves density and structureComplexity scaling', () => {
      const ctx = document.createElement('canvas').getContext('2d')!;

      const fieldA = createParticleField({ maxParticles: 300 });
      fieldA.init(ctx, 'scale-seed', { ...defaultParams, density: 0.5, structureComplexity: 0.5 });
      const countA = getParticleCount(fieldA);

      const fieldB = createParticleField({ maxParticles: 300 });
      fieldB.init(ctx, 'scale-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
      const countB = getParticleCount(fieldB);

      expect(countB).toBeGreaterThan(countA);
      expect(countB).toBeLessThanOrEqual(300);
    });

    it('T-025-16: low quality config produces significantly fewer particles than default', () => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      const params = { ...defaultParams, density: 0.6, structureComplexity: 0.5 };

      const fieldLow = createParticleField({ maxParticles: 150 });
      fieldLow.init(ctx, 'compare-seed', params);
      const lowCount = getParticleCount(fieldLow);

      const fieldDefault = createParticleField();
      fieldDefault.init(ctx, 'compare-seed', params);
      const defaultCount = getParticleCount(fieldDefault);

      expect(defaultCount).toBeGreaterThanOrEqual(lowCount * 2);
    });
  });

  describe('privacy', () => {
    it('T-009-17: no localStorage or cookie access during particle operations', () => {
      const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'get');
      const ctx = document.createElement('canvas').getContext('2d')!;
      const field = createParticleField();
      field.init(ctx, 'privacy-seed', defaultParams);
      field.draw(ctx, {
        time: 0,
        delta: 16,
        params: defaultParams,
        width: 800,
        height: 600,
      });
      expect(lsSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });
});
