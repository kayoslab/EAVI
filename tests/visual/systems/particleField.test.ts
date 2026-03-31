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
