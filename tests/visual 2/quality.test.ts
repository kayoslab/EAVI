import { describe, it, expect, vi } from 'vitest';
import { computeQuality } from '../../src/visual/quality';
import type { BrowserSignals } from '../../src/input/signals';
import * as THREE from 'three';
import { createParticleField, getParticleCount } from '../../src/visual/systems/particleField';
import { createRibbonField, getPointCount as getRibbonPointCount } from '../../src/visual/systems/ribbonField';
import type { VisualParams } from '../../src/visual/mappings';

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

describe('US-025: Quality tier computation', () => {
  it('T-025-01: high-end desktop signals produce high quality tier', () => {
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
    expect(result.maxParticles).toBe(1000);
    expect(result.resolutionScale).toBe(1.0);
    expect(result.enableSparkle).toBe(true);
    expect(result.shaderComplexity).toBe('high');
    expect(result.noiseOctaves).toBe(3);
    expect(result.enablePointerRepulsion).toBe(true);
    expect(result.enableSlowModulation).toBe(true);
  });

  it('T-025-02: mid-range phone signals produce medium quality tier', () => {
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
    expect(result.maxParticles).toBe(550);
    expect(result.resolutionScale).toBe(0.75);
    expect(result.enableSparkle).toBe(true);
    expect(result.shaderComplexity).toBe('medium');
    expect(result.noiseOctaves).toBe(2);
    expect(result.enablePointerRepulsion).toBe(true);
    expect(result.enableSlowModulation).toBe(true);
  });

  it('T-025-03: low-end phone signals produce low quality tier', () => {
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
    expect(result.maxParticles).toBe(150);
    expect(result.resolutionScale).toBe(0.5);
    expect(result.enableSparkle).toBe(false);
    expect(result.shaderComplexity).toBe('low');
    expect(result.noiseOctaves).toBe(1);
    expect(result.enablePointerRepulsion).toBe(false);
    expect(result.enableSlowModulation).toBe(false);
  });

  it('T-025-04: null and unknown values fall back to medium tier', () => {
    const signals = makeSignals({
      devicePixelRatio: null,
      hardwareConcurrency: null,
      deviceMemory: null,
      screenWidth: 1024,
      screenHeight: 768,
      touchCapable: null,
    });
    const result = computeQuality(signals);
    expect(result.tier).toBe('medium');
  });

  it('T-025-05: touch-capable device with low core count gets score penalty', () => {
    const base = {
      devicePixelRatio: 2 as number | null,
      hardwareConcurrency: 4 as number | null,
      deviceMemory: 4 as number | null,
      screenWidth: 800,
      screenHeight: 600,
    };
    const touchSignals = makeSignals({ ...base, touchCapable: true });
    const noTouchSignals = makeSignals({ ...base, touchCapable: false });
    const touchResult = computeQuality(touchSignals);
    const noTouchResult = computeQuality(noTouchSignals);

    const tierOrder = { low: 0, medium: 1, high: 2 };
    expect(tierOrder[touchResult.tier]).toBeLessThanOrEqual(tierOrder[noTouchResult.tier]);
  });

  it('T-025-06: enableSparkle is false only for low tier', () => {
    const low = computeQuality(makeSignals({
      devicePixelRatio: 1, hardwareConcurrency: 2, deviceMemory: 1,
      screenWidth: 320, screenHeight: 568, touchCapable: true,
    }));
    const medium = computeQuality(makeSignals({
      devicePixelRatio: 2, hardwareConcurrency: 4, deviceMemory: 4,
      screenWidth: 390, screenHeight: 844, touchCapable: true,
    }));
    const high = computeQuality(makeSignals({
      devicePixelRatio: 2, hardwareConcurrency: 16, deviceMemory: 8,
      screenWidth: 2560, screenHeight: 1440, touchCapable: false,
    }));

    expect(low.enableSparkle).toBe(false);
    expect(medium.enableSparkle).toBe(true);
    expect(high.enableSparkle).toBe(true);
  });

  it('T-025-07: high-DPR small-screen touch device does not get high tier', () => {
    const signals = makeSignals({
      devicePixelRatio: 3,
      hardwareConcurrency: 2,
      deviceMemory: 2,
      screenWidth: 375,
      screenHeight: 667,
      touchCapable: true,
    });
    const result = computeQuality(signals);
    expect(result.tier).not.toBe('high');
  });

  it('T-025-08: quality profile values are within valid ranges', () => {
    const variants = [
      makeSignals({ devicePixelRatio: 1, hardwareConcurrency: 2, deviceMemory: 1, screenWidth: 320, screenHeight: 568, touchCapable: true }),
      makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 4, deviceMemory: 4, screenWidth: 390, screenHeight: 844, touchCapable: true }),
      makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 16, deviceMemory: 8, screenWidth: 2560, screenHeight: 1440, touchCapable: false }),
      makeSignals({ devicePixelRatio: null, hardwareConcurrency: null, deviceMemory: null, screenWidth: 1024, screenHeight: 768, touchCapable: null }),
    ];

    for (const signals of variants) {
      const result = computeQuality(signals);
      expect(result.maxParticles).toBeGreaterThanOrEqual(100);
      expect(result.maxParticles).toBeLessThanOrEqual(1000);
      expect(result.resolutionScale).toBeGreaterThanOrEqual(0.25);
      expect(result.resolutionScale).toBeLessThanOrEqual(1.0);
      expect(['low', 'medium', 'high']).toContain(result.tier);
      expect(['low', 'medium', 'high']).toContain(result.shaderComplexity);
      expect([1, 2, 3]).toContain(result.noiseOctaves);
      expect(typeof result.enablePointerRepulsion).toBe('boolean');
      expect(typeof result.enableSlowModulation).toBe('boolean');
    }
  });
});

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

describe('US-025: Quality integration tests', () => {
  it('T-025-22: low-tier quality profile produces particle field with <= 150 particles end-to-end', () => {
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
    expect(quality.maxParticles).toBe(150);

    const scene = new THREE.Scene();
    const field = createParticleField({ maxParticles: quality.maxParticles });
    field.init(scene, 'integration-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
    expect(getParticleCount(field)).toBeLessThanOrEqual(150);
  });

  it('T-025-23: low-tier quality profile produces ribbon field with <= maxRibbonPoints end-to-end', () => {
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
    expect(quality.maxRibbonPoints).toBe(200);

    const scene = new THREE.Scene();
    const field = createRibbonField({ maxPoints: quality.maxRibbonPoints, noiseOctaves: quality.noiseOctaves, enablePointerRepulsion: quality.enablePointerRepulsion, enableSlowModulation: quality.enableSlowModulation });
    field.init(scene, 'ribbon-integration-seed', { ...defaultParams, density: 1.0 });
    expect(getRibbonPointCount(field)).toBeLessThanOrEqual(200);
  });

  it('T-025-24: quality scaling does not introduce localStorage or cookie access', () => {
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
    const particles = createParticleField({ maxParticles: quality.maxParticles, enableSparkle: quality.enableSparkle });
    particles.init(scene, 'privacy-seed', defaultParams);
    particles.draw(scene, { time: 0, delta: 16, elapsed: 0, params: defaultParams, width: 800, height: 600 });

    const ribbon = createRibbonField({ maxPoints: quality.maxRibbonPoints, enableSparkle: quality.enableSparkle, noiseOctaves: quality.noiseOctaves, enablePointerRepulsion: quality.enablePointerRepulsion, enableSlowModulation: quality.enableSlowModulation });
    ribbon.init(scene, 'privacy-seed', defaultParams);
    ribbon.draw(scene, { time: 0, delta: 16, elapsed: 0, params: defaultParams, width: 800, height: 600 });

    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('T-054-41: QualityProfile includes maxPolyhedra field', () => {
    const signals = makeSignals();
    const result = computeQuality(signals);
    expect(result).toHaveProperty('maxPolyhedra');
    expect(typeof result.maxPolyhedra).toBe('number');
    expect(result.maxPolyhedra).toBeGreaterThan(0);
  });

  it('T-054-42: low tier has maxPolyhedra=3, medium=6, high=12', () => {
    const low = computeQuality(makeSignals({ devicePixelRatio: 1, hardwareConcurrency: 2, deviceMemory: 1, screenWidth: 320, screenHeight: 568, touchCapable: true }));
    const medium = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 4, deviceMemory: 4, screenWidth: 390, screenHeight: 844, touchCapable: true }));
    const high = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 16, deviceMemory: 8, screenWidth: 2560, screenHeight: 1440, touchCapable: false }));

    expect(low.maxPolyhedra).toBe(3);
    expect(medium.maxPolyhedra).toBe(6);
    expect(high.maxPolyhedra).toBe(12);
  });

  it('T-054-43: maxPolyhedra scales with tier (low < medium < high)', () => {
    const low = computeQuality(makeSignals({ devicePixelRatio: 1, hardwareConcurrency: 2, deviceMemory: 1, screenWidth: 320, screenHeight: 568, touchCapable: true }));
    const medium = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 4, deviceMemory: 4, screenWidth: 390, screenHeight: 844, touchCapable: true }));
    const high = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 16, deviceMemory: 8, screenWidth: 2560, screenHeight: 1440, touchCapable: false }));

    expect(low.maxPolyhedra).toBeLessThan(medium.maxPolyhedra);
    expect(medium.maxPolyhedra).toBeLessThan(high.maxPolyhedra);
  });

  it('T-054-44: null/unknown signals fall back to medium tier which includes maxPolyhedra=6', () => {
    const signals = makeSignals({
      devicePixelRatio: null,
      hardwareConcurrency: null,
      deviceMemory: null,
      screenWidth: 1024,
      screenHeight: 768,
      touchCapable: null,
    });
    const result = computeQuality(signals);
    expect(result.tier).toBe('medium');
    expect(result.maxPolyhedra).toBe(6);
  });

  it('T-057-28: QualityProfile includes maxFractalDepth field', () => {
    const signals = makeSignals();
    const result = computeQuality(signals);
    expect(result).toHaveProperty('maxFractalDepth');
    expect(typeof result.maxFractalDepth).toBe('number');
    expect(result.maxFractalDepth).toBeGreaterThan(0);
  });

  it('T-057-29: maxFractalDepth per tier: low=3, medium=4, high=6', () => {
    const low = computeQuality(makeSignals({ devicePixelRatio: 1, hardwareConcurrency: 2, deviceMemory: 1, screenWidth: 320, screenHeight: 568, touchCapable: true }));
    const medium = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 4, deviceMemory: 4, screenWidth: 390, screenHeight: 844, touchCapable: true }));
    const high = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 16, deviceMemory: 8, screenWidth: 2560, screenHeight: 1440, touchCapable: false }));

    expect(low.maxFractalDepth).toBe(3);
    expect(medium.maxFractalDepth).toBe(4);
    expect(high.maxFractalDepth).toBe(6);
  });

  it('T-057-30: maxFractalDepth scales with tier (low < medium < high)', () => {
    const low = computeQuality(makeSignals({ devicePixelRatio: 1, hardwareConcurrency: 2, deviceMemory: 1, screenWidth: 320, screenHeight: 568, touchCapable: true }));
    const medium = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 4, deviceMemory: 4, screenWidth: 390, screenHeight: 844, touchCapable: true }));
    const high = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 16, deviceMemory: 8, screenWidth: 2560, screenHeight: 1440, touchCapable: false }));

    expect(low.maxFractalDepth).toBeLessThan(medium.maxFractalDepth);
    expect(medium.maxFractalDepth).toBeLessThan(high.maxFractalDepth);
  });

  it('T-063-33: QualityProfile includes maxFlowRibbonPoints field', () => {
    const lowSignals = { devicePixelRatio: 1, hardwareConcurrency: 2, deviceMemory: 1, screenWidth: 360, screenHeight: 640, touchCapable: true };
    const highSignals = { devicePixelRatio: 2, hardwareConcurrency: 8, deviceMemory: 8, screenWidth: 1920, screenHeight: 1080, touchCapable: false };
    const low = computeQuality(lowSignals as BrowserSignals);
    const high = computeQuality(highSignals as BrowserSignals);
    expect(low.maxFlowRibbonPoints).toBeDefined();
    expect(high.maxFlowRibbonPoints).toBeDefined();
    expect(high.maxFlowRibbonPoints).toBeGreaterThan(low.maxFlowRibbonPoints);
  });

  it('T-068-41: QualityProfile includes latticeGridSize field', () => {
    const signals = makeSignals();
    const result = computeQuality(signals);
    expect(result).toHaveProperty('latticeGridSize');
    expect(typeof result.latticeGridSize).toBe('number');
    expect(result.latticeGridSize).toBeGreaterThan(0);
  });

  it('T-068-42: QualityProfile includes latticeCellSize field', () => {
    const signals = makeSignals();
    const result = computeQuality(signals);
    expect(result).toHaveProperty('latticeCellSize');
    expect(typeof result.latticeCellSize).toBe('number');
    expect(result.latticeCellSize).toBeGreaterThan(0);
  });

  it('T-068-43: latticeGridSize per tier: low=3, medium=5, high=7', () => {
    const low = computeQuality(makeSignals({ devicePixelRatio: 1, hardwareConcurrency: 2, deviceMemory: 1, screenWidth: 320, screenHeight: 568, touchCapable: true }));
    const medium = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 4, deviceMemory: 4, screenWidth: 390, screenHeight: 844, touchCapable: true }));
    const high = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 16, deviceMemory: 8, screenWidth: 2560, screenHeight: 1440, touchCapable: false }));

    expect(low.latticeGridSize).toBe(3);
    expect(medium.latticeGridSize).toBe(5);
    expect(high.latticeGridSize).toBe(7);
  });

  it('T-068-44: latticeCellSize per tier: low=1.2, medium=1.0, high=0.8', () => {
    const low = computeQuality(makeSignals({ devicePixelRatio: 1, hardwareConcurrency: 2, deviceMemory: 1, screenWidth: 320, screenHeight: 568, touchCapable: true }));
    const medium = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 4, deviceMemory: 4, screenWidth: 390, screenHeight: 844, touchCapable: true }));
    const high = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 16, deviceMemory: 8, screenWidth: 2560, screenHeight: 1440, touchCapable: false }));

    expect(low.latticeCellSize).toBe(1.2);
    expect(medium.latticeCellSize).toBe(1.0);
    expect(high.latticeCellSize).toBe(0.8);
  });

  it('T-068-45: latticeGridSize scales with tier (low < medium < high)', () => {
    const low = computeQuality(makeSignals({ devicePixelRatio: 1, hardwareConcurrency: 2, deviceMemory: 1, screenWidth: 320, screenHeight: 568, touchCapable: true }));
    const medium = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 4, deviceMemory: 4, screenWidth: 390, screenHeight: 844, touchCapable: true }));
    const high = computeQuality(makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 16, deviceMemory: 8, screenWidth: 2560, screenHeight: 1440, touchCapable: false }));

    expect(low.latticeGridSize).toBeLessThan(medium.latticeGridSize);
    expect(medium.latticeGridSize).toBeLessThan(high.latticeGridSize);
  });
});
