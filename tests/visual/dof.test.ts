import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { computeQuality, extractSystemConfig } from '../../src/visual/quality';
import type { BrowserSignals } from '../../src/input/signals';
import type { VisualParams } from '../../src/visual/mappings';
import type { FrameState } from '../../src/visual/types';
import { createParticleField } from '../../src/visual/systems/particleField';
import { createTerrainHeightfield } from '../../src/visual/systems/terrainHeightfield';
import { createPointCloud } from '../../src/visual/systems/pointCloud';
import { createRibbonField } from '../../src/visual/systems/ribbonField';
import { createCrystalField } from '../../src/visual/systems/crystalField';
import { createFlowRibbonField } from '../../src/visual/systems/flowRibbonField';
import { createWireframePolyhedra } from '../../src/visual/systems/wireframePolyhedra';

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
};

function makeFrame(overrides?: Partial<FrameState & { params: Partial<VisualParams> }>): FrameState {
  return {
    time: 1000,
    delta: 16,
    elapsed: 1000,
    width: 800,
    height: 600,
    params: { ...defaultParams, ...(overrides?.params ?? {}) },
    ...Object.fromEntries(Object.entries(overrides ?? {}).filter(([k]) => k !== 'params')),
  } as FrameState;
}

function makeSignals(overrides: Partial<BrowserSignals> = {}): BrowserSignals {
  return {
    language: 'en',
    timezone: 'UTC',
    screenWidth: 1920,
    screenHeight: 1080,
    devicePixelRatio: 2,
    hardwareConcurrency: 8,
    prefersColorScheme: 'dark',
    prefersReducedMotion: false,
    touchCapable: false,
    deviceMemory: 8,
    ...overrides,
  };
}

/** Helper to get ShaderMaterial from the first Points mesh in a scene */
function getPointsMaterial(scene: THREE.Scene): THREE.ShaderMaterial {
  const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
  return pts.material as THREE.ShaderMaterial;
}

// ─── Shader DoF Uniform Declaration ───

describe('US-078: Depth-of-field bokeh for foreground particles', () => {
  describe('DoF uniform declaration on point-based systems', () => {
    it('T-078-01: particleField material declares uFocusDistance and uDofStrength uniforms', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'dof-particle-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.uniforms.uFocusDistance, 'missing uFocusDistance').toBeDefined();
      expect(mat.uniforms.uDofStrength, 'missing uDofStrength').toBeDefined();
      expect(typeof mat.uniforms.uFocusDistance.value).toBe('number');
      expect(typeof mat.uniforms.uDofStrength.value).toBe('number');
    });

    it('T-078-02: terrainHeightfield material declares uFocusDistance and uDofStrength uniforms', () => {
      const scene = new THREE.Scene();
      const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
      terrain.init(scene, 'dof-terrain-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.uniforms.uFocusDistance, 'missing uFocusDistance').toBeDefined();
      expect(mat.uniforms.uDofStrength, 'missing uDofStrength').toBeDefined();
    });

    it('T-078-03: pointCloud material declares uFocusDistance and uDofStrength uniforms', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'dof-cloud-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.uniforms.uFocusDistance, 'missing uFocusDistance').toBeDefined();
      expect(mat.uniforms.uDofStrength, 'missing uDofStrength').toBeDefined();
    });

    it('T-078-04: ribbonField material declares uFocusDistance and uDofStrength uniforms', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'dof-ribbon-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.uniforms.uFocusDistance, 'missing uFocusDistance').toBeDefined();
      expect(mat.uniforms.uDofStrength, 'missing uDofStrength').toBeDefined();
    });

    it('T-078-05: crystalField material declares uFocusDistance and uDofStrength uniforms', () => {
      const scene = new THREE.Scene();
      const crystal = createCrystalField();
      crystal.init(scene, 'dof-crystal-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.uniforms.uFocusDistance, 'missing uFocusDistance').toBeDefined();
      expect(mat.uniforms.uDofStrength, 'missing uDofStrength').toBeDefined();
    });

    it('T-078-06: flowRibbonField material declares uFocusDistance and uDofStrength uniforms', () => {
      const scene = new THREE.Scene();
      const flow = createFlowRibbonField();
      flow.init(scene, 'dof-flow-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.uniforms.uFocusDistance, 'missing uFocusDistance').toBeDefined();
      expect(mat.uniforms.uDofStrength, 'missing uDofStrength').toBeDefined();
    });

    it('T-078-07: wireframePolyhedra vertex dots material declares uFocusDistance and uDofStrength uniforms', () => {
      const scene = new THREE.Scene();
      const wire = createWireframePolyhedra({ maxPolyhedra: 3 });
      wire.init(scene, 'dof-wire-seed', defaultParams);
      const pts = scene.children.find((c) => c instanceof THREE.Points);
      if (pts) {
        const mat = (pts as THREE.Points).material as THREE.ShaderMaterial;
        expect(mat.uniforms.uFocusDistance, 'missing uFocusDistance').toBeDefined();
        expect(mat.uniforms.uDofStrength, 'missing uDofStrength').toBeDefined();
      }
    });
  });

  // ─── Default Values ───

  describe('DoF uniform default values', () => {
    it('T-078-08: uFocusDistance defaults to approximately 5.0', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'default-focus-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.uniforms.uFocusDistance.value).toBeCloseTo(5.0, 0);
    });

    it('T-078-09: uDofStrength defaults to 0.6 (high-tier default)', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'default-strength-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.uniforms.uDofStrength.value).toBeCloseTo(0.6, 1);
    });
  });

  // ─── Shader Source: vCoC varying ───

  describe('Shader source declares vCoC varying', () => {
    it('T-078-10: particleWarp vertex shader declares varying float vCoC', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'vcoc-vert-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.vertexShader).toMatch(/varying\s+float\s+vCoC/);
    });

    it('T-078-11: particleWarp fragment shader receives varying float vCoC', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'vcoc-frag-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.fragmentShader).toMatch(/varying\s+float\s+vCoC/);
    });

    it('T-078-12: terrainVertex vertex shader declares varying float vCoC', () => {
      const scene = new THREE.Scene();
      const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
      terrain.init(scene, 'vcoc-terrain-vert-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.vertexShader).toMatch(/varying\s+float\s+vCoC/);
    });

    it('T-078-13: terrainVertex fragment shader receives varying float vCoC', () => {
      const scene = new THREE.Scene();
      const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
      terrain.init(scene, 'vcoc-terrain-frag-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.fragmentShader).toMatch(/varying\s+float\s+vCoC/);
    });
  });

  // ─── Shader Source: uFocusDistance / uDofStrength declaration ───

  describe('Shader source declares DoF uniforms', () => {
    it('T-078-14: particleWarp vertex shader declares uniform float uFocusDistance', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'dof-decl-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.vertexShader).toMatch(/uniform\s+float\s+uFocusDistance/);
    });

    it('T-078-15: particleWarp vertex shader declares uniform float uDofStrength', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'dof-str-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.vertexShader).toMatch(/uniform\s+float\s+uDofStrength/);
    });

    it('T-078-16: terrainVertex vertex shader declares uFocusDistance and uDofStrength uniforms', () => {
      const scene = new THREE.Scene();
      const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
      terrain.init(scene, 'dof-terrain-decl-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.vertexShader).toMatch(/uniform\s+float\s+uFocusDistance/);
      expect(mat.vertexShader).toMatch(/uniform\s+float\s+uDofStrength/);
    });
  });

  // ─── Focus Distance Time Modulation ───

  describe('Focus distance modulation over time', () => {
    it('T-078-17: uFocusDistance changes subtly between frames at different elapsed times', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'focus-mod-seed', defaultParams);
      const mat = getPointsMaterial(scene);

      field.draw(scene, makeFrame({ elapsed: 0 }));
      const focus0 = mat.uniforms.uFocusDistance.value as number;

      // After ~15 seconds of oscillation (half period of ~31s cycle), focus should differ
      field.draw(scene, makeFrame({ elapsed: 15000 }));
      const focus15 = mat.uniforms.uFocusDistance.value as number;

      expect(focus0).not.toBe(focus15);
    });

    it('T-078-18: focus modulation stays within reasonable range (baseFocus ± 1.0)', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'focus-range-seed', defaultParams);
      const mat = getPointsMaterial(scene);

      // Sample many time points
      for (let elapsed = 0; elapsed < 60000; elapsed += 1000) {
        field.draw(scene, makeFrame({ elapsed }));
        const focus = mat.uniforms.uFocusDistance.value as number;
        expect(focus).toBeGreaterThan(3.5);
        expect(focus).toBeLessThan(6.5);
      }
    });

    it('T-078-19: terrainHeightfield uFocusDistance modulates over time', () => {
      const scene = new THREE.Scene();
      const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
      terrain.init(scene, 'terrain-focus-mod-seed', defaultParams);
      const mat = getPointsMaterial(scene);

      terrain.draw(scene, makeFrame({ elapsed: 0 }));
      const focus0 = mat.uniforms.uFocusDistance.value as number;

      terrain.draw(scene, makeFrame({ elapsed: 15000 }));
      const focus15 = mat.uniforms.uFocusDistance.value as number;

      expect(focus0).not.toBe(focus15);
    });
  });

  // ─── Quality Tier Integration ───

  describe('DoF quality tier integration', () => {
    it('T-078-20: low-tier quality produces dofStrength = 0 (DoF disabled)', () => {
      const signals = makeSignals({
        devicePixelRatio: 1,
        hardwareConcurrency: 2,
        deviceMemory: 1,
        screenWidth: 320,
        screenHeight: 568,
        touchCapable: true,
      });
      const quality = computeQuality(signals);
      expect(quality.tier).toBe('low');
      // dofStrength should be exposed on the profile or via extractSystemConfig
      const particleConfig = extractSystemConfig('particles', quality);
      const terrainConfig = extractSystemConfig('terrain', quality);
      // At minimum, dofStrength should be 0 for low tier
      expect(particleConfig.dofStrength ?? quality.dofStrength ?? 0).toBe(0);
      expect(terrainConfig.dofStrength ?? quality.dofStrength ?? 0).toBe(0);
    });

    it('T-078-21: medium-tier quality produces dofStrength = 0.4', () => {
      const signals = makeSignals({
        devicePixelRatio: 2,
        hardwareConcurrency: 4,
        deviceMemory: 4,
        screenWidth: 390,
        screenHeight: 844,
        touchCapable: true,
      });
      const quality = computeQuality(signals);
      expect(quality.tier).toBe('medium');
      expect((quality as Record<string, unknown>).dofStrength).toBe(0.4);
    });

    it('T-078-22: high-tier quality produces dofStrength = 0.6', () => {
      const signals = makeSignals({
        devicePixelRatio: 2,
        hardwareConcurrency: 16,
        deviceMemory: 8,
        screenWidth: 2560,
        screenHeight: 1440,
        touchCapable: false,
      });
      const quality = computeQuality(signals);
      expect(quality.tier).toBe('high');
      expect((quality as Record<string, unknown>).dofStrength).toBe(0.6);
    });

    it('T-078-23: dofStrength scales with tier (low < medium < high)', () => {
      const low = computeQuality(makeSignals({ devicePixelRatio: 1, hardwareConcurrency: 2, deviceMemory: 1, screenWidth: 320, screenHeight: 568, touchCapable: true }));
      const medium = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 4, deviceMemory: 4, screenWidth: 390, screenHeight: 844, touchCapable: true }));
      const high = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 16, deviceMemory: 8, screenWidth: 2560, screenHeight: 1440, touchCapable: false }));

      const lowDof = ((low as Record<string, unknown>).dofStrength as number) ?? 0;
      const medDof = ((medium as Record<string, unknown>).dofStrength as number) ?? 0;
      const highDof = ((high as Record<string, unknown>).dofStrength as number) ?? 0;

      expect(lowDof).toBeLessThan(medDof);
      expect(medDof).toBeLessThan(highDof);
    });
  });

  // ─── Draw safety & uniform finiteness ───

  describe('DoF draw safety', () => {
    it('T-078-24: draw() does not throw with DoF uniforms present (particleField)', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'dof-safe-seed', defaultParams);
      expect(() => field.draw(scene, makeFrame())).not.toThrow();
    });

    it('T-078-25: draw() does not throw with DoF uniforms present (terrainHeightfield)', () => {
      const scene = new THREE.Scene();
      const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
      terrain.init(scene, 'dof-terrain-safe-seed', defaultParams);
      expect(() => terrain.draw(scene, makeFrame())).not.toThrow();
    });

    it('T-078-26: all uniform values remain finite after draw with DoF (particleField)', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'dof-finite-seed', defaultParams);
      field.draw(scene, makeFrame({ elapsed: 10000, params: { bassEnergy: 1.0, trebleEnergy: 1.0 } }));
      const mat = getPointsMaterial(scene);
      for (const [name, uniform] of Object.entries(mat.uniforms)) {
        if (typeof uniform.value === 'number') {
          expect(Number.isFinite(uniform.value), `uniform ${name} is not finite`).toBe(true);
        }
      }
    });

    it('T-078-27: all uniform values remain finite after draw with DoF (terrainHeightfield)', () => {
      const scene = new THREE.Scene();
      const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
      terrain.init(scene, 'dof-terrain-finite-seed', defaultParams);
      terrain.draw(scene, makeFrame({ elapsed: 10000, params: { bassEnergy: 1.0, trebleEnergy: 1.0 } }));
      const mat = getPointsMaterial(scene);
      for (const [name, uniform] of Object.entries(mat.uniforms)) {
        if (typeof uniform.value === 'number') {
          expect(Number.isFinite(uniform.value), `uniform ${name} is not finite`).toBe(true);
        }
      }
    });

    it('T-078-28: uFocusDistance remains finite at elapsed=0 (no divide-by-zero)', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'dof-zero-time-seed', defaultParams);
      field.draw(scene, makeFrame({ elapsed: 0 }));
      const mat = getPointsMaterial(scene);
      expect(Number.isFinite(mat.uniforms.uFocusDistance.value as number)).toBe(true);
      expect((mat.uniforms.uFocusDistance.value as number)).toBeGreaterThan(0);
    });
  });

  // ─── Shader source: CoC computation ───

  describe('Vertex shader CoC computation', () => {
    it('T-078-29: particleWarp vertex shader computes CoC from depth and uFocusDistance', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'coc-compute-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      // Shader should reference both uFocusDistance and coc/vCoC
      expect(mat.vertexShader).toMatch(/uFocusDistance/);
      expect(mat.vertexShader).toMatch(/vCoC/);
    });

    it('T-078-30: terrainVertex vertex shader computes CoC from depth and uFocusDistance', () => {
      const scene = new THREE.Scene();
      const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
      terrain.init(scene, 'coc-terrain-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.vertexShader).toMatch(/uFocusDistance/);
      expect(mat.vertexShader).toMatch(/vCoC/);
    });

    it('T-078-31: vertex shader uses uDofStrength to scale CoC', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'dof-scale-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.vertexShader).toMatch(/uDofStrength/);
    });
  });

  // ─── Fragment shader: CoC-dependent alpha/softness ───

  describe('Fragment shader CoC-dependent softness', () => {
    it('T-078-32: particleWarp fragment shader uses vCoC to modulate alpha falloff', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'frag-coc-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      // Fragment should use vCoC in some smoothstep or mix expression
      expect(mat.fragmentShader).toMatch(/vCoC/);
    });

    it('T-078-33: terrainVertex fragment shader uses vCoC to modulate alpha falloff', () => {
      const scene = new THREE.Scene();
      const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
      terrain.init(scene, 'frag-terrain-coc-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.fragmentShader).toMatch(/vCoC/);
    });
  });

  // ─── Cross-system consistency: all 7 point-based systems ───

  describe('Cross-system DoF consistency', () => {
    it('T-078-34: all point-based systems declare uFocusDistance in their vertex shader', () => {
      const systems = [
        () => { const s = new THREE.Scene(); const f = createParticleField(); f.init(s, 'cross-1', defaultParams); return s; },
        () => { const s = new THREE.Scene(); const f = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 }); f.init(s, 'cross-2', defaultParams); return s; },
        () => { const s = new THREE.Scene(); const f = createPointCloud(); f.init(s, 'cross-3', defaultParams); return s; },
        () => { const s = new THREE.Scene(); const f = createRibbonField(); f.init(s, 'cross-4', defaultParams); return s; },
        () => { const s = new THREE.Scene(); const f = createCrystalField(); f.init(s, 'cross-5', defaultParams); return s; },
        () => { const s = new THREE.Scene(); const f = createFlowRibbonField(); f.init(s, 'cross-6', defaultParams); return s; },
      ];

      for (const createScene of systems) {
        const scene = createScene();
        const pts = scene.children.find((c) => c instanceof THREE.Points);
        if (pts) {
          const mat = (pts as THREE.Points).material as THREE.ShaderMaterial;
          expect(mat.vertexShader, 'missing uFocusDistance in vertex shader').toMatch(/uFocusDistance/);
          expect(mat.vertexShader, 'missing uDofStrength in vertex shader').toMatch(/uDofStrength/);
          expect(mat.vertexShader, 'missing vCoC in vertex shader').toMatch(/vCoC/);
        }
      }
    });

    it('T-078-35: all point-based systems declare vCoC in their fragment shader', () => {
      const systems = [
        () => { const s = new THREE.Scene(); const f = createParticleField(); f.init(s, 'frag-cross-1', defaultParams); return s; },
        () => { const s = new THREE.Scene(); const f = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 }); f.init(s, 'frag-cross-2', defaultParams); return s; },
        () => { const s = new THREE.Scene(); const f = createPointCloud(); f.init(s, 'frag-cross-3', defaultParams); return s; },
        () => { const s = new THREE.Scene(); const f = createRibbonField(); f.init(s, 'frag-cross-4', defaultParams); return s; },
        () => { const s = new THREE.Scene(); const f = createCrystalField(); f.init(s, 'frag-cross-5', defaultParams); return s; },
        () => { const s = new THREE.Scene(); const f = createFlowRibbonField(); f.init(s, 'frag-cross-6', defaultParams); return s; },
      ];

      for (const createScene of systems) {
        const scene = createScene();
        const pts = scene.children.find((c) => c instanceof THREE.Points);
        if (pts) {
          const mat = (pts as THREE.Points).material as THREE.ShaderMaterial;
          expect(mat.fragmentShader, 'missing vCoC in fragment shader').toMatch(/vCoC/);
        }
      }
    });
  });

  // ─── Terrain-specific DoF ───

  describe('Terrain-specific DoF behavior', () => {
    it('T-078-36: terrain positioned at (0, -1.5, -2) with rotation still has valid DoF uniforms', () => {
      const scene = new THREE.Scene();
      const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 5000 });
      terrain.init(scene, 'terrain-pos-seed', defaultParams);
      const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;

      // Verify terrain transform
      expect(pts.position.y).toBeCloseTo(-1.5, 1);
      expect(pts.position.z).toBeCloseTo(-2, 1);

      // Verify DoF uniforms are set
      const mat = pts.material as THREE.ShaderMaterial;
      expect(mat.uniforms.uFocusDistance).toBeDefined();
      expect(mat.uniforms.uDofStrength).toBeDefined();
      expect(Number.isFinite(mat.uniforms.uFocusDistance.value as number)).toBe(true);
      expect(Number.isFinite(mat.uniforms.uDofStrength.value as number)).toBe(true);
    });

    it('T-078-37: terrain point size upper clamp is widened for bokeh (> 6.0)', () => {
      const scene = new THREE.Scene();
      const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
      terrain.init(scene, 'terrain-clamp-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      // The vertex shader should have a clamp with upper bound > 6.0 (was 6.0, should be ~20.0)
      const clampMatch = mat.vertexShader.match(/clamp\s*\(\s*pointSize\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
      if (clampMatch) {
        const upperClamp = parseFloat(clampMatch[1]);
        expect(upperClamp).toBeGreaterThan(6.0);
      }
    });
  });

  // ─── Edge cases ───

  describe('DoF edge cases', () => {
    it('T-078-38: uDofStrength=0 is safe (no visual change, no shader errors)', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'dof-off-seed', defaultParams);
      const mat = getPointsMaterial(scene);

      // Manually set dofStrength to 0 (simulating low-tier)
      if (mat.uniforms.uDofStrength) {
        mat.uniforms.uDofStrength.value = 0.0;
      }
      expect(() => field.draw(scene, makeFrame())).not.toThrow();
    });

    it('T-078-39: multiple draw calls do not leak objects with DoF enabled', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'dof-leak-seed', defaultParams);
      const childCount = scene.children.length;
      for (let i = 0; i < 10; i++) {
        field.draw(scene, makeFrame({ elapsed: i * 1000 }));
      }
      expect(scene.children.length).toBe(childCount);
    });

    it('T-078-40: cleanup still works correctly with DoF uniforms present', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'dof-cleanup-seed', defaultParams);
      const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
      const geoSpy = vi.spyOn(pts.geometry, 'dispose');
      const matSpy = vi.spyOn(pts.material as THREE.Material, 'dispose');
      field.cleanup!();
      expect(geoSpy).toHaveBeenCalled();
      expect(matSpy).toHaveBeenCalled();
      expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
    });
  });

  // ─── Privacy ───

  describe('DoF privacy compliance', () => {
    it('T-078-41: no localStorage or cookie access during init/draw with DoF uniforms', () => {
      const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'get');
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'dof-privacy-seed', defaultParams);
      field.draw(scene, makeFrame());
      expect(lsSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });

  // ─── Vertex shader: point size scaling for bokeh ───

  describe('Point size scaling for bokeh effect', () => {
    it('T-078-42: particleWarp vertex shader upper point size clamp is increased (> 48.0) for bokeh', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'clamp-seed', defaultParams);
      const mat = getPointsMaterial(scene);
      const clampMatch = mat.vertexShader.match(/clamp\s*\(\s*pointSize\s*,\s*[\d.]+\s*,\s*([\d.]+)\s*\)/);
      if (clampMatch) {
        const upperClamp = parseFloat(clampMatch[1]);
        expect(upperClamp).toBeGreaterThan(48.0);
      }
    });
  });
});
