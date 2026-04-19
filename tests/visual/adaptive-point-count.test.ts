import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { computeQuality } from '../../src/visual/quality';
import { createPointCloud, getPointCount, getPointPositions, computeAdaptiveCount } from '../../src/visual/systems/pointCloud';
import { createParticleField, getParticleCount } from '../../src/visual/systems/particleField';
import { createRibbonField, getPointCount as getRibbonPointCount } from '../../src/visual/systems/ribbonField';
import { createCrystalField, getPointCount as getCrystalPointCount } from '../../src/visual/systems/crystalField';
import { mapSignalsToVisuals } from '../../src/visual/mappings';
import type { VisualParams } from '../../src/visual/mappings';
import type { BrowserSignals } from '../../src/input/signals';

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

const desktopSignals = makeSignals({
  devicePixelRatio: 2,
  hardwareConcurrency: 16,
  deviceMemory: 8,
  screenWidth: 2560,
  screenHeight: 1440,
  touchCapable: false,
});

const mobileSignals = makeSignals({
  devicePixelRatio: 1,
  hardwareConcurrency: 2,
  deviceMemory: 1,
  screenWidth: 320,
  screenHeight: 568,
  touchCapable: true,
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
  curveSoftness: 0.3,
  structureComplexity: 0.5,
  noiseFrequency: 1.0,
  radialScale: 1.0,
  twistStrength: 1.0,
  fieldSpread: 1.0,
};

const defaultGeo = { country: 'US', region: 'CA' };
const defaultPointer = { active: false, x: 0, y: 0, speed: 0 };

function getDesktopVisuals(): VisualParams {
  return mapSignalsToVisuals({
    signals: desktopSignals,
    geo: defaultGeo,
    pointer: defaultPointer,
    sessionSeed: 'test-seed',
    bass: 0,
    treble: 0,
    timeOfDay: 12,
  });
}

function getMobileVisuals(): VisualParams {
  return mapSignalsToVisuals({
    signals: mobileSignals,
    geo: defaultGeo,
    pointer: defaultPointer,
    sessionSeed: 'test-seed',
    bass: 0,
    treble: 0,
    timeOfDay: 12,
  });
}

function stdDev(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

describe('US-047: Adaptive point count scaling', () => {
  it('T-047-01: Desktop (high tier) uses ≥5× more points than mobile (low tier)', () => {
    const desktopProfile = computeQuality(desktopSignals);
    const mobileProfile = computeQuality(mobileSignals);

    const desktopVisuals = getDesktopVisuals();
    const mobileVisuals = getMobileVisuals();

    const scene = new THREE.Scene();

    const desktopCloud = createPointCloud({ maxPoints: desktopProfile.maxPoints });
    desktopCloud.init(scene, 'test-seed', desktopVisuals);
    const desktopCount = getPointCount(desktopCloud);

    const mobileCloud = createPointCloud({ maxPoints: mobileProfile.maxPoints });
    mobileCloud.init(scene, 'test-seed', mobileVisuals);
    const mobileCount = getPointCount(mobileCloud);

    expect(desktopCount).toBeGreaterThan(0);
    expect(mobileCount).toBeGreaterThan(0);
    expect(desktopCount / mobileCount).toBeGreaterThanOrEqual(5);
  });

  it('T-047-02: Mobile low-tier still maintains volumetric depth (Z spread > 0.5)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ maxPoints: 200 });
    cloud.init(scene, 'test-seed', { ...defaultParams, density: 0.3, structureComplexity: 0.2 });

    const count = getPointCount(cloud);
    expect(count).toBeGreaterThanOrEqual(1);

    const positions = getPointPositions(cloud);
    expect(positions).not.toBeNull();

    const zValues: number[] = [];
    for (let i = 0; i < count; i++) {
      const z = positions![i * 3 + 2];
      expect(Number.isFinite(z)).toBe(true);
      zValues.push(z);
    }

    const zSpread = Math.max(...zValues) - Math.min(...zValues);
    expect(zSpread).toBeGreaterThan(0.5);
  });

  it('T-047-03: Scaling affects geometry count, not dimensionality — all tiers produce 3-component positions with Z variance', () => {
    const lowProfile = computeQuality(mobileSignals);
    const midSignals = makeSignals({
      devicePixelRatio: 2,
      hardwareConcurrency: 4,
      deviceMemory: 4,
      screenWidth: 1366,
      screenHeight: 768,
      touchCapable: true,
    });
    const midProfile = computeQuality(midSignals);
    const highProfile = computeQuality(desktopSignals);

    const scene = new THREE.Scene();
    const counts: number[] = [];

    for (const profile of [lowProfile, midProfile, highProfile]) {
      const cloud = createPointCloud({ maxPoints: profile.maxPoints });
      cloud.init(scene, 'test-seed', { ...defaultParams, density: 0.5, structureComplexity: 0.5 });

      const count = getPointCount(cloud);
      counts.push(count);

      const positions = getPointPositions(cloud);
      expect(positions).not.toBeNull();
      // itemSize = 3 (positions are stored as x,y,z triples)
      expect(positions!.length).toBe(count * 3);

      const zValues: number[] = [];
      for (let i = 0; i < count; i++) {
        zValues.push(positions![i * 3 + 2]);
      }
      expect(stdDev(zValues)).toBeGreaterThan(0.1);
    }

    // Counts must increase with tier
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
  });

  it('T-047-04: No 2D fallback on low tier — all four geometry systems produce THREE.Points with ShaderMaterial', () => {
    const scene = new THREE.Scene();
    const params = { ...defaultParams, density: 0.5, structureComplexity: 0.5 };

    const pc = createPointCloud({ maxPoints: 200 });
    pc.init(scene, 'test-seed-pc', params);

    const pf = createParticleField({ maxParticles: 150 });
    pf.init(scene, 'test-seed-pf', params);

    const rf = createRibbonField({ maxPoints: 200 });
    rf.init(scene, 'test-seed-rf', params);

    const cf = createCrystalField({ maxPoints: 200 });
    cf.init(scene, 'test-seed-cf', params);

    const pointsMeshes = scene.children.filter((c) => c instanceof THREE.Points);
    expect(pointsMeshes.length).toBe(4);

    for (const mesh of pointsMeshes) {
      const points = mesh as THREE.Points;
      expect(points.material).toBeInstanceOf(THREE.ShaderMaterial);
      const mat = points.material as THREE.ShaderMaterial;
      expect(mat.vertexShader.length).toBeGreaterThan(0);
    }

    // No THREE.Mesh or THREE.Line children
    const nonPoints = scene.children.filter(
      (c) => (c instanceof THREE.Mesh && !(c instanceof THREE.Points)) || c instanceof THREE.Line,
    );
    expect(nonPoints.length).toBe(0);
  });

  it('T-047-05: Effective point count formula is consistent: floor(density × maxPoints × (0.6 + complexity × 0.4))', () => {
    const density = 0.7;
    const complexity = 0.8;
    const maxPts = 500;
    const expected = Math.max(200, Math.floor(Math.floor(density * maxPts) * (0.6 + complexity * 0.4)));

    const scene = new THREE.Scene();
    const params = { ...defaultParams, density, structureComplexity: complexity };

    const pc = createPointCloud({ maxPoints: maxPts });
    pc.init(scene, 'formula-test', params);
    // Point cloud may apply a 1.5x multiplier for parametric shapes (US-084)
    const pcCount = getPointCount(pc);
    const expectedWithMultiplier = Math.min(Math.floor(expected * 1.5), maxPts);
    expect(pcCount === expected || pcCount === expectedWithMultiplier).toBe(true);

    const rf = createRibbonField({ maxPoints: maxPts });
    rf.init(scene, 'formula-test', params);
    expect(getRibbonPointCount(rf)).toBe(expected);

    const cf = createCrystalField({ maxPoints: maxPts });
    cf.init(scene, 'formula-test', params);
    // Crystal field aligns count to nodeCount × pointsPerCrystal (US-085 lattice geometry)
    expect(getCrystalPointCount(cf)).toBeLessThanOrEqual(maxPts);
    expect(getCrystalPointCount(cf)).toBeGreaterThanOrEqual(Math.floor(expected * 0.5));

    // particleField uses maxParticles
    const pf = createParticleField({ maxParticles: maxPts });
    pf.init(scene, 'formula-test', params);
    expect(getParticleCount(pf)).toBe(expected);
  });

  it('T-047-06: Minimum point floor: density near zero still produces at least 200 points', () => {
    const result = computeAdaptiveCount(0.01, 0.2, 200);
    expect(result).toBeGreaterThanOrEqual(200);

    const scene = new THREE.Scene();
    const cloud = createPointCloud({ maxPoints: 200 });
    cloud.init(scene, 'min-floor-test', { ...defaultParams, density: 0.01, structureComplexity: 0.2 });
    expect(getPointCount(cloud)).toBeGreaterThanOrEqual(200);

    const positions = getPointPositions(cloud);
    expect(positions).not.toBeNull();
    for (let i = 0; i < positions!.length; i++) {
      expect(Number.isFinite(positions![i])).toBe(true);
    }
  });

  it('T-047-07: capabilityToDensity produces lower density for mobile vs desktop device profiles', () => {
    const mobileVisuals = getMobileVisuals();
    const desktopVisuals = getDesktopVisuals();

    expect(mobileVisuals.density).toBeGreaterThanOrEqual(0.3);
    expect(mobileVisuals.density).toBeLessThanOrEqual(1.0);
    expect(desktopVisuals.density).toBeGreaterThanOrEqual(0.3);
    expect(desktopVisuals.density).toBeLessThanOrEqual(1.0);
    expect(desktopVisuals.density).toBeGreaterThan(mobileVisuals.density);
    expect(desktopVisuals.density / mobileVisuals.density).toBeGreaterThanOrEqual(1.5);
  });

  it('T-047-08: Point count never exceeds maxPoints cap at maximum density and complexity', () => {
    const scene = new THREE.Scene();
    const maxPointsValues = [200, 500, 1200];
    const params = { ...defaultParams, density: 1.0, structureComplexity: 1.0 };

    for (const mp of maxPointsValues) {
      const cloud = createPointCloud({ maxPoints: mp });
      cloud.init(scene, `cap-test-${mp}`, params);
      expect(getPointCount(cloud)).toBeLessThanOrEqual(mp);
    }

    const pf = createParticleField({ maxParticles: 250 });
    pf.init(scene, 'cap-test-pf', params);
    expect(getParticleCount(pf)).toBeLessThanOrEqual(250);

    const rf = createRibbonField({ maxPoints: 250 });
    rf.init(scene, 'cap-test-rf', params);
    expect(getRibbonPointCount(rf)).toBeLessThanOrEqual(250);
  });

  it('T-047-09: Low-tier point cloud positions are volumetric, not coplanar', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ maxPoints: 200 });
    cloud.init(scene, 'volumetric-test', { ...defaultParams, density: 0.5, structureComplexity: 0.5 });

    const positions = getPointPositions(cloud);
    expect(positions).not.toBeNull();
    const count = getPointCount(cloud);

    const xVals: number[] = [];
    const yVals: number[] = [];
    const zVals: number[] = [];
    for (let i = 0; i < count; i++) {
      xVals.push(positions![i * 3]);
      yVals.push(positions![i * 3 + 1]);
      zVals.push(positions![i * 3 + 2]);
    }

    expect(stdDev(xVals)).toBeGreaterThan(0.1);
    expect(stdDev(yVals)).toBeGreaterThan(0.1);
    expect(stdDev(zVals)).toBeGreaterThan(0.1);
  });

  it('T-047-10: Quality tier maxPoints values maintain the expected ratio hierarchy', () => {
    const low = computeQuality(mobileSignals);
    const midSignals = makeSignals({
      devicePixelRatio: 2,
      hardwareConcurrency: 4,
      deviceMemory: 4,
      screenWidth: 1366,
      screenHeight: 768,
      touchCapable: true,
    });
    const medium = computeQuality(midSignals);
    const high = computeQuality(desktopSignals);

    expect(low.maxPoints).toBeLessThan(medium.maxPoints);
    expect(medium.maxPoints).toBeLessThan(high.maxPoints);

    expect(low.maxParticles).toBeLessThan(medium.maxParticles);
    expect(medium.maxParticles).toBeLessThan(high.maxParticles);

    expect(low.maxRibbonPoints).toBeLessThan(medium.maxRibbonPoints);
    expect(medium.maxRibbonPoints).toBeLessThan(high.maxRibbonPoints);

    expect(high.maxPoints / low.maxPoints).toBeGreaterThanOrEqual(5);
  });

  it('T-047-11: No localStorage or cookie access during adaptive scaling operations', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');

    const profile = computeQuality(desktopSignals);
    const scene = new THREE.Scene();
    const params = { ...defaultParams, density: 0.6, structureComplexity: 0.5 };

    const pc = createPointCloud({ maxPoints: profile.maxPoints });
    pc.init(scene, 'privacy-test', params);

    const pf = createParticleField({ maxParticles: profile.maxParticles });
    pf.init(scene, 'privacy-test', params);

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();

    getItemSpy.mockRestore();
    cookieSpy.mockRestore();
  });
});
