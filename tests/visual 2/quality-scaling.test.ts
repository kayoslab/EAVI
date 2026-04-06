import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { computeQuality } from '../../src/visual/quality';
import type { BrowserSignals } from '../../src/input/signals';
import type { VisualParams } from '../../src/visual/mappings';
import { createPointCloud, getPointCount } from '../../src/visual/systems/pointCloud';
import { createRibbonField } from '../../src/visual/systems/ribbonField';

// Mock Three.js WebGLRenderer since jsdom has no WebGL
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return {
    ...actual,
    WebGLRenderer: class MockWebGLRenderer {
      domElement: HTMLCanvasElement;
      private _clearColor = new actual.Color(0x000000);
      private _pixelRatio = 1;

      constructor() {
        this.domElement = document.createElement('canvas');
      }

      setSize(w: number, h: number, _updateStyle?: boolean) {
        this.domElement.width = w * this._pixelRatio;
        this.domElement.height = h * this._pixelRatio;
      }

      setPixelRatio(ratio: number) {
        this._pixelRatio = ratio;
      }

      getPixelRatio() {
        return this._pixelRatio;
      }

      setClearColor(color: number | string | actual.Color) {
        if (typeof color === 'number') {
          this._clearColor.setHex(color);
        }
      }

      getClearColor(target: actual.Color) {
        target.copy(this._clearColor);
        return target;
      }

      render() {}
      dispose() {}
      getSize(target: actual.Vector2) {
        target.set(this.domElement.width / this._pixelRatio, this.domElement.height / this._pixelRatio);
        return target;
      }
    },
  };
});

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

describe('US-036: Quality scaling — shader complexity tiers', () => {
  it('T-036-01: low tier includes shaderComplexity=low, noiseOctaves=1, pointer/modulation disabled', () => {
    const signals = makeSignals({
      devicePixelRatio: 1,
      hardwareConcurrency: 2,
      deviceMemory: 1,
      screenWidth: 320,
      screenHeight: 568,
      touchCapable: true,
    });
    const result = computeQuality(signals);
    expect(result.tier).toBe('low');
    expect(result.shaderComplexity).toBe('low');
    expect(result.noiseOctaves).toBe(1);
    expect(result.enablePointerRepulsion).toBe(false);
    expect(result.enableSlowModulation).toBe(false);
  });

  it('T-036-02: medium tier has shaderComplexity=medium, noiseOctaves=2, features enabled', () => {
    const signals = makeSignals({
      devicePixelRatio: 2,
      hardwareConcurrency: 4,
      deviceMemory: 4,
      screenWidth: 390,
      screenHeight: 844,
      touchCapable: true,
    });
    const result = computeQuality(signals);
    expect(result.tier).toBe('medium');
    expect(result.shaderComplexity).toBe('medium');
    expect(result.noiseOctaves).toBe(2);
    expect(result.enablePointerRepulsion).toBe(true);
    expect(result.enableSlowModulation).toBe(true);
  });

  it('T-036-03: high tier has shaderComplexity=high, noiseOctaves=3, all features enabled', () => {
    const signals = makeSignals({
      devicePixelRatio: 2,
      hardwareConcurrency: 16,
      deviceMemory: 8,
      screenWidth: 2560,
      screenHeight: 1440,
      touchCapable: false,
    });
    const result = computeQuality(signals);
    expect(result.tier).toBe('high');
    expect(result.shaderComplexity).toBe('high');
    expect(result.noiseOctaves).toBe(3);
    expect(result.enablePointerRepulsion).toBe(true);
    expect(result.enableSlowModulation).toBe(true);
  });
});

describe('US-036: Quality scaling — canvas full-screen guarantee', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  });

  it('T-036-04: canvas CSS dimensions always fill viewport regardless of quality tier', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const scales = [0.5, 0.75, 1.0];
    for (const scale of scales) {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const { renderer } = initScene(container, { resolutionScale: scale });
      // JS must not set inline CSS — stylesheet rule handles layout
      expect(renderer.domElement.style.width).toBe('');
      expect(renderer.domElement.style.height).toBe('');
      renderer.dispose();
      document.body.removeChild(container);
    }
  });

  it('T-036-05: low-tier renderer backing store is smaller than high-tier', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const containerLow = document.createElement('div');
    const containerHigh = document.createElement('div');
    document.body.appendChild(containerLow);
    document.body.appendChild(containerHigh);

    const { renderer: rLow } = initScene(containerLow, { resolutionScale: 0.5 });
    const { renderer: rHigh } = initScene(containerHigh, { resolutionScale: 1.0 });

    // JS must not set inline CSS — stylesheet rule handles layout
    expect(rLow.domElement.style.width).toBe('');
    expect(rHigh.domElement.style.width).toBe('');
    expect(rLow.domElement.style.height).toBe('');
    expect(rHigh.domElement.style.height).toBe('');

    // Low tier pixel ratio should be lower
    expect(rLow.getPixelRatio()).toBeLessThan(rHigh.getPixelRatio());

    rLow.dispose();
    rHigh.dispose();
    document.body.removeChild(containerLow);
    document.body.removeChild(containerHigh);
  });
});

describe('US-036: Quality scaling — shader uniforms', () => {
  it('T-036-06: shader uniforms reflect quality config for point cloud', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({
      maxPoints: 100,
      noiseOctaves: 1,
      enablePointerRepulsion: false,
      enableSlowModulation: false,
    });
    cloud.init(scene, 'test-seed', defaultParams);

    const mesh = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect(mesh).toBeDefined();
    const material = mesh.material as THREE.ShaderMaterial;
    expect(material.uniforms.uNoiseOctaves.value).toBe(1);
    expect(material.uniforms.uEnablePointerRepulsion.value).toBe(0.0);
    expect(material.uniforms.uEnableSlowModulation.value).toBe(0.0);

    cloud.cleanup();
  });

  it('T-036-07: shader uniforms reflect quality config for ribbon field', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField({
      maxPoints: 100,
      noiseOctaves: 2,
      enablePointerRepulsion: false,
      enableSlowModulation: true,
    });
    ribbon.init(scene, 'ribbon-test-seed', defaultParams);

    const mesh = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect(mesh).toBeDefined();
    const material = mesh.material as THREE.ShaderMaterial;
    expect(material.uniforms.uNoiseOctaves.value).toBe(2);
    expect(material.uniforms.uEnablePointerRepulsion.value).toBe(0.0);
    expect(material.uniforms.uEnableSlowModulation.value).toBe(1.0);

    ribbon.cleanup();
  });
});

describe('US-036: Quality scaling — integration', () => {
  it('T-036-08: low-tier point cloud respects maxPoints with new config shape', () => {
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

    const scene = new THREE.Scene();
    const cloud = createPointCloud({
      maxPoints: quality.maxPoints,
      enableSparkle: quality.enableSparkle,
      noiseOctaves: quality.noiseOctaves,
      enablePointerRepulsion: quality.enablePointerRepulsion,
      enableSlowModulation: quality.enableSlowModulation,
    });
    cloud.init(scene, 'low-tier-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
    expect(getPointCount(cloud)).toBeLessThanOrEqual(quality.maxPoints);
    cloud.cleanup();
  });

  it('T-036-09: visual identity preserved — all tiers produce non-zero point counts with positions', () => {
    const tierSignals = [
      makeSignals({ devicePixelRatio: 1, hardwareConcurrency: 2, deviceMemory: 1, screenWidth: 320, screenHeight: 568, touchCapable: true }),
      makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 4, deviceMemory: 4, screenWidth: 390, screenHeight: 844, touchCapable: true }),
      makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 16, deviceMemory: 8, screenWidth: 2560, screenHeight: 1440, touchCapable: false }),
    ];

    for (const signals of tierSignals) {
      const quality = computeQuality(signals);
      const scene = new THREE.Scene();
      const cloud = createPointCloud({
        maxPoints: quality.maxPoints,
        noiseOctaves: quality.noiseOctaves,
        enablePointerRepulsion: quality.enablePointerRepulsion,
        enableSlowModulation: quality.enableSlowModulation,
      });
      cloud.init(scene, 'identity-seed', defaultParams);
      expect(cloud.pointCount).toBeGreaterThan(0);
      expect(cloud.positions).not.toBeNull();
      expect(cloud.positions!.length).toBeGreaterThan(0);
      cloud.cleanup();
    }
  });

  it('T-036-10: no localStorage or cookie access during quality-scaled rendering with shader complexity', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');

    const signals = makeSignals({
      devicePixelRatio: 1,
      hardwareConcurrency: 2,
      deviceMemory: 1,
      screenWidth: 320,
      screenHeight: 568,
      touchCapable: true,
    });
    const quality = computeQuality(signals);

    const scene = new THREE.Scene();
    const cloud = createPointCloud({
      maxPoints: quality.maxPoints,
      enableSparkle: quality.enableSparkle,
      noiseOctaves: quality.noiseOctaves,
      enablePointerRepulsion: quality.enablePointerRepulsion,
      enableSlowModulation: quality.enableSlowModulation,
    });
    cloud.init(scene, 'privacy-seed', defaultParams);
    cloud.draw(scene, { time: 0, delta: 16, elapsed: 0, params: defaultParams, width: 800, height: 600 });

    const ribbon = createRibbonField({
      maxPoints: quality.maxRibbonPoints,
      enableSparkle: quality.enableSparkle,
      noiseOctaves: quality.noiseOctaves,
      enablePointerRepulsion: quality.enablePointerRepulsion,
      enableSlowModulation: quality.enableSlowModulation,
    });
    ribbon.init(scene, 'privacy-seed', defaultParams);
    ribbon.draw(scene, { time: 0, delta: 16, elapsed: 0, params: defaultParams, width: 800, height: 600 });

    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();

    cloud.cleanup();
    ribbon.cleanup();
  });
});
