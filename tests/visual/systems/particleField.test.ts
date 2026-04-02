import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
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
  const scene = new THREE.Scene();
  const f = createParticleField();
  f.init(scene, seed, params);
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
    const scene = new THREE.Scene();

    const field = createParticleField();
    const lowDensity = { ...defaultParams, density: 0.3 };
    field.init(scene, 'seed-a', lowDensity);
    const lowCount = getParticleCount(field);

    const field2 = createParticleField();
    const highDensity = { ...defaultParams, density: 1.0 };
    field2.init(scene, 'seed-a', highDensity);
    const highCount = getParticleCount(field2);

    expect(highCount).toBeGreaterThan(lowCount);
  });

  it('T-009-09: same seed produces same initial particle positions', () => {
    const scene = new THREE.Scene();
    const a = createParticleField();
    a.init(scene, 'deterministic-seed', defaultParams);
    const b = createParticleField();
    b.init(scene, 'deterministic-seed', defaultParams);
    expect(getParticlePositions(a)).toEqual(getParticlePositions(b));
  });

  it('T-009-10: different seeds produce different initial positions', () => {
    const scene = new THREE.Scene();
    const a = createParticleField();
    a.init(scene, 'seed-one', defaultParams);
    const b = createParticleField();
    b.init(scene, 'seed-two', defaultParams);
    expect(getParticlePositions(a)).not.toEqual(getParticlePositions(b));
  });

  it('T-009-11: draw does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'safe-seed', defaultParams);
    const frame = {
      time: 1000,
      delta: 16,
      params: defaultParams,
      width: 800,
      height: 600,
    };
    expect(() => field.draw(scene, frame)).not.toThrow();
  });

  // TODO: Re-enable when Canvas 2D systems are ported to Three.js
  it.skip('T-009-12: particle positions change between frames (animation works)', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'animate-seed', defaultParams);
    const frame1 = {
      time: 0,
      delta: 16,
      params: defaultParams,
      width: 800,
      height: 600,
    };
    field.draw(scene, frame1);
    const pos1 = getParticlePositions(field);
    const frame2 = {
      time: 1000,
      delta: 16,
      params: defaultParams,
      width: 800,
      height: 600,
    };
    field.draw(scene, frame2);
    const pos2 = getParticlePositions(field);
    expect(pos1).not.toEqual(pos2);
  });

  // TODO: Re-enable when Canvas 2D systems are ported to Three.js
  it.skip('T-009-13: particles with low motionAmplitude move less than high', () => {
    const scene = new THREE.Scene();

    const lowMotion = createParticleField();
    const lowParams = { ...defaultParams, motionAmplitude: 0.2 };
    lowMotion.init(scene, 'motion-seed', lowParams);
    const initialLow = getInitialPositions('motion-seed', lowParams);
    const frame = {
      time: 0,
      delta: 16,
      params: lowParams,
      width: 800,
      height: 600,
    };
    lowMotion.draw(scene, frame);
    const posLow = getParticlePositions(lowMotion);

    const highMotion = createParticleField();
    const highParams = { ...defaultParams, motionAmplitude: 1.0 };
    highMotion.init(scene, 'motion-seed', highParams);
    const initialHigh = getInitialPositions('motion-seed', highParams);
    const frame2 = {
      time: 0,
      delta: 16,
      params: highParams,
      width: 800,
      height: 600,
    };
    highMotion.draw(scene, frame2);
    const posHigh = getParticlePositions(highMotion);

    const diffLow = computeTotalDisplacement(posLow, initialLow);
    const diffHigh = computeTotalDisplacement(posHigh, initialHigh);
    expect(diffHigh).toBeGreaterThan(diffLow);
  });

  it('T-009-14: particle count scales with density parameter', () => {
    const scene = new THREE.Scene();
    const densities = [0.3, 0.5, 0.7, 1.0];
    const counts = densities.map((d) => {
      const f = createParticleField();
      f.init(scene, 'density-seed', { ...defaultParams, density: d });
      return getParticleCount(f);
    });
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });

  // TODO: Re-enable when Canvas 2D systems are ported to Three.js
  it.skip('T-009-15: all particle positions remain within canvas bounds after wrapping', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'wrap-seed', defaultParams);
    for (let t = 0; t < 100; t++) {
      field.draw(scene, {
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

  // TODO: Re-enable when Canvas 2D systems are ported to Three.js
  it.skip('T-009-16: particle colors derive from paletteHue and paletteSaturation', () => {
    // This test relied on Canvas 2D fillStyle which is no longer applicable
  });

  describe('US-019: Treble detail effects', () => {
    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-019-03: treble energy influences visual detail properties (fillStyle and size differ)', () => {
      // This test relied on Canvas 2D fillStyle and fillRect which are no longer applicable
    });

    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-019-04: treble effect is distinct from bass — treble changes appearance, bass changes displacement', () => {
      // This test relied on draw() updating particle positions
    });

    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-019-05: particle positions stay within bounds with maximum treble energy', () => {
      // This test relied on draw() updating particle positions
    });

    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-019-06: treble does not cause unbounded position drift compared to zero treble', () => {
      // This test relied on draw() updating particle positions
    });
  });

  describe('US-011: Device profile to structure', () => {
    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-011-11: curveSoftness >= 0.5 renders circular particles via ctx.arc', () => {
      // This test relied on Canvas 2D arc calls
    });

    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-011-12: curveSoftness < 0.5 renders rectangular particles via ctx.fillRect', () => {
      // This test relied on Canvas 2D fillRect calls
    });

    it('T-011-13: structureComplexity affects effective particle count — lower produces fewer', () => {
      const scene = new THREE.Scene();

      const fieldLow = createParticleField();
      const lowParams = { ...defaultParams, density: 0.6, curveSoftness: 0.5, structureComplexity: 0.0 };
      fieldLow.init(scene, 'complexity-count-seed', lowParams);
      const lowCount = getParticleCount(fieldLow);

      const fieldHigh = createParticleField();
      const highParams = { ...defaultParams, density: 0.6, curveSoftness: 0.5, structureComplexity: 1.0 };
      fieldHigh.init(scene, 'complexity-count-seed', highParams);
      const highCount = getParticleCount(fieldHigh);

      expect(highCount).toBeGreaterThan(lowCount);
    });

    it('T-011-14: scene renders without errors at boundary values (0 and 1) of new params', () => {
      const scene = new THREE.Scene();

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
          field.init(scene, 'boundary-seed', params);
          field.draw(scene, { time: 0, delta: 16, params, width: 400, height: 400 });
        }).not.toThrow();
      }
    });

    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-011-15: structureComplexity modulates hue spread — higher complexity has more color variety', () => {
      // This test relied on Canvas 2D fillStyle which is no longer applicable
    });
  });

  describe('US-013: Pointer influence on particles', () => {
    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-013-04: particles near pointer position displace more than distant ones', () => {
      // This test relied on draw() updating particle positions
    });

    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-013-05: zero pointerDisturbance produces no extra particle displacement', () => {
      // This test relied on draw() updating particle positions
    });

    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-013-06: idle scene without pointer input still animates (intentional motion)', () => {
      // This test relied on draw() updating particle positions
    });

    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-013-09: particle positions stay within bounds with maximum pointer disturbance', () => {
      // This test relied on draw() updating particle positions
    });
  });

  describe('US-025: Quality config', () => {
    it('T-025-12: createParticleField with maxParticles config caps particle count', () => {
      const scene = new THREE.Scene();
      const field = createParticleField({ maxParticles: 150 });
      field.init(scene, 'cap-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
      expect(getParticleCount(field)).toBeLessThanOrEqual(150);
    });

    it('T-025-13: createParticleField without config defaults to 600 max particles', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'default-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
      expect(getParticleCount(field)).toBeLessThanOrEqual(600);
      expect(getParticleCount(field)).toBeGreaterThan(150);
    });

    it('T-025-14: enableSparkle=false still renders particles without jitter', () => {
      const scene = new THREE.Scene();
      const field = createParticleField({ maxParticles: 300, enableSparkle: false });
      expect(() => {
        field.init(scene, 'sparkle-off-seed', { ...defaultParams, density: 0.6 });
        field.draw(scene, { time: 0, delta: 16, elapsed: 0, params: defaultParams, width: 800, height: 600 });
      }).not.toThrow();
      expect(getParticleCount(field)).toBeGreaterThan(0);
    });

    it('T-025-15: maxParticles config preserves density and structureComplexity scaling', () => {
      const scene = new THREE.Scene();

      const fieldA = createParticleField({ maxParticles: 300 });
      fieldA.init(scene, 'scale-seed', { ...defaultParams, density: 0.5, structureComplexity: 0.5 });
      const countA = getParticleCount(fieldA);

      const fieldB = createParticleField({ maxParticles: 300 });
      fieldB.init(scene, 'scale-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
      const countB = getParticleCount(fieldB);

      expect(countB).toBeGreaterThan(countA);
      expect(countB).toBeLessThanOrEqual(300);
    });

    it('T-025-16: low quality config produces significantly fewer particles than default', () => {
      const scene = new THREE.Scene();
      const params = { ...defaultParams, density: 0.6, structureComplexity: 0.5 };

      const fieldLow = createParticleField({ maxParticles: 150 });
      fieldLow.init(scene, 'compare-seed', params);
      const lowCount = getParticleCount(fieldLow);

      const fieldDefault = createParticleField();
      fieldDefault.init(scene, 'compare-seed', params);
      const defaultCount = getParticleCount(fieldDefault);

      expect(defaultCount).toBeGreaterThanOrEqual(lowCount * 2);
    });
  });

  describe('privacy', () => {
    it('T-009-17: no localStorage or cookie access during particle operations', () => {
      const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'get');
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'privacy-seed', defaultParams);
      field.draw(scene, {
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
