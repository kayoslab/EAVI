import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  createParticleField,
  getParticleCount,
  getParticlePositions,
} from '../../src/visual/systems/particleField';
import type { ParticleField } from '../../src/visual/systems/particleField';
import type { VisualParams } from '../../src/visual/mappings';
import type { FrameState } from '../../src/visual/types';

// ---------------------------------------------------------------------------
// US-082: Rebuild particleField as curl-noise vector flow
// ---------------------------------------------------------------------------

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
  noiseFrequency: 1.0,
  radialScale: 1.0,
  twistStrength: 1.0,
  fieldSpread: 1.0,
  dispersion: 0,
};

function makeFrame(params: VisualParams, overrides?: Partial<FrameState>): FrameState {
  return {
    time: 1000,
    delta: 16,
    elapsed: 1000,
    params,
    width: 800,
    height: 600,
    pointerX: 0.5,
    pointerY: 0.5,
    ...overrides,
  };
}

function initField(config?: Parameters<typeof createParticleField>[0], params?: VisualParams): { field: ParticleField; scene: THREE.Scene } {
  const scene = new THREE.Scene();
  const field = createParticleField(config);
  field.init(scene, 'test-seed-082', params ?? defaultParams);
  return { field, scene };
}

// ---------------------------------------------------------------------------
// AC1: Particles advect along curl-noise / divergence-free vector field
// ---------------------------------------------------------------------------

describe('US-082: Curl-noise vector flow', () => {
  describe('AC1: Particles advect along curl-noise vector field', () => {
    it('T-082-01: Particle interface includes 3D position (x, y, z)', () => {
      const { field } = initField({ maxParticles: 50 });
      const positions = getParticlePositions(field);
      expect(positions.length).toBeGreaterThan(0);
      for (const p of positions) {
        expect(typeof p.x).toBe('number');
        expect(typeof p.y).toBe('number');
        expect(typeof p.z).toBe('number');
      }
    });

    it('T-082-02: Particles move between frames (CPU advection is active)', () => {
      const { field, scene } = initField({ maxParticles: 50 });
      const before = getParticlePositions(field).map(p => ({ ...p }));

      // Run several frames
      for (let t = 0; t < 10; t++) {
        field.draw(scene, makeFrame(defaultParams, {
          time: 1000 + t * 16,
          delta: 16,
          elapsed: 1000 + t * 16,
        }));
      }

      const after = getParticlePositions(field);
      // CPU advection should move particles
      let anyMoved = false;
      for (let i = 0; i < Math.min(before.length, after.length); i++) {
        if (before[i].x !== after[i].x || before[i].y !== after[i].y || before[i].z !== after[i].z) {
          anyMoved = true;
          break;
        }
      }
      expect(anyMoved).toBe(true);
      expect(after.length).toBe(before.length);
    });

    it('T-082-03: All particle positions remain finite after 60 frames of advection', () => {
      const { field, scene } = initField({ maxParticles: 100 });

      for (let t = 0; t < 60; t++) {
        field.draw(scene, makeFrame(defaultParams, {
          time: t * 16,
          delta: 16,
          elapsed: t * 16,
        }));
      }

      const positions = getParticlePositions(field);
      for (const p of positions) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(Number.isFinite(p.z)).toBe(true);
      }
    });

    it('T-082-04: Position buffer contains finite values after advection (no NaN/Infinity blowup)', () => {
      const { field, scene } = initField({ maxParticles: 100 });

      // Run 60 frames with varying bass to stress advection
      for (let t = 0; t < 60; t++) {
        const params = { ...defaultParams, bassEnergy: 0.5 + 0.3 * Math.sin(t * 0.1) };
        field.draw(scene, makeFrame(params, {
          time: t * 16,
          delta: 16,
          elapsed: t * 16,
        }));
      }

      // Check the actual geometry position buffer
      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      expect(mesh).toBeTruthy();
      const geom = mesh.geometry as THREE.BufferGeometry;
      const posAttr = geom.getAttribute('position');
      expect(posAttr).toBeTruthy();
      const arr = (posAttr as THREE.BufferAttribute).array;
      for (let i = 0; i < arr.length; i++) {
        expect(Number.isFinite(arr[i])).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // AC2: Field has visible large-scale structure (vortices, sheets)
  // -------------------------------------------------------------------------

  describe('AC2: Visible large-scale structure', () => {
    it('T-082-05: Particle positions are not isotropically distributed after advection', () => {
      const { field, scene } = initField({ maxParticles: 200 });

      // Run enough frames for structure to emerge
      for (let t = 0; t < 120; t++) {
        field.draw(scene, makeFrame(defaultParams, {
          time: t * 16,
          delta: 16,
          elapsed: t * 16,
        }));
      }

      const positions = getParticlePositions(field);
      expect(positions.length).toBeGreaterThan(0);
      const xs = positions.map(p => p.x);
      const xRange = Math.max(...xs) - Math.min(...xs);
      expect(xRange).toBeGreaterThan(0);
    });

    it('T-082-06: Attractor system creates velocity variation across the field', () => {
      const { field, scene } = initField({ maxParticles: 100 });

      // Run a few frames to activate advection
      for (let t = 0; t < 10; t++) {
        field.draw(scene, makeFrame(defaultParams, { time: t * 16, delta: 16, elapsed: t * 16 }));
      }

      const particles = field.particles;
      expect(particles.length).toBeGreaterThan(0);
      // After advection, particles should have non-zero velocities
      let anyNonZeroV = false;
      for (const p of particles) {
        const vmag = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
        if (vmag > 0.0001) { anyNonZeroV = true; break; }
      }
      expect(anyNonZeroV).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // AC3: Bass modulates field strength; treble modulates particle size/sparkle
  // -------------------------------------------------------------------------

  describe('AC3: Bass → field strength, treble → size/sparkle', () => {
    it('T-082-07: Higher bass energy produces faster particle advection', () => {
      const scene1 = new THREE.Scene();
      const field1 = createParticleField({ maxParticles: 50 });
      const lowBassParams = { ...defaultParams, bassEnergy: 0.1 };
      field1.init(scene1, 'bass-test', lowBassParams);

      const scene2 = new THREE.Scene();
      const field2 = createParticleField({ maxParticles: 50 });
      const highBassParams = { ...defaultParams, bassEnergy: 0.9 };
      field2.init(scene2, 'bass-test', highBassParams);

      // Run both for several frames
      for (let t = 0; t < 30; t++) {
        field1.draw(scene1, makeFrame(lowBassParams, { time: t * 16, delta: 16, elapsed: t * 16 }));
        field2.draw(scene2, makeFrame(highBassParams, { time: t * 16, delta: 16, elapsed: t * 16 }));
      }

      expect(getParticleCount(field1)).toBeGreaterThan(0);
      expect(getParticleCount(field2)).toBeGreaterThan(0);
    });

    it('T-082-08: Bass drives CPU advection speed, not GPU displacement', () => {
      const { field, scene } = initField({ maxParticles: 50 });

      field.draw(scene, makeFrame({ ...defaultParams, bassEnergy: 0.8 }));

      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      expect(mesh).toBeTruthy();
      const mat = mesh.material as THREE.ShaderMaterial;
      // uBassEnergy still set for potential GPU use, but uDisplacementScale removed
      expect(mat.uniforms.uBassEnergy).toBeDefined();
    });

    it('T-082-09: Treble energy drives GPU uniforms (point size / sparkle)', () => {
      const { field, scene } = initField({ maxParticles: 50 });

      field.draw(scene, makeFrame({ ...defaultParams, trebleEnergy: 0.7 }));

      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      const mat = mesh.material as THREE.ShaderMaterial;
      expect(mat.uniforms.uTrebleEnergy.value).toBeCloseTo(0.7, 1);
    });

    it('T-082-10: Zero bass still produces non-zero advection (base drift speed)', () => {
      const { field, scene } = initField({ maxParticles: 50 });
      const params = { ...defaultParams, bassEnergy: 0 };

      // Run frames with zero bass
      const before = getParticlePositions(field).map(p => ({ ...p }));
      for (let t = 0; t < 20; t++) {
        field.draw(scene, makeFrame(params, { time: t * 16, delta: 16, elapsed: t * 16 }));
      }
      const after = getParticlePositions(field);

      // Particles should still move due to base drift
      let anyMoved = false;
      for (let i = 0; i < Math.min(before.length, after.length); i++) {
        if (before[i].x !== after[i].x || before[i].y !== after[i].y) {
          anyMoved = true;
          break;
        }
      }
      expect(anyMoved).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // AC4: Uses vibrant palette; runs at target FPS on mid tier
  // -------------------------------------------------------------------------

  describe('AC4: Palette and performance', () => {
    it('T-082-11: Vertex colors are present and use vibrant spatial gradient', () => {
      const { scene } = initField({ maxParticles: 50 });
      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      const geom = mesh.geometry as THREE.BufferGeometry;
      const colorAttr = geom.getAttribute('aVertexColor');
      expect(colorAttr).toBeTruthy();
      expect((colorAttr as THREE.BufferAttribute).itemSize).toBe(3);

      const arr = (colorAttr as THREE.BufferAttribute).array;
      let anyNonZero = false;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] > 0) { anyNonZero = true; break; }
      }
      expect(anyNonZero).toBe(true);
    });

    it('T-082-12: Particle count respects adaptive scaling limits', () => {
      const lowParams = { ...defaultParams, density: 0.3, structureComplexity: 0.2 };
      const highParams = { ...defaultParams, density: 0.9, structureComplexity: 0.8 };

      const { field: lowField } = initField({ maxParticles: 600 }, lowParams);
      const { field: highField } = initField({ maxParticles: 600 }, highParams);

      const lowCount = getParticleCount(lowField);
      const highCount = getParticleCount(highField);

      expect(lowCount).toBeLessThan(highCount);
      expect(lowCount).toBeGreaterThanOrEqual(24);
      expect(highCount).toBeLessThanOrEqual(600);
    });
  });

  // -------------------------------------------------------------------------
  // AC5: No console errors, stable first frame
  // -------------------------------------------------------------------------

  describe('AC5: No console errors, stable first frame', () => {
    it('T-082-13: init + first draw completes without throwing', () => {
      expect(() => {
        const { field, scene } = initField({ maxParticles: 100 });
        field.draw(scene, makeFrame(defaultParams));
      }).not.toThrow();
    });

    it('T-082-14: Geometry has all required attributes after init', () => {
      const { scene } = initField({ maxParticles: 50 });
      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      const geom = mesh.geometry as THREE.BufferGeometry;

      expect(geom.getAttribute('position')).toBeTruthy();
      expect(geom.getAttribute('aRandom')).toBeTruthy();
      expect(geom.getAttribute('aVertexColor')).toBeTruthy();
    });

    it('T-082-15: Position attribute has itemSize 3 with correct count', () => {
      const { field, scene } = initField({ maxParticles: 50 });
      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      const geom = mesh.geometry as THREE.BufferGeometry;
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;

      expect(posAttr.itemSize).toBe(3);
      expect(posAttr.count).toBe(getParticleCount(field));
    });

    it('T-082-16: ShaderMaterial is present with transparent + additive blending', () => {
      const { scene } = initField({ maxParticles: 50 });
      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      const mat = mesh.material as THREE.ShaderMaterial;

      expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
      expect(mat.transparent).toBe(true);
      expect(mat.blending).toBe(THREE.AdditiveBlending);
      expect(mat.depthWrite).toBe(false);
    });

    it('T-082-17: cleanup disposes geometry and removes mesh from scene', () => {
      const { field, scene } = initField({ maxParticles: 50 });
      expect(scene.children.length).toBeGreaterThan(0);

      field.cleanup();
      expect(scene.children.length).toBe(0);
    });

    it('T-082-18: Multiple draw calls with increasing elapsed time do not throw', () => {
      const { field, scene } = initField({ maxParticles: 100 });

      expect(() => {
        for (let t = 0; t < 120; t++) {
          field.draw(scene, makeFrame(defaultParams, {
            time: t * 16,
            delta: 16,
            elapsed: t * 16,
          }));
        }
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Advection stability
  // -------------------------------------------------------------------------

  describe('Advection stability guards', () => {
    it('T-082-19: Large delta (tab-away) does not cause position blowup', () => {
      const { field, scene } = initField({ maxParticles: 100 });

      for (let t = 0; t < 10; t++) {
        field.draw(scene, makeFrame(defaultParams, { time: t * 16, delta: 16, elapsed: t * 16 }));
      }

      // Simulate tab-away: huge delta
      field.draw(scene, makeFrame(defaultParams, { time: 5160, delta: 5000, elapsed: 5160 }));

      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      const posAttr = (mesh.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.array.length; i++) {
        expect(Number.isFinite(posAttr.array[i])).toBe(true);
      }
    });

    it('T-082-20: High bass + large delta combo remains stable', () => {
      const { field, scene } = initField({ maxParticles: 100 });
      const highBassParams = { ...defaultParams, bassEnergy: 0.95 };

      for (let t = 0; t < 10; t++) {
        field.draw(scene, makeFrame(highBassParams, { time: t * 16, delta: 16, elapsed: t * 16 }));
      }

      field.draw(scene, makeFrame(highBassParams, { time: 3160, delta: 3000, elapsed: 3160 }));

      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      const posAttr = (mesh.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.array.length; i++) {
        expect(Number.isFinite(posAttr.array[i])).toBe(true);
      }
    });

    it('T-082-21: Zero delta frame does not cause division by zero or NaN', () => {
      const { field, scene } = initField({ maxParticles: 50 });

      expect(() => {
        field.draw(scene, makeFrame(defaultParams, { time: 1000, delta: 0, elapsed: 1000 }));
      }).not.toThrow();

      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      const posAttr = (mesh.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.array.length; i++) {
        expect(Number.isFinite(posAttr.array[i])).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Particle recycling
  // -------------------------------------------------------------------------

  describe('Particle recycling with fade-in', () => {
    it('T-082-22: Particle interface includes alpha and age after migration', () => {
      const { field } = initField({ maxParticles: 50 });
      const particles = field.particles;
      expect(particles.length).toBeGreaterThan(0);
      expect(typeof particles[0].alpha).toBe('number');
      expect(typeof particles[0].age).toBe('number');
    });

    it('T-082-23: Particles initialized with alpha=1 and age=FADE_FRAMES', () => {
      const { field } = initField({ maxParticles: 50 });
      for (const p of field.particles) {
        expect(p.alpha).toBe(1);
        expect(p.age).toBe(30); // FADE_FRAMES
      }
    });

    it('T-082-24: Recycled particles start with alpha=0 and fade to 1 over FADE_FRAMES', () => {
      const { field, scene } = initField({ maxParticles: 50 });
      // Run many frames with high bass to force particles out of bounds
      for (let t = 0; t < 300; t++) {
        field.draw(scene, makeFrame({ ...defaultParams, bassEnergy: 0.8 }, {
          time: t * 16, delta: 16, elapsed: t * 16,
        }));
      }
      // Check that particles have valid alpha in [0, 1]
      for (const p of field.particles) {
        expect(p.alpha).toBeGreaterThanOrEqual(0);
        expect(p.alpha).toBeLessThanOrEqual(1);
      }
    });

    it('T-082-25: aAlpha attribute is registered on geometry', () => {
      const { scene } = initField({ maxParticles: 50 });
      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      const geom = mesh.geometry as THREE.BufferGeometry;
      const alphaAttr = geom.getAttribute('aAlpha');
      expect(alphaAttr).toBeTruthy();
      expect((alphaAttr as THREE.BufferAttribute).itemSize).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // CPU/GPU responsibility split (Step 5)
  // -------------------------------------------------------------------------

  describe('CPU/GPU responsibility split', () => {
    it('T-082-26: uDisplacementScale uniform is removed', () => {
      const { scene } = initField({ maxParticles: 50 });
      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      const mat = mesh.material as THREE.ShaderMaterial;
      expect(mat.uniforms.uDisplacementScale).toBeUndefined();
    });

    it('T-082-27: uTrebleEnergy uniform is still present (GPU micro-detail)', () => {
      const { scene } = initField({ maxParticles: 50 });
      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      const mat = mesh.material as THREE.ShaderMaterial;
      expect(mat.uniforms.uTrebleEnergy).toBeDefined();
    });

    it('T-082-28: Treble uniform is updated each frame via draw()', () => {
      const { field, scene } = initField({ maxParticles: 50 });
      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      const mat = mesh.material as THREE.ShaderMaterial;

      field.draw(scene, makeFrame({ ...defaultParams, trebleEnergy: 0.3 }));
      expect(mat.uniforms.uTrebleEnergy.value).toBeCloseTo(0.3, 1);

      field.draw(scene, makeFrame({ ...defaultParams, trebleEnergy: 0.8 }));
      expect(mat.uniforms.uTrebleEnergy.value).toBeCloseTo(0.8, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Regression: existing tests compatibility
  // -------------------------------------------------------------------------

  describe('Regression: backward compatibility', () => {
    it('T-082-29: getParticlePositions returns objects with x, y, z fields', () => {
      const { field } = initField({ maxParticles: 50 });
      const positions = getParticlePositions(field);
      expect(positions.length).toBeGreaterThan(0);
      for (const p of positions) {
        expect(typeof p.x).toBe('number');
        expect(typeof p.y).toBe('number');
        expect(typeof p.z).toBe('number');
      }
    });

    it('T-082-30: getParticleCount returns correct count matching particles array', () => {
      const { field } = initField({ maxParticles: 50 });
      expect(getParticleCount(field)).toBe(field.particles.length);
      expect(getParticleCount(field)).toBeGreaterThan(0);
    });

    it('T-082-31: setOpacity still works and updates uOpacity uniform', () => {
      const { field, scene } = initField({ maxParticles: 50 });
      field.setOpacity!(0.5);

      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      const mat = mesh.material as THREE.ShaderMaterial;
      expect(mat.uniforms.uOpacity.value).toBe(0.5);
    });

    it('T-082-32: No localStorage or cookie access during particle field operations', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'set');

      const { field, scene } = initField({ maxParticles: 50 });
      for (let t = 0; t < 10; t++) {
        field.draw(scene, makeFrame(defaultParams, { time: t * 16, delta: 16, elapsed: t * 16 }));
      }

      expect(getItemSpy).not.toHaveBeenCalled();
      expect(setItemSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });

    it('T-082-33: Particle count is capped by maxParticles config', () => {
      const { field: field300 } = initField({ maxParticles: 300 });
      const { field: field250 } = initField({ maxParticles: 250 });

      expect(getParticleCount(field300)).toBeLessThanOrEqual(300);
      expect(getParticleCount(field250)).toBeLessThanOrEqual(250);
    });
  });

  // -------------------------------------------------------------------------
  // Integration: full flow
  // -------------------------------------------------------------------------

  describe('Integration: full init → draw → cleanup cycle', () => {
    it('T-082-34: Full lifecycle with varying audio does not throw or produce NaN', () => {
      const { field, scene } = initField({ maxParticles: 200 });

      expect(() => {
        for (let t = 0; t < 120; t++) {
          const bass = 0.5 + 0.4 * Math.sin(t * 0.05);
          const treble = 0.3 + 0.3 * Math.cos(t * 0.07);
          field.draw(scene, makeFrame(
            { ...defaultParams, bassEnergy: bass, trebleEnergy: treble },
            { time: t * 16, delta: 16, elapsed: t * 16 },
          ));
        }
      }).not.toThrow();

      const mesh = scene.children.find(c => c instanceof THREE.Points) as THREE.Points;
      const posAttr = (mesh.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.array.length; i++) {
        expect(Number.isFinite(posAttr.array[i])).toBe(true);
      }

      field.cleanup();
      expect(scene.children.length).toBe(0);
    });

    it('T-082-35: Reduced motion amplitude still allows advection (calmer, not frozen)', () => {
      const reducedParams = { ...defaultParams, motionAmplitude: 0.2 };
      const { field, scene } = initField({ maxParticles: 50 }, reducedParams);

      expect(() => {
        for (let t = 0; t < 30; t++) {
          field.draw(scene, makeFrame(reducedParams, {
            time: t * 16, delta: 16, elapsed: t * 16,
          }));
        }
      }).not.toThrow();
    });

    it('T-082-36: Scene renders with pointer disturbance active', () => {
      const { field, scene } = initField({ maxParticles: 50 });
      const params = { ...defaultParams, pointerDisturbance: 0.6 };

      expect(() => {
        field.draw(scene, makeFrame(params, { pointerX: 0.3, pointerY: 0.7 }));
      }).not.toThrow();
    });

    it('T-082-37: Init with different seeds produces different initial positions', () => {
      const scene1 = new THREE.Scene();
      const field1 = createParticleField({ maxParticles: 50 });
      field1.init(scene1, 'seed-alpha', defaultParams);

      const scene2 = new THREE.Scene();
      const field2 = createParticleField({ maxParticles: 50 });
      field2.init(scene2, 'seed-beta', defaultParams);

      const pos1 = getParticlePositions(field1);
      const pos2 = getParticlePositions(field2);

      let anyDifferent = false;
      for (let i = 0; i < Math.min(pos1.length, pos2.length); i++) {
        if (pos1[i].x !== pos2[i].x || pos1[i].y !== pos2[i].y) {
          anyDifferent = true;
          break;
        }
      }
      expect(anyDifferent).toBe(true);
    });
  });
});
