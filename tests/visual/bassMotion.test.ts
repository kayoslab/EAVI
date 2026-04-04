import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  createParticleField,
} from '../../src/visual/systems/particleField';
import { mapSignalsToVisuals } from '../../src/visual/mappings';
import type { VisualParams } from '../../src/visual/mappings';
import type { BrowserSignals } from '../../src/input/signals';
import type { GeoHint } from '../../src/input/geo';
import type { PointerState } from '../../src/input/pointer';
import { startLoop, type LoopDeps } from '../../src/visual/renderLoop';
import { initCameraMotion, updateCamera, _clearHarmonicCache } from '../../src/visual/cameraMotion';

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return {
    ...actual,
    WebGLRenderer: class MockWebGLRenderer {
      domElement: HTMLCanvasElement;
      constructor() {
        this.domElement = document.createElement('canvas');
        this.domElement.width = 800;
        this.domElement.height = 600;
      }
      setSize(w: number, h: number, _updateStyle?: boolean) {
        this.domElement.width = w;
        this.domElement.height = h;
      }
      setPixelRatio() {}
      setClearColor() {}
      render() {}
      dispose() {}
    },
  };
});

const defaultSignals: BrowserSignals = {
  language: 'en',
  timezone: 'UTC',
  screenWidth: 1024,
  screenHeight: 768,
  devicePixelRatio: 2,
  hardwareConcurrency: 8,
  prefersColorScheme: 'dark',
  prefersReducedMotion: false,
  touchCapable: false,
};

const defaultGeo: GeoHint = { country: 'US', region: 'CA' };

const defaultPointer: PointerState = {
  x: 0.5,
  y: 0.5,
  dx: 0,
  dy: 0,
  speed: 0,
  active: false,
};

const defaultParams: VisualParams = {
  paletteHue: 180,
  paletteSaturation: 0.5,
  cadence: 0.7,
  density: 0.6,
  motionAmplitude: 1.0,
  pointerDisturbance: 0,
  bassEnergy: 0,
  trebleEnergy: 0,
  curveSoftness: 0.3,
  structureComplexity: 0.5,
  noiseFrequency: 1.0,
  radialScale: 1.0,
  twistStrength: 1.0,
  fieldSpread: 1.0,
};

function createTestRenderer() {
  const renderer = new THREE.WebGLRenderer();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);
  return { renderer, scene, camera };
}

/** Helper to access shader uniforms from a particleField's internal Points mesh. */
function getShaderUniforms(scene: THREE.Scene) {
  const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points | undefined;
  if (!points) return null;
  const mat = points.material as THREE.ShaderMaterial;
  return { uniforms: mat.uniforms, mesh: points };
}

describe('US-018: Map bass response to macro motion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-018-01: bass energy > 0 produces greater shader uniform displacement scaling than bass energy = 0', () => {
    const scene = new THREE.Scene();
    const seed = 'bass-displacement-seed';

    const field = createParticleField();
    const initParams = { ...defaultParams, density: 0.5 };
    field.init(scene, seed, initParams);

    // Draw with bassEnergy = 0
    const noBassParams = { ...defaultParams, bassEnergy: 0 };
    field.draw(scene, {
      time: 1000,
      delta: 16,
      elapsed: 1000,
      params: noBassParams,
      width: 800,
      height: 600,
    });

    const result0 = getShaderUniforms(scene)!;
    expect(result0).not.toBeNull();
    const bassUniform0 = result0.uniforms.uBassEnergy.value;
    const rotation0 = result0.mesh.rotation.y;

    // Draw several frames with bassEnergy = 0.8 to accumulate rotation
    const bassParams = { ...defaultParams, bassEnergy: 0.8 };
    let cumulativeRotationBass = 0;
    let cumulativeRotationNoBass = 0;

    for (let t = 1; t <= 10; t++) {
      field.draw(scene, {
        time: t * 100,
        delta: 16,
        elapsed: t * 100,
        params: bassParams,
        width: 800,
        height: 600,
      });
      cumulativeRotationBass += Math.abs(result0.mesh.rotation.y);
    }

    // Reset and draw same frames with no bass
    for (let t = 1; t <= 10; t++) {
      field.draw(scene, {
        time: t * 100,
        delta: 16,
        elapsed: t * 100,
        params: noBassParams,
        width: 800,
        height: 600,
      });
      cumulativeRotationNoBass += Math.abs(result0.mesh.rotation.y);
    }

    // Shader uniform should reflect the bassEnergy passed
    expect(result0.uniforms.uBassEnergy.value).toBe(0); // last draw was no-bass
    field.draw(scene, {
      time: 1000,
      delta: 16,
      elapsed: 1000,
      params: bassParams,
      width: 800,
      height: 600,
    });
    expect(result0.uniforms.uBassEnergy.value).toBe(0.8);

    // uDisplacementScale should be non-zero when bass + motion active
    expect(result0.uniforms.uDisplacementScale.value).toBe(
      bassParams.motionAmplitude * bassParams.structureComplexity,
    );

    // Cumulative rotation with bass should exceed no-bass
    expect(cumulativeRotationBass).toBeGreaterThan(cumulativeRotationNoBass);
  });

  it('T-018-02: smoothed bass changes less frame-to-frame than raw bass with jittery input', () => {
    const drawSpy = vi.fn();
    const mockGeo = { init: vi.fn(), draw: drawSpy };

    // Simulate jittery bass: alternating high and low frequency data
    let frameIndex = 0;
    const jitteryValues = [200, 50, 200, 50, 200, 50, 200, 50];
    const mockPipeline = {
      frequency: new Uint8Array(128),
      timeDomain: new Uint8Array(128).fill(128),
      poll: vi.fn(() => {
        const val = jitteryValues[frameIndex % jitteryValues.length] ?? 128;
        mockPipeline.frequency.fill(val);
        frameIndex++;
      }),
    };

    const deps: LoopDeps = {
      geometrySystem: mockGeo,
      seed: 'smooth-test',
      signals: defaultSignals,
      geo: defaultGeo,
      getAnalyserPipeline: () => mockPipeline,
    };

    let callCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callCount++;
      if (callCount <= 8) cb(callCount * 16);
      return callCount;
    });

    const { renderer, scene, camera } = createTestRenderer();
    startLoop(renderer, scene, camera, deps);

    // Collect bassEnergy values across frames
    const bassValues = drawSpy.mock.calls.map(
      (c: unknown[]) => (c[1] as { params: VisualParams }).params.bassEnergy,
    );

    // With smoothing, consecutive frame differences should be smaller
    // than the raw input differences would produce
    // Raw bassToMacro(200) ≈ 0.83, bassToMacro(50) ≈ 0.31 → diff ≈ 0.52
    // Smoothed values should have smaller max consecutive difference
    let maxConsecutiveDiff = 0;
    for (let i = 1; i < bassValues.length; i++) {
      const diff = Math.abs(bassValues[i] - bassValues[i - 1]);
      maxConsecutiveDiff = Math.max(maxConsecutiveDiff, diff);
    }

    // The raw difference would be ~0.52; smoothing should keep it well below that
    expect(maxConsecutiveDiff).toBeLessThan(0.4);
  });

  it('T-018-03: when pipeline reports all-zero frequency data (muted), bassEnergy is still > 0', () => {
    const drawSpy = vi.fn();
    const mockGeo = { init: vi.fn(), draw: drawSpy };

    // All-zero frequency data simulates muted audio
    const mockPipeline = {
      frequency: new Uint8Array(128).fill(0),
      timeDomain: new Uint8Array(128).fill(128),
      poll: vi.fn(),
    };

    const deps: LoopDeps = {
      geometrySystem: mockGeo,
      seed: 'muted-test',
      signals: defaultSignals,
      geo: defaultGeo,
      getAnalyserPipeline: () => mockPipeline,
    };

    let callCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callCount++;
      if (callCount <= 5) cb(callCount * 1000);
      return callCount;
    });

    const { renderer, scene, camera } = createTestRenderer();
    startLoop(renderer, scene, camera, deps);

    // With synthetic bass fallback, at least some frames should have bassEnergy > 0
    const bassValues = drawSpy.mock.calls.map(
      (c: unknown[]) => (c[1] as { params: VisualParams }).params.bassEnergy,
    );

    expect(bassValues.length).toBeGreaterThan(0);
    const anyNonZero = bassValues.some((v: number) => v > 0);
    expect(anyNonZero).toBe(true);
  });

  it('T-018-04: with maximum bass (255), shader uniforms and mesh transforms remain bounded after many frames', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    const maxBassParams = { ...defaultParams, bassEnergy: 1.0, density: 0.8 };
    field.init(scene, 'max-bass-bounds', maxBassParams);

    // Run many frames with maximum bass energy
    for (let t = 0; t < 200; t++) {
      field.draw(scene, {
        time: t * 100,
        delta: 50,
        elapsed: t * 100,
        params: maxBassParams,
        width: 800,
        height: 600,
      });

      const result = getShaderUniforms(scene)!;
      expect(result).not.toBeNull();

      // All uniform values must be finite
      for (const [key, entry] of Object.entries(result.uniforms)) {
        const val = (entry as { value: unknown }).value;
        if (typeof val === 'number') {
          expect(val, `uniform ${key} at frame ${t}`).not.toBeNaN();
          expect(Number.isFinite(val), `uniform ${key} finite at frame ${t}`).toBe(true);
        }
      }

      // uBassEnergy must not exceed 1.0
      expect(result.uniforms.uBassEnergy.value).toBeLessThanOrEqual(1.0);

      // Mesh rotation.y: drift (±0.15*ma) + bass rotation (bassEnergy*ma*0.1)
      // With ma=1.0, max is ~0.15 + 0.1 = 0.25
      expect(Math.abs(result.mesh.rotation.y)).toBeLessThanOrEqual(0.35);

      // Mesh position.z: breath (±0.3*ma)
      expect(Math.abs(result.mesh.position.z)).toBeLessThanOrEqual(0.35);

      // uBreathScale: 1 ± 0.03*ma
      expect(result.uniforms.uBreathScale.value).toBeGreaterThanOrEqual(0.97);
      expect(result.uniforms.uBreathScale.value).toBeLessThanOrEqual(1.03);
    }
  });

  it('T-018-05: bass-driven motion respects prefers-reduced-motion (motionAmplitude=0.2 reduces mesh transform magnitudes)', () => {
    const seed = 'reduced-motion-bass';

    // Full motion with bass
    const sceneFull = new THREE.Scene();
    const fieldFull = createParticleField();
    const fullParams = { ...defaultParams, bassEnergy: 0.8, motionAmplitude: 1.0 };
    fieldFull.init(sceneFull, seed, fullParams);

    // Reduced motion with same bass
    const sceneReduced = new THREE.Scene();
    const fieldReduced = createParticleField();
    const reducedParams = { ...defaultParams, bassEnergy: 0.8, motionAmplitude: 0.2 };
    fieldReduced.init(sceneReduced, seed, reducedParams);

    let cumulativeFullRotation = 0;
    let cumulativeReducedRotation = 0;

    for (let t = 1; t <= 10; t++) {
      const frame = {
        time: t * 100,
        delta: 16,
        elapsed: t * 100,
        width: 800,
        height: 600,
      };
      fieldFull.draw(sceneFull, { ...frame, params: fullParams });
      fieldReduced.draw(sceneReduced, { ...frame, params: reducedParams });

      const fullResult = getShaderUniforms(sceneFull)!;
      const reducedResult = getShaderUniforms(sceneReduced)!;

      cumulativeFullRotation += Math.abs(fullResult.mesh.rotation.y);
      cumulativeReducedRotation += Math.abs(reducedResult.mesh.rotation.y);
    }

    // Verify uniform values
    const fullResult = getShaderUniforms(sceneFull)!;
    const reducedResult = getShaderUniforms(sceneReduced)!;

    expect(fullResult.uniforms.uMotionAmplitude.value).toBe(1.0);
    expect(reducedResult.uniforms.uMotionAmplitude.value).toBe(0.2);

    // uDisplacementScale = motionAmplitude * structureComplexity
    expect(reducedResult.uniforms.uDisplacementScale.value).toBeLessThan(
      fullResult.uniforms.uDisplacementScale.value,
    );

    // Cumulative rotation should be smaller for reduced motion
    expect(cumulativeReducedRotation).toBeLessThan(cumulativeFullRotation);
  });

  describe('privacy', () => {
    it('T-018-06: no forbidden storage APIs accessed during bass-driven rendering', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      const cookieGetSpy = vi.spyOn(document, 'cookie', 'get');
      const cookieSetSpy = vi.spyOn(document, 'cookie', 'set');

      const scene = new THREE.Scene();
      const field = createParticleField();
      const bassParams = { ...defaultParams, bassEnergy: 0.9 };
      field.init(scene, 'privacy-bass-seed', bassParams);

      for (let t = 0; t < 20; t++) {
        field.draw(scene, {
          time: t * 100,
          delta: 16,
          elapsed: t * 100,
          params: bassParams,
          width: 800,
          height: 600,
        });
      }

      // Also test mapping function
      mapSignalsToVisuals({
        signals: defaultSignals,
        geo: defaultGeo,
        pointer: defaultPointer,
        sessionSeed: 'privacy-seed',
        bass: 200,
        treble: 100,
        timeOfDay: 14,
      });

      expect(getItemSpy).not.toHaveBeenCalled();
      expect(setItemSpy).not.toHaveBeenCalled();
      expect(cookieGetSpy).not.toHaveBeenCalled();
      expect(cookieSetSpy).not.toHaveBeenCalled();
    });
  });

  describe('mapping', () => {
    it('T-018-07: bassToMacro mapping produces correct 0-1 range with power curve', () => {
      // bass=0 -> bassEnergy=0
      const result0 = mapSignalsToVisuals({
        signals: defaultSignals,
        geo: defaultGeo,
        pointer: defaultPointer,
        sessionSeed: 'mapping-test',
        bass: 0,
        treble: 0,
        timeOfDay: 14,
      });
      expect(result0.bassEnergy).toBe(0);

      // bass=255 -> bassEnergy ≈ 1.0
      const result255 = mapSignalsToVisuals({
        signals: defaultSignals,
        geo: defaultGeo,
        pointer: defaultPointer,
        sessionSeed: 'mapping-test',
        bass: 255,
        treble: 0,
        timeOfDay: 14,
      });
      expect(result255.bassEnergy).toBeCloseTo(1.0, 2);

      // bass=128 -> bassEnergy ≈ (128/255)^0.7 ≈ 0.587
      const result128 = mapSignalsToVisuals({
        signals: defaultSignals,
        geo: defaultGeo,
        pointer: defaultPointer,
        sessionSeed: 'mapping-test',
        bass: 128,
        treble: 0,
        timeOfDay: 14,
      });
      expect(result128.bassEnergy).toBeCloseTo(Math.pow(128 / 255, 0.7), 1);

      // All in [0, 1]
      expect(result0.bassEnergy).toBeGreaterThanOrEqual(0);
      expect(result0.bassEnergy).toBeLessThanOrEqual(1);
      expect(result128.bassEnergy).toBeGreaterThanOrEqual(0);
      expect(result128.bassEnergy).toBeLessThanOrEqual(1);
      expect(result255.bassEnergy).toBeGreaterThanOrEqual(0);
      expect(result255.bassEnergy).toBeLessThanOrEqual(1);

      // Negative input clamps to 0
      const resultNeg = mapSignalsToVisuals({
        signals: defaultSignals,
        geo: defaultGeo,
        pointer: defaultPointer,
        sessionSeed: 'mapping-test',
        bass: -10,
        treble: 0,
        timeOfDay: 14,
      });
      expect(resultNeg.bassEnergy).toBe(0);
    });
  });

  describe('camera motion', () => {
    beforeEach(() => {
      _clearHarmonicCache();
    });

    it('T-018-08: camera motion scales orbit radius by bass energy', () => {
      const seed = 'camera-bass-test';
      initCameraMotion(seed);

      const elapsedMs = 50000; // Far enough to get non-trivial sine values

      // Camera with bass=0
      const cam0 = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);
      updateCamera(cam0, elapsedMs, 0, 1.0);
      const offset0 = Math.sqrt(
        Math.pow(cam0.position.x, 2) +
        Math.pow(cam0.position.y, 2) +
        Math.pow(cam0.position.z - 5, 2), // base Z is 5
      );

      // Camera with bass=1.0
      _clearHarmonicCache();
      initCameraMotion(seed);
      const cam1 = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);
      updateCamera(cam1, elapsedMs, 1.0, 1.0);
      const offset1 = Math.sqrt(
        Math.pow(cam1.position.x, 2) +
        Math.pow(cam1.position.y, 2) +
        Math.pow(cam1.position.z - 5, 2),
      );

      // bass=1.0 should scale by 1.15x
      expect(offset1).toBeGreaterThan(offset0);
      if (offset0 > 0.001) {
        expect(offset1 / offset0).toBeCloseTo(1.15, 1);
      }

      // Camera with bass=0.5
      _clearHarmonicCache();
      initCameraMotion(seed);
      const cam05 = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);
      updateCamera(cam05, elapsedMs, 0.5, 1.0);
      const offset05 = Math.sqrt(
        Math.pow(cam05.position.x, 2) +
        Math.pow(cam05.position.y, 2) +
        Math.pow(cam05.position.z - 5, 2),
      );
      // Intermediate offset
      expect(offset05).toBeGreaterThan(offset0);
      expect(offset05).toBeLessThan(offset1);

      // motionAmplitude=0 should produce zero displacement regardless of bass
      _clearHarmonicCache();
      initCameraMotion(seed);
      const camNoMotion = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);
      updateCamera(camNoMotion, elapsedMs, 1.0, 0);
      expect(camNoMotion.position.x).toBeCloseTo(0, 5);
      expect(camNoMotion.position.y).toBeCloseTo(0, 5);
      expect(camNoMotion.position.z).toBeCloseTo(5, 5);
    });
  });

  describe('synthetic fallback', () => {
    it('T-018-09: synthetic bass fallback produces time-varying signal within expected range', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };

      // All-zero frequency data triggers synthetic fallback
      const mockPipeline = {
        frequency: new Uint8Array(128).fill(0),
        timeDomain: new Uint8Array(128).fill(128),
        poll: vi.fn(),
      };

      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'fallback-test',
        signals: defaultSignals,
        geo: defaultGeo,
        getAnalyserPipeline: () => mockPipeline,
      };

      let callCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        callCount++;
        // Use varying timestamps to get time-varying synthetic signal
        if (callCount <= 30) cb(callCount * 200);
        return callCount;
      });

      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);

      const bassValues = drawSpy.mock.calls.map(
        (c: unknown[]) => (c[1] as { params: VisualParams }).params.bassEnergy,
      );

      // All values should be > 0 (synthetic fallback active)
      expect(bassValues.length).toBeGreaterThan(0);
      bassValues.forEach((v: number) => {
        expect(v).toBeGreaterThan(0);
      });

      // Values should vary across frames (not constant)
      const uniqueValues = new Set(bassValues.map((v: number) => v.toFixed(4)));
      expect(uniqueValues.size).toBeGreaterThan(1);
    });
  });

  describe('smoothing convergence', () => {
    it('T-018-10: EMA smoothing converges toward stable value with constant input', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };

      // Constant frequency data
      const mockPipeline = {
        frequency: new Uint8Array(128).fill(180),
        timeDomain: new Uint8Array(128).fill(128),
        poll: vi.fn(),
      };

      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'converge-test',
        signals: defaultSignals,
        geo: defaultGeo,
        getAnalyserPipeline: () => mockPipeline,
      };

      let callCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        callCount++;
        if (callCount <= 35) cb(callCount * 16);
        return callCount;
      });

      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);

      const bassValues = drawSpy.mock.calls.map(
        (c: unknown[]) => (c[1] as { params: VisualParams }).params.bassEnergy,
      );

      expect(bassValues.length).toBeGreaterThan(25);

      // First frame should be significantly less than final (ramp-up from 0)
      expect(bassValues[0]).toBeLessThan(bassValues[bassValues.length - 1]);

      // After 25+ frames, value should be within 5% of converged value
      // Expected converged: bassToMacro(180) = (180/255)^0.7
      const expectedConverged = Math.pow(180 / 255, 0.7);
      const lateValue = bassValues[bassValues.length - 1];
      expect(Math.abs(lateValue - expectedConverged) / expectedConverged).toBeLessThan(0.05);

      // Consecutive differences should decrease over time (convergence)
      const earlyDiffs: number[] = [];
      const lateDiffs: number[] = [];
      for (let i = 1; i < bassValues.length; i++) {
        const diff = Math.abs(bassValues[i] - bassValues[i - 1]);
        if (i <= 5) earlyDiffs.push(diff);
        if (i >= bassValues.length - 5) lateDiffs.push(diff);
      }
      const avgEarlyDiff = earlyDiffs.reduce((a, b) => a + b, 0) / earlyDiffs.length;
      const avgLateDiff = lateDiffs.reduce((a, b) => a + b, 0) / lateDiffs.length;
      expect(avgLateDiff).toBeLessThan(avgEarlyDiff);
    });
  });
});
