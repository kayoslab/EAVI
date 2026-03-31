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
