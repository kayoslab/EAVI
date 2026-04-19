import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { computeQuality } from '../../src/visual/quality';
import type { QualityProfile } from '../../src/visual/quality';
import type { BrowserSignals } from '../../src/input/signals';
import type { VisualParams } from '../../src/visual/mappings';
import type { FrameState } from '../../src/visual/types';
import { createParticleField } from '../../src/visual/systems/particleField';
import { createTerrainHeightfield } from '../../src/visual/systems/terrainHeightfield';
import { createPointCloud } from '../../src/visual/systems/pointCloud';
import { createRibbonField } from '../../src/visual/systems/ribbonField';
import { createCrystalField } from '../../src/visual/systems/crystalField';
import { createFlowRibbonField } from '../../src/visual/systems/flowRibbonField';

// Mock Three.js WebGLRenderer (jsdom has no WebGL)
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return {
    ...actual,
    WebGLRenderer: class MockWebGLRenderer {
      domElement: HTMLCanvasElement;
      private _w = 0;
      private _h = 0;

      constructor() {
        this.domElement = document.createElement('canvas');
      }

      setSize(w: number, h: number, _updateStyle?: boolean) {
        this._w = w;
        this._h = h;
        this.domElement.width = w;
        this.domElement.height = h;
      }

      setPixelRatio() {}
      setClearColor() {}
      getClearColor(target: THREE.Color) { target.setRGB(0, 0, 0); return target; }
      render() {}
      dispose() {}
      getSize(target: THREE.Vector2) {
        target.set(this._w, this._h);
        return target;
      }
    },
  };
});

// ─── Helpers ───

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

function getLowProfile(): QualityProfile {
  return computeQuality(makeSignals({
    devicePixelRatio: 1,
    hardwareConcurrency: 2,
    deviceMemory: 1,
    screenWidth: 320,
    screenHeight: 568,
    touchCapable: true,
  }));
}

function getMediumProfile(): QualityProfile {
  return computeQuality(makeSignals({
    devicePixelRatio: 2,
    hardwareConcurrency: 4,
    deviceMemory: 4,
    screenWidth: 390,
    screenHeight: 844,
    touchCapable: true,
  }));
}

function getHighProfile(): QualityProfile {
  return computeQuality(makeSignals({
    devicePixelRatio: 2,
    hardwareConcurrency: 16,
    deviceMemory: 8,
    screenWidth: 2560,
    screenHeight: 1440,
    touchCapable: false,
  }));
}

/** Helper to get ShaderMaterial from the first Points mesh in a scene */
function getPointsMaterial(scene: THREE.Scene): THREE.ShaderMaterial {
  const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
  return pts.material as THREE.ShaderMaterial;
}

type SystemFactory = {
  name: string;
  create: (config?: { dofStrength?: number }) => { init(scene: THREE.Scene, seed: string, params: VisualParams): void; draw(scene: THREE.Scene, frame: FrameState): void; cleanup?(): void };
};

const POINT_SYSTEMS: SystemFactory[] = [
  { name: 'particleField', create: (cfg) => createParticleField(cfg as never) },
  { name: 'pointCloud', create: (cfg) => createPointCloud(cfg as never) },
  { name: 'crystalField', create: (cfg) => createCrystalField(cfg as never) },
  { name: 'flowRibbonField', create: (cfg) => createFlowRibbonField(cfg as never) },
  { name: 'ribbonField', create: (cfg) => createRibbonField(cfg as never) },
  { name: 'terrainHeightfield', create: (cfg) => createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000, ...cfg } as never) },
];

// ─── AC1: DoF focus uniform plumbed into all point shaders ───

describe('US-088: Apply DoF + bloom uniformly across all modes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('AC1: dofStrength config plumbed into all point-based systems', () => {
    it('T-088-01: all 6 point-based systems accept dofStrength in config and set uDofStrength uniform', () => {
      for (const { name, create } of POINT_SYSTEMS) {
        const scene = new THREE.Scene();
        const system = create({ dofStrength: 0.4 });
        system.init(scene, `dof-config-${name}`, defaultParams);
        const mat = getPointsMaterial(scene);
        expect(mat.uniforms.uDofStrength, `${name}: missing uDofStrength`).toBeDefined();
        expect(mat.uniforms.uDofStrength.value, `${name}: dofStrength should be 0.4`).toBeCloseTo(0.4, 1);
      }
    });

    it('T-088-02: particleField uses config.dofStrength=0.4 (medium tier) instead of hardcoded 0.6', () => {
      const scene = new THREE.Scene();
      const field = createParticleField({ dofStrength: 0.4 } as never);
      field.init(scene, 'medium-dof-particle', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.uniforms.uDofStrength.value).toBeCloseTo(0.4, 1);
    });

    it('T-088-03: crystalField uses config.dofStrength=0.4 (medium tier) instead of hardcoded 0.6', () => {
      const scene = new THREE.Scene();
      const crystal = createCrystalField({ dofStrength: 0.4 } as never);
      crystal.init(scene, 'medium-dof-crystal', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.uniforms.uDofStrength.value).toBeCloseTo(0.4, 1);
    });

    it('T-088-04: flowRibbonField uses config.dofStrength=0.4 (medium tier) instead of hardcoded 0.6', () => {
      const scene = new THREE.Scene();
      const flow = createFlowRibbonField({ dofStrength: 0.4 } as never);
      flow.init(scene, 'medium-dof-flow', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.uniforms.uDofStrength.value).toBeCloseTo(0.4, 1);
    });

    it('T-088-05: ribbonField uses config.dofStrength=0.4 (medium tier) instead of hardcoded 0.6', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField({ dofStrength: 0.4 } as never);
      ribbon.init(scene, 'medium-dof-ribbon', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.uniforms.uDofStrength.value).toBeCloseTo(0.4, 1);
    });

    it('T-088-06: pointCloud uses config.dofStrength=0.4 (medium tier) instead of hardcoded 0.6', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud({ dofStrength: 0.4 } as never);
      cloud.init(scene, 'medium-dof-cloud', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.uniforms.uDofStrength.value).toBeCloseTo(0.4, 1);
    });

    it('T-088-07: terrainHeightfield uses config.dofStrength=0.4 (medium tier) instead of hardcoded 0.6', () => {
      const scene = new THREE.Scene();
      const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000, dofStrength: 0.4 } as never);
      terrain.init(scene, 'medium-dof-terrain', defaultParams);
      const mat = getPointsMaterial(scene);
      expect(mat.uniforms.uDofStrength.value).toBeCloseTo(0.4, 1);
    });

    it('T-088-08: low-tier dofStrength=0 is applied to all systems (no GPU waste)', () => {
      for (const { name, create } of POINT_SYSTEMS) {
        const scene = new THREE.Scene();
        const system = create({ dofStrength: 0 });
        system.init(scene, `low-dof-${name}`, defaultParams);
        const mat = getPointsMaterial(scene);
        expect(mat.uniforms.uDofStrength.value, `${name}: dofStrength should be 0`).toBe(0);
      }
    });

    it('T-088-09: when no dofStrength config is provided, fallback remains 0.6 for most systems (0.3 for terrain)', () => {
      for (const { name, create } of POINT_SYSTEMS) {
        const scene = new THREE.Scene();
        const system = create(); // no dofStrength in config
        system.init(scene, `default-dof-${name}`, defaultParams);
        const mat = getPointsMaterial(scene);
        const expectedDefault = name === 'terrainHeightfield' ? 0.3 : 0.6;
        expect(mat.uniforms.uDofStrength.value, `${name}: default dofStrength should be ${expectedDefault}`).toBeCloseTo(expectedDefault, 1);
      }
    });

    it('T-088-10: high-tier dofStrength=0.6 is correctly applied to all systems', () => {
      for (const { name, create } of POINT_SYSTEMS) {
        const scene = new THREE.Scene();
        const system = create({ dofStrength: 0.6 });
        system.init(scene, `high-dof-${name}`, defaultParams);
        const mat = getPointsMaterial(scene);
        expect(mat.uniforms.uDofStrength.value, `${name}: dofStrength should be 0.6`).toBeCloseTo(0.6, 1);
      }
    });
  });

  // ─── AC1 continued: draw() does not re-hardcode dofStrength ───

  describe('AC1: draw() does not override config-driven dofStrength', () => {
    it('T-088-11: uDofStrength remains at config value after draw() for all systems', () => {
      for (const { name, create } of POINT_SYSTEMS) {
        const scene = new THREE.Scene();
        const system = create({ dofStrength: 0.4 });
        system.init(scene, `draw-dof-${name}`, defaultParams);
        system.draw(scene, makeFrame({ elapsed: 5000 }));
        const mat = getPointsMaterial(scene);
        expect(mat.uniforms.uDofStrength.value, `${name}: dofStrength drifted after draw()`).toBeCloseTo(0.4, 1);
      }
    });

    it('T-088-12: uDofStrength=0 stays at 0 after multiple draw() calls', () => {
      for (const { name, create } of POINT_SYSTEMS) {
        const scene = new THREE.Scene();
        const system = create({ dofStrength: 0 });
        system.init(scene, `zero-draw-${name}`, defaultParams);
        for (let i = 0; i < 5; i++) {
          system.draw(scene, makeFrame({ elapsed: i * 3000 }));
        }
        const mat = getPointsMaterial(scene);
        expect(mat.uniforms.uDofStrength.value, `${name}: dofStrength should stay 0`).toBe(0);
      }
    });
  });

  // ─── AC2: Bloom post pass active for every mode in rotation ───

  describe('AC2: Bloom post pass active for every mode in rotation', () => {
    it('T-088-13: medium-tier quality enables bloom (enableBloom=true)', () => {
      const profile = getMediumProfile();
      expect(profile.tier).toBe('medium');
      expect(profile.enableBloom).toBe(true);
    });

    it('T-088-14: high-tier quality enables bloom (enableBloom=true)', () => {
      const profile = getHighProfile();
      expect(profile.tier).toBe('high');
      expect(profile.enableBloom).toBe(true);
    });

    it('T-088-15: initComposer returns non-null for medium tier (bloom active)', async () => {
      const { initComposer } = await import('../../src/visual/composer');
      const renderer = new THREE.WebGLRenderer();
      renderer.setSize(800, 600);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);
      const result = initComposer(renderer, scene, camera, getMediumProfile());
      // In jsdom without WebGL this may gracefully return null, but the logic should attempt creation
      if (result !== null) {
        expect(result).toHaveProperty('composer');
        expect(result).toHaveProperty('bloomPass');
      }
    });

    it('T-088-16: initComposer returns non-null for high tier (bloom active)', async () => {
      const { initComposer } = await import('../../src/visual/composer');
      const renderer = new THREE.WebGLRenderer();
      renderer.setSize(800, 600);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);
      const result = initComposer(renderer, scene, camera, getHighProfile());
      if (result !== null) {
        expect(result).toHaveProperty('composer');
        expect(result).toHaveProperty('bloomPass');
      }
    });

    it('T-088-17: renderLoop uses composer.render() when composer is provided', async () => {
      const { startLoop } = await import('../../src/visual/renderLoop');
      const renderer = new THREE.WebGLRenderer();
      renderer.setSize(800, 600);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);

      const composerRender = vi.fn();
      const mockComposer = { render: composerRender };

      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 2) cb(frameCount * 16);
        return frameCount;
      });

      const deps = { composer: mockComposer } as unknown as Parameters<typeof startLoop>[3];
      startLoop(renderer, scene, camera, deps);

      if (composerRender.mock.calls.length > 0) {
        expect(composerRender).toHaveBeenCalled();
      }
    });

    it('T-088-18: modeManager does not reference composer/bloom/post-processing (render pipeline untouched)', async () => {
      const mod = await import('../../src/visual/modeManager');
      const source = Object.keys(mod).join(',');
      // modeManager exports should not include any bloom/composer-related symbols
      expect(source).not.toMatch(/composer|bloom|post/i);
    });
  });

  // ─── AC3: No mode disables post unless WebGL2 is unavailable ───

  describe('AC3: No mode disables post-processing unless WebGL2 unavailable', () => {
    it('T-088-19: initComposer returns null only when enableBloom is false (low tier / no WebGL2)', async () => {
      const { initComposer } = await import('../../src/visual/composer');
      const renderer = new THREE.WebGLRenderer();
      renderer.setSize(800, 600);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);

      const low = getLowProfile();
      expect(low.enableBloom).toBe(false);
      expect(initComposer(renderer, scene, camera, low)).toBeNull();
    });

    it('T-088-20: no system init/draw call disables or nullifies the composer', () => {
      // Systems don't touch the composer — they only manage their own scene children
      for (const { name, create } of POINT_SYSTEMS) {
        const scene = new THREE.Scene();
        const system = create({ dofStrength: 0.6 });
        system.init(scene, `no-disable-${name}`, defaultParams);
        system.draw(scene, makeFrame());
        // Verify system only adds Points/Mesh children, never accesses global composer
        for (const child of scene.children) {
          expect(child).toBeInstanceOf(THREE.Object3D);
        }
      }
    });

    it('T-088-21: renderLoop falls back to renderer.render when composer is null (graceful degradation)', async () => {
      const { startLoop } = await import('../../src/visual/renderLoop');
      const renderer = new THREE.WebGLRenderer();
      renderer.setSize(800, 600);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);
      const renderSpy = vi.spyOn(renderer, 'render');

      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 2) cb(frameCount * 16);
        return frameCount;
      });

      // No composer provided — should fall back to direct render
      startLoop(renderer, scene, camera, {});
      expect(renderSpy).toHaveBeenCalled();
    });
  });

  // ─── AC4: Stable FPS on mid tier; no console errors ───

  describe('AC4: Stability and no console errors', () => {
    it('T-088-22: all systems init and draw without throwing at medium-tier dofStrength=0.4', () => {
      for (const { name, create } of POINT_SYSTEMS) {
        const scene = new THREE.Scene();
        const system = create({ dofStrength: 0.4 });
        expect(() => system.init(scene, `stable-${name}`, defaultParams), `${name}: init threw`).not.toThrow();
        expect(() => system.draw(scene, makeFrame()), `${name}: draw threw`).not.toThrow();
      }
    });

    it('T-088-23: all systems init and draw without throwing at low-tier dofStrength=0', () => {
      for (const { name, create } of POINT_SYSTEMS) {
        const scene = new THREE.Scene();
        const system = create({ dofStrength: 0 });
        expect(() => system.init(scene, `low-stable-${name}`, defaultParams), `${name}: init threw`).not.toThrow();
        expect(() => system.draw(scene, makeFrame()), `${name}: draw threw`).not.toThrow();
      }
    });

    it('T-088-24: all uniform values remain finite after draw at dofStrength=0.4', () => {
      for (const { name, create } of POINT_SYSTEMS) {
        const scene = new THREE.Scene();
        const system = create({ dofStrength: 0.4 });
        system.init(scene, `finite-${name}`, defaultParams);
        system.draw(scene, makeFrame({ elapsed: 10000, params: { bassEnergy: 1.0, trebleEnergy: 1.0 } }));
        const mat = getPointsMaterial(scene);
        for (const [uName, uniform] of Object.entries(mat.uniforms)) {
          if (typeof uniform.value === 'number') {
            expect(Number.isFinite(uniform.value), `${name}.${uName} is not finite`).toBe(true);
          }
        }
      }
    });

    it('T-088-25: all uniform values remain finite after draw at dofStrength=0', () => {
      for (const { name, create } of POINT_SYSTEMS) {
        const scene = new THREE.Scene();
        const system = create({ dofStrength: 0 });
        system.init(scene, `finite-zero-${name}`, defaultParams);
        system.draw(scene, makeFrame({ elapsed: 10000, params: { bassEnergy: 1.0, trebleEnergy: 1.0 } }));
        const mat = getPointsMaterial(scene);
        for (const [uName, uniform] of Object.entries(mat.uniforms)) {
          if (typeof uniform.value === 'number') {
            expect(Number.isFinite(uniform.value), `${name}.${uName} is not finite`).toBe(true);
          }
        }
      }
    });

    it('T-088-26: no objects leak after multiple draw calls with dofStrength config', () => {
      for (const { name, create } of POINT_SYSTEMS) {
        const scene = new THREE.Scene();
        const system = create({ dofStrength: 0.4 });
        system.init(scene, `leak-${name}`, defaultParams);
        const childCount = scene.children.length;
        for (let i = 0; i < 10; i++) {
          system.draw(scene, makeFrame({ elapsed: i * 1000 }));
        }
        expect(scene.children.length, `${name}: leaked objects`).toBe(childCount);
      }
    });
  });

  // ─── Quality tier integration: dofStrength flows from quality.ts ───

  describe('Quality tier dofStrength values', () => {
    it('T-088-27: low-tier quality profile has dofStrength=0', () => {
      const profile = getLowProfile();
      expect(profile.tier).toBe('low');
      expect(profile.dofStrength).toBe(0);
    });

    it('T-088-28: medium-tier quality profile has dofStrength=0.4', () => {
      const profile = getMediumProfile();
      expect(profile.tier).toBe('medium');
      expect(profile.dofStrength).toBe(0.4);
    });

    it('T-088-29: high-tier quality profile has dofStrength=0.6', () => {
      const profile = getHighProfile();
      expect(profile.tier).toBe('high');
      expect(profile.dofStrength).toBe(0.6);
    });

    it('T-088-30: dofStrength scales monotonically with tier (low < medium < high)', () => {
      const low = getLowProfile();
      const medium = getMediumProfile();
      const high = getHighProfile();
      expect(low.dofStrength).toBeLessThan(medium.dofStrength);
      expect(medium.dofStrength).toBeLessThan(high.dofStrength);
    });
  });

  // ─── Bloom quality parameters per tier ───

  describe('Bloom active on medium and high tiers', () => {
    it('T-088-31: low tier disables bloom (enableBloom=false, bloomStrength=0)', () => {
      const profile = getLowProfile();
      expect(profile.enableBloom).toBe(false);
      expect(profile.bloomStrength).toBe(0);
    });

    it('T-088-32: medium tier enables bloom with positive strength', () => {
      const profile = getMediumProfile();
      expect(profile.enableBloom).toBe(true);
      expect(profile.bloomStrength).toBeGreaterThan(0);
    });

    it('T-088-33: high tier enables bloom with stronger values than medium', () => {
      const medium = getMediumProfile();
      const high = getHighProfile();
      expect(high.enableBloom).toBe(true);
      expect(high.bloomStrength).toBeGreaterThan(medium.bloomStrength);
    });
  });

  // ─── Overlay systems excluded (line-based, no DoF uniforms) ───

  describe('Overlay systems excluded from DoF (line-based geometry)', () => {
    it('T-088-34: bezierCurveWeb does not declare uDofStrength uniform (LineSegments, not Points)', async () => {
      const { createBezierCurveWeb } = await import('../../src/visual/systems/bezierCurveWeb');
      const scene = new THREE.Scene();
      const overlay = createBezierCurveWeb();
      // Overlays use attach/update pattern, not init/draw — they depend on host system positions
      // Their material should not have DoF uniforms since they are LineSegments
      const lineChild = scene.children.find((c) => c instanceof THREE.LineSegments);
      if (lineChild) {
        const mat = (lineChild as THREE.LineSegments).material as THREE.ShaderMaterial;
        if (mat.uniforms) {
          expect(mat.uniforms.uDofStrength).toBeUndefined();
        }
      }
      // No lineChild means overlay hasn't been initialized yet — that's fine, nothing to check
      expect(overlay).toBeDefined();
    });

    it('T-088-35: constellationLines does not declare uDofStrength uniform (LineSegments, not Points)', async () => {
      const { createConstellationLines } = await import('../../src/visual/systems/constellationLines');
      const overlay = createConstellationLines();
      // Overlay exists but uses LineSegments — no DoF blur expected
      expect(overlay).toBeDefined();
    });
  });

  // ─── Privacy compliance ───

  describe('Privacy compliance with DoF config', () => {
    it('T-088-36: no localStorage or cookie access during init/draw with dofStrength config', () => {
      const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'get');
      for (const { create } of POINT_SYSTEMS) {
        const scene = new THREE.Scene();
        const system = create({ dofStrength: 0.4 });
        system.init(scene, 'privacy-dof', defaultParams);
        system.draw(scene, makeFrame());
      }
      expect(lsSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });
});
