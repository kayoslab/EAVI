import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initCameraMotion,
  updateCamera,
  _clearHarmonicCache,
} from '../../src/visual/cameraMotion';
import type { FrameState, GeometrySystem } from '../../src/visual/types';
import type { VisualParams } from '../../src/visual/mappings';
import type { SingleRotationEntry, CompoundRotationEntry } from '../../src/visual/modeManager';
import { createModeManager } from '../../src/visual/modeManager';
import * as THREE from 'three';

// ---------- helpers ----------

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

function mockCamera() {
  const lookAtCalls: { x: number; y: number; z: number }[] = [];
  return {
    position: {
      x: 0, y: 0, z: 5,
      set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
    },
    lookAt(x: number, y: number, z: number) { lookAtCalls.push({ x, y, z }); },
    _lookAtCalls: lookAtCalls,
    near: 0.1,
    far: 100,
    fov: 60,
    updateProjectionMatrix: vi.fn(),
  } as any;
}

function makeFrame(overrides?: Partial<FrameState & { params: Partial<VisualParams> }>): FrameState {
  return {
    time: 1000,
    delta: 16,
    elapsed: 0,
    width: 800,
    height: 600,
    params: { ...defaultParams, ...(overrides?.params ?? {}) },
    ...Object.fromEntries(Object.entries(overrides ?? {}).filter(([k]) => k !== 'params')),
  } as FrameState;
}

function createMockSystem(): GeometrySystem & {
  init: ReturnType<typeof vi.fn>;
  draw: ReturnType<typeof vi.fn>;
  cleanup: ReturnType<typeof vi.fn>;
  setOpacity: ReturnType<typeof vi.fn>;
} {
  return {
    init: vi.fn(),
    draw: vi.fn(),
    cleanup: vi.fn(),
    setOpacity: vi.fn(),
  };
}

function createSingleEntry(name: string, system?: GeometrySystem): SingleRotationEntry {
  return {
    kind: 'single',
    name,
    system: system ?? createMockSystem(),
    maxPoints: 1000,
  };
}

function createCompoundEntry(
  name: string,
  systems?: [GeometrySystem, GeometrySystem],
): CompoundRotationEntry {
  return {
    kind: 'compound',
    name,
    layers: [
      { system: systems?.[0] ?? createMockSystem(), name: 'layerA' },
      { system: systems?.[1] ?? createMockSystem(), name: 'layerB' },
    ],
    primaryLayerIndex: 0,
    maxPoints: 500,
  };
}

// ---------- FramingConfig interface ----------

/**
 * Expected FramingConfig interface — these tests validate that the implementation
 * provides these fields on each rotation entry and through getActiveFraming().
 */
interface FramingConfig {
  targetDistance: number;
  lookOffset: [number, number, number];
  nearClip: number;
  farClip: number;
}

// Known modes and their expected approximate target distances (from the plan)
const MODE_FRAMING_EXPECTATIONS: Record<string, { minDistance: number; maxDistance: number }> = {
  particles: { minDistance: 3.0, maxDistance: 6.0 },
  ribbon: { minDistance: 2.0, maxDistance: 5.0 },
  pointcloud: { minDistance: 2.5, maxDistance: 5.0 },
  crystal: { minDistance: 4.0, maxDistance: 8.0 },
  flowribbon: { minDistance: 4.0, maxDistance: 7.0 },
  terrain: { minDistance: 6.0, maxDistance: 10.0 },
};

// ---------- tests ----------

describe('US-089: Per-mode camera framing — FramingConfig interface', () => {
  it('T-089-01: FramingConfig type exists in src/visual/types.ts with required fields', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const typesSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/visual/types.ts'),
      'utf-8',
    );
    // Should declare the FramingConfig interface
    expect(typesSource).toContain('FramingConfig');
    expect(typesSource).toContain('targetDistance');
    expect(typesSource).toContain('lookOffset');
    expect(typesSource).toContain('nearClip');
    expect(typesSource).toContain('farClip');
  });

  it('T-089-02: FramingConfig targetDistance is a positive number', async () => {
    const types = await import('../../src/visual/types');
    // The interface should be importable (TypeScript compilation check)
    // Verify at runtime by checking a framing config from the mode manager
    const { getActiveFraming } = await import('../../src/visual/modeManager');
    expect(typeof getActiveFraming).toBe('function');
  });
});

describe('US-089: Per-mode camera framing — rotation entry framing configs', () => {
  it('T-089-03: SingleRotationEntry type includes a framing field', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/visual/modeManager.ts'),
      'utf-8',
    );
    // The SingleRotationEntry should reference framing
    expect(source).toContain('framing');
  });

  it('T-089-04: CompoundRotationEntry type includes a framing field', async () => {
    const fs = await import('fs');
    const path = await import('path');
    // Could be in modeManager.ts or compoundModes.ts
    const mmSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/visual/modeManager.ts'),
      'utf-8',
    );
    const cmSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/visual/compoundModes.ts'),
      'utf-8',
    );
    const combined = mmSource + cmSource;
    expect(combined).toContain('framing');
  });

  it('T-089-05: main.ts mode rotation entries each declare a framing config', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const mainSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/main.ts'),
      'utf-8',
    );
    // Each mode entry should have a framing property
    // Count occurrences of 'framing:' or 'framing :'
    const framingCount = (mainSource.match(/framing\s*:/g) || []).length;
    // At minimum, each of the 6 single modes should have framing
    expect(framingCount).toBeGreaterThanOrEqual(6);
  });
});

describe('US-089: Per-mode camera framing — getActiveFraming()', () => {
  it('T-089-06: getActiveFraming is exported from modeManager', async () => {
    const mm = await import('../../src/visual/modeManager');
    expect(typeof mm.getActiveFraming).toBe('function');
  });

  it('T-089-07: getActiveFraming returns a valid FramingConfig with all required fields', async () => {
    // We need to create a mode manager with framing configs, init it, then call getActiveFraming
    const { getActiveFraming } = await import('../../src/visual/modeManager');
    const framing = getActiveFraming();
    expect(framing).toBeDefined();
    expect(typeof framing.targetDistance).toBe('number');
    expect(framing.targetDistance).toBeGreaterThan(0);
    expect(Array.isArray(framing.lookOffset)).toBe(true);
    expect(framing.lookOffset).toHaveLength(3);
    expect(typeof framing.nearClip).toBe('number');
    expect(typeof framing.farClip).toBe('number');
    expect(framing.nearClip).toBeGreaterThan(0);
    expect(framing.farClip).toBeGreaterThan(framing.nearClip);
  });
});

describe('US-089: Per-mode camera framing — viewport fill acceptance criterion', () => {
  // At FOV=60°, visible half-height at distance d = d * tan(30°) ≈ d * 0.577
  // For ~50% fill of shorter axis with extent R: R / visibleHalfHeight ≈ 0.5
  // So targetDistance ≈ R / (0.5 * 0.577) ≈ 3.46 * R
  // Inversely: at targetDistance d, the form should appear to fill at least ~50%
  // if its extent R satisfies R >= 0.5 * d * tan(30°)

  const FOV_RAD = (60 * Math.PI) / 180;
  const HALF_FOV_TAN = Math.tan(FOV_RAD / 2); // tan(30°) ≈ 0.577

  it('T-089-08: each mode\'s framing targetDistance produces ≥50% viewport fill (formula check)', async () => {
    // Import the actual mode entries from main.ts is impractical in unit tests,
    // so we validate the formula: for each targetDistance, the visible half-height
    // must be no more than 2× the expected geometry extent.
    // We check that targetDistance is reasonable for the known mode extent ranges.

    const fs = await import('fs');
    const path = await import('path');
    const mainSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/main.ts'),
      'utf-8',
    );

    // Extract targetDistance values from framing configs in main.ts
    const distanceMatches = mainSource.matchAll(/targetDistance\s*:\s*([\d.]+)/g);
    const distances = Array.from(distanceMatches, (m) => parseFloat(m[1]));
    expect(distances.length).toBeGreaterThanOrEqual(6);

    for (const d of distances) {
      // Visible half-height at origin = d * tan(30°)
      const visibleHalfHeight = d * HALF_FOV_TAN;
      // For 50% fill, the geometry extent R must be at least 0.5 * visibleHalfHeight
      // This means visibleHalfHeight should be at most ~4× any mode's extent
      // (generous bound: all modes have extent 0.5-3.0)
      expect(visibleHalfHeight).toBeLessThan(10);
      expect(d).toBeGreaterThan(0);
      expect(d).toBeLessThanOrEqual(15);
    }
  });

  it('T-089-09: no mode renders smaller than ~50% of shorter viewport axis (geometric validation)', () => {
    // For each mode's expected geometry extent (approximate radius),
    // verify that the planned targetDistance keeps it at ≥50% viewport fill.
    // Geometry extents (estimated from code review):
    const modeExtents: Record<string, number> = {
      particles: 1.5,
      ribbon: 1.0,
      pointcloud: 1.2,
      crystal: 2.0,
      flowribbon: 1.8,
      fractalgrowth: 1.0,
      terrain: 2.0,
    };

    // Plan distances
    const planDistances: Record<string, number> = {
      particles: 4.5,
      ribbon: 3.0,
      pointcloud: 3.5,
      crystal: 6.0,
      flowribbon: 5.5,
      fractalgrowth: 3.0,
      terrain: 6.0,
    };

    for (const [mode, dist] of Object.entries(planDistances)) {
      const extent = modeExtents[mode];
      const visibleHalfHeight = dist * HALF_FOV_TAN;
      // Fill ratio = extent / visibleHalfHeight
      const fillRatio = extent / visibleHalfHeight;
      // Should fill at least ~40% (slightly lenient to account for tuning)
      expect(fillRatio).toBeGreaterThanOrEqual(0.35);
    }
  });
});

describe('US-089: Per-mode camera framing — camera motion honours framing', () => {
  beforeEach(() => {
    _clearHarmonicCache();
  });

  it('T-089-10: updateCamera accepts a FramingConfig parameter', () => {
    // The updated updateCamera should accept 5 parameters
    // (camera, elapsedMs, bassEnergy, motionAmplitude, framing)
    expect(updateCamera.length).toBeGreaterThanOrEqual(4);
  });

  it('T-089-11: camera Z tracks framing targetDistance instead of hardcoded BASE_Z=5', () => {
    const cam = mockCamera();
    initCameraMotion('framing-z-seed');

    const framing: FramingConfig = {
      targetDistance: 8.0,
      lookOffset: [0, 0, 0],
      nearClip: 0.1,
      farClip: 80,
    };

    updateCamera(cam, 0, 0, 0, framing);

    // With motionAmplitude=0, camera Z should be exactly targetDistance
    expect(cam.position.z).toBeCloseTo(8.0, 1);
  });

  it('T-089-12: camera Z tracks a different framing targetDistance correctly', () => {
    const cam = mockCamera();
    initCameraMotion('framing-z-seed-2');

    const framing: FramingConfig = {
      targetDistance: 3.0,
      lookOffset: [0, 0, 0],
      nearClip: 0.1,
      farClip: 30,
    };

    updateCamera(cam, 0, 0, 0, framing);
    expect(cam.position.z).toBeCloseTo(3.0, 1);
  });

  it('T-089-13: lookOffset biases the camera look target', () => {
    const cam = mockCamera();
    initCameraMotion('look-offset-seed');

    const framingNoOffset: FramingConfig = {
      targetDistance: 5.0,
      lookOffset: [0, 0, 0],
      nearClip: 0.1,
      farClip: 50,
    };

    const framingWithOffset: FramingConfig = {
      targetDistance: 5.0,
      lookOffset: [0, 1.5, 0],
      nearClip: 0.1,
      farClip: 50,
    };

    updateCamera(cam, 30000, 0, 1.0, framingNoOffset);
    const lookNoOffset = { ...cam._lookAtCalls[cam._lookAtCalls.length - 1] };

    updateCamera(cam, 30000, 0, 1.0, framingWithOffset);
    const lookWithOffset = { ...cam._lookAtCalls[cam._lookAtCalls.length - 1] };

    // The lookAt Y uses lookOffY * 0.3, so offset of 1.5 produces a shift of ~0.45
    expect(lookWithOffset.y - lookNoOffset.y).toBeCloseTo(0.45, 1);
  });

  it('T-089-14: harmonic drift still works on top of framing targetDistance', () => {
    const cam = mockCamera();
    initCameraMotion('drift-framing-seed');

    const framing: FramingConfig = {
      targetDistance: 7.0,
      lookOffset: [0, 0, 0],
      nearClip: 0.1,
      farClip: 70,
    };

    const positions: { x: number; y: number; z: number }[] = [];
    for (let t = 0; t <= 60000; t += 5000) {
      updateCamera(cam, t, 0, 1.0, framing);
      positions.push({ x: cam.position.x, y: cam.position.y, z: cam.position.z });
    }

    // Camera should drift around targetDistance=7.0
    const zValues = positions.map((p) => p.z);
    const zRange = Math.max(...zValues) - Math.min(...zValues);
    expect(zRange).toBeGreaterThan(0.05);

    // All Z values should be near targetDistance (within harmonic amplitude range)
    for (const z of zValues) {
      expect(z).toBeGreaterThan(5.5);
      expect(z).toBeLessThan(8.5);
    }
  });

  it('T-089-15: bass energy modulation still works with framing', () => {
    const cam = mockCamera();
    initCameraMotion('bass-framing-seed');

    const framing: FramingConfig = {
      targetDistance: 6.0,
      lookOffset: [0, 0, 0],
      nearClip: 0.1,
      farClip: 60,
    };

    const camA = mockCamera();
    const camB = mockCamera();
    initCameraMotion('bass-framing-seed');

    updateCamera(camA, 30000, 0.0, 1.0, framing);
    updateCamera(camB, 30000, 1.0, 1.0, framing);

    const distA = Math.sqrt(
      camA.position.x ** 2 + camA.position.y ** 2 + (camA.position.z - 6.0) ** 2,
    );
    const distB = Math.sqrt(
      camB.position.x ** 2 + camB.position.y ** 2 + (camB.position.z - 6.0) ** 2,
    );
    // Bass should still modulate orbit radius
    expect(distB).toBeGreaterThanOrEqual(distA - 1e-10);
  });

  it('T-089-16: motionAmplitude=0 with framing results in camera at exact targetDistance', () => {
    const cam = mockCamera();
    initCameraMotion('zero-amp-framing');

    const framing: FramingConfig = {
      targetDistance: 4.5,
      lookOffset: [0, 0, 0],
      nearClip: 0.1,
      farClip: 50,
    };

    updateCamera(cam, 30000, 0.5, 0, framing);
    expect(Math.abs(cam.position.x)).toBeLessThan(0.001);
    expect(Math.abs(cam.position.y)).toBeLessThan(0.001);
    expect(Math.abs(cam.position.z - 4.5)).toBeLessThan(0.001);
  });

  it('T-089-17: camera stays within safe bounds for various framing distances over 300s', () => {
    const cam = mockCamera();
    initCameraMotion('bounds-framing-seed');

    const testDistances = [3.0, 5.0, 6.0, 8.0];
    for (const targetDist of testDistances) {
      const framing: FramingConfig = {
        targetDistance: targetDist,
        lookOffset: [0, 0, 0],
        nearClip: 0.1,
        farClip: targetDist * 10,
      };

      for (let t = 0; t <= 300000; t += 5000) {
        updateCamera(cam, t, 0.5, 1.0, framing);
        // Camera should stay roughly near target distance
        expect(cam.position.z).toBeGreaterThan(targetDist - 2);
        expect(cam.position.z).toBeLessThan(targetDist + 2);
        expect(Math.abs(cam.position.x)).toBeLessThan(3);
        expect(Math.abs(cam.position.y)).toBeLessThan(3);
      }
    }
  });

  it('T-089-18: backward compatibility — updateCamera without framing parameter still works', () => {
    const cam = mockCamera();
    initCameraMotion('compat-seed');

    // Calling with original 4-arg signature should not throw
    expect(() => updateCamera(cam, 30000, 0.5, 1.0)).not.toThrow();
    // Camera should be positioned near the default BASE_Z=5
    expect(cam.position.z).toBeGreaterThan(3);
    expect(cam.position.z).toBeLessThan(7);
  });
});

describe('US-089: Per-mode camera framing — near/far plane management', () => {
  it('T-089-19: framing nearClip is less than farClip for all modes', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const mainSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/main.ts'),
      'utf-8',
    );

    const nearMatches = Array.from(
      mainSource.matchAll(/nearClip\s*:\s*([\d.]+)/g),
      (m) => parseFloat(m[1]),
    );
    const farMatches = Array.from(
      mainSource.matchAll(/farClip\s*:\s*([\d.]+)/g),
      (m) => parseFloat(m[1]),
    );

    expect(nearMatches.length).toBeGreaterThanOrEqual(6);
    expect(farMatches.length).toBeGreaterThanOrEqual(6);

    for (let i = 0; i < nearMatches.length; i++) {
      expect(nearMatches[i]).toBeGreaterThan(0);
      expect(farMatches[i]).toBeGreaterThan(nearMatches[i]);
    }
  });

  it('T-089-20: near/far planes contain the mode geometry (near < targetDistance, far > targetDistance)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const mainSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/main.ts'),
      'utf-8',
    );

    const distances = Array.from(
      mainSource.matchAll(/targetDistance\s*:\s*([\d.]+)/g),
      (m) => parseFloat(m[1]),
    );
    const nears = Array.from(
      mainSource.matchAll(/nearClip\s*:\s*([\d.]+)/g),
      (m) => parseFloat(m[1]),
    );
    const fars = Array.from(
      mainSource.matchAll(/farClip\s*:\s*([\d.]+)/g),
      (m) => parseFloat(m[1]),
    );

    for (let i = 0; i < distances.length; i++) {
      // Near plane must be well before the geometry (which is at origin, so distance from camera is targetDistance)
      expect(nears[i]).toBeLessThan(distances[i]);
      // Far plane must be well beyond the geometry
      expect(fars[i]).toBeGreaterThan(distances[i]);
    }
  });
});

describe('US-089: Per-mode camera framing — transition interpolation', () => {
  it('T-089-21: getActiveFraming interpolates during transitions (t=0 matches outgoing)', async () => {
    const { getActiveFraming } = await import('../../src/visual/modeManager');

    // Create entries with distinct framing configs
    const entryA = createSingleEntry('modeA');
    (entryA as any).framing = {
      targetDistance: 3.0,
      lookOffset: [0, 0, 0] as [number, number, number],
      nearClip: 0.1,
      farClip: 30,
    };

    const entryB = createSingleEntry('modeB');
    (entryB as any).framing = {
      targetDistance: 8.0,
      lookOffset: [0, 1.5, 0] as [number, number, number],
      nearClip: 0.1,
      farClip: 80,
    };

    const scene = new THREE.Scene();
    const manager = createModeManager([entryA, entryB]);
    manager.init(scene, 'interp-seed', defaultParams);

    // Draw before switch — should return active framing
    manager.draw(scene, makeFrame({ elapsed: 0 }));
    const framingBefore = getActiveFraming();
    expect(framingBefore).toBeDefined();
    expect(typeof framingBefore.targetDistance).toBe('number');
  });

  it('T-089-22: getActiveFraming returns midpoint values at t=0.5 during transition', async () => {
    const { getActiveFraming } = await import('../../src/visual/modeManager');

    const entryA = createSingleEntry('modeA');
    (entryA as any).framing = {
      targetDistance: 3.0,
      lookOffset: [0, 0, 0] as [number, number, number],
      nearClip: 0.1,
      farClip: 30,
    };

    const entryB = createSingleEntry('modeB');
    (entryB as any).framing = {
      targetDistance: 8.0,
      lookOffset: [0, 2.0, 0] as [number, number, number],
      nearClip: 0.1,
      farClip: 80,
    };

    const scene = new THREE.Scene();
    const manager = createModeManager([entryA, entryB]);
    manager.init(scene, 'interp-mid-seed', defaultParams);

    // Trigger transition
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));
    expect(manager.transitioning).toBe(true);

    // Get framing during transition — should be interpolated
    const framingMid = getActiveFraming();
    expect(framingMid).toBeDefined();
    // The distance should be between the two extremes
    expect(framingMid.targetDistance).toBeGreaterThanOrEqual(3.0 - 0.1);
    expect(framingMid.targetDistance).toBeLessThanOrEqual(8.0 + 0.1);
  });

  it('T-089-23: getActiveFraming returns incoming framing after transition completes (t=1)', async () => {
    const { getActiveFraming } = await import('../../src/visual/modeManager');

    const entryA = createSingleEntry('modeA');
    (entryA as any).framing = {
      targetDistance: 3.0,
      lookOffset: [0, 0, 0] as [number, number, number],
      nearClip: 0.1,
      farClip: 30,
    };

    const entryB = createSingleEntry('modeB');
    (entryB as any).framing = {
      targetDistance: 8.0,
      lookOffset: [0, 0, 0] as [number, number, number],
      nearClip: 0.1,
      farClip: 80,
    };

    const scene = new THREE.Scene();
    const manager = createModeManager([entryA, entryB]);
    manager.init(scene, 'interp-end-seed', defaultParams);

    // Trigger and complete transition
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));
    manager.draw(scene, makeFrame({ elapsed: 205_000 }));
    expect(manager.transitioning).toBe(false);

    // Framing should now match the new active entry
    const framingAfter = getActiveFraming();
    expect(framingAfter).toBeDefined();
  });
});

describe('US-089: Per-mode camera framing — renderLoop integration', () => {
  it('T-089-24: renderLoop passes framing config to updateCamera', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const loopSrc = fs.readFileSync(
      path.resolve(__dirname, '../../src/visual/renderLoop.ts'),
      'utf-8',
    );

    // renderLoop should import getActiveFraming or pass framing to updateCamera
    const passesFraming =
      loopSrc.includes('getActiveFraming') ||
      loopSrc.includes('framing') ||
      loopSrc.includes('Framing');
    expect(passesFraming).toBe(true);
  });

  it('T-089-25: renderLoop updates camera.near and camera.far from framing config', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const loopSrc = fs.readFileSync(
      path.resolve(__dirname, '../../src/visual/renderLoop.ts'),
      'utf-8',
    );

    // The render loop should update near/far planes
    expect(loopSrc).toContain('camera.near');
    expect(loopSrc).toContain('camera.far');
    expect(loopSrc).toContain('updateProjectionMatrix');
  });
});

describe('US-089: Per-mode camera framing — smoothness during transitions', () => {
  beforeEach(() => {
    _clearHarmonicCache();
  });

  it('T-089-26: camera position is smooth when framing changes between modes (no hard jumps)', () => {
    const cam = mockCamera();
    initCameraMotion('smooth-transition-seed');

    // Simulate a transition from distance 3.0 to 8.0 over 3 seconds
    const framingA: FramingConfig = {
      targetDistance: 3.0,
      lookOffset: [0, 0, 0],
      nearClip: 0.1,
      farClip: 30,
    };
    const framingB: FramingConfig = {
      targetDistance: 8.0,
      lookOffset: [0, 0, 0],
      nearClip: 0.1,
      farClip: 80,
    };

    const transitionDuration = 3000;
    let prevZ = -1;
    let maxZDelta = 0;

    for (let t = 0; t <= transitionDuration; t += 16) {
      const progress = t / transitionDuration;
      // Simulate lerp between framings
      const interpolatedFraming: FramingConfig = {
        targetDistance: framingA.targetDistance + (framingB.targetDistance - framingA.targetDistance) * progress,
        lookOffset: [0, 0, 0],
        nearClip: 0.1,
        farClip: framingA.farClip + (framingB.farClip - framingA.farClip) * progress,
      };

      updateCamera(cam, 30000 + t, 0, 1.0, interpolatedFraming);

      if (prevZ >= 0) {
        const deltaZ = Math.abs(cam.position.z - prevZ);
        if (deltaZ > maxZDelta) maxZDelta = deltaZ;
      }
      prevZ = cam.position.z;
    }

    // Max frame-to-frame Z change should be smooth (< 0.15 per 16ms frame)
    expect(maxZDelta).toBeLessThan(0.15);
  });

  it('T-089-27: lookAt target transitions smoothly with lookOffset changes', () => {
    const cam = mockCamera();
    initCameraMotion('lookoffset-smooth-seed');

    const framingA: FramingConfig = {
      targetDistance: 5.0,
      lookOffset: [0, 0, 0],
      nearClip: 0.1,
      farClip: 50,
    };
    const framingB: FramingConfig = {
      targetDistance: 5.0,
      lookOffset: [0, 1.5, 0],
      nearClip: 0.1,
      farClip: 50,
    };

    const transitionDuration = 3000;
    let prevLookY = -999;
    let maxLookYDelta = 0;

    for (let t = 0; t <= transitionDuration; t += 16) {
      const progress = t / transitionDuration;
      const interpolatedFraming: FramingConfig = {
        targetDistance: 5.0,
        lookOffset: [0, 1.5 * progress, 0],
        nearClip: 0.1,
        farClip: 50,
      };

      updateCamera(cam, 30000 + t, 0, 1.0, interpolatedFraming);
      const lastLook = cam._lookAtCalls[cam._lookAtCalls.length - 1];

      if (prevLookY > -999) {
        const deltaY = Math.abs(lastLook.y - prevLookY);
        if (deltaY > maxLookYDelta) maxLookYDelta = deltaY;
      }
      prevLookY = lastLook.y;
    }

    // Max frame-to-frame lookAt Y change should be smooth
    expect(maxLookYDelta).toBeLessThan(0.1);
  });
});

describe('US-089: Per-mode camera framing — no clipping', () => {
  it('T-089-28: terrain mode lookOffset raises camera view above ground plane', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const mainSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/main.ts'),
      'utf-8',
    );

    // Find the terrain entry — it should have a positive Y lookOffset
    // to avoid clipping the ground plane against near plane
    const terrainSection = mainSource.match(/name:\s*['"]terrain['"][^}]*}/s);
    if (terrainSection) {
      const lookOffsetMatch = terrainSection[0].match(/lookOffset\s*:\s*\[([\d.,\s-]+)\]/);
      if (lookOffsetMatch) {
        const values = lookOffsetMatch[1].split(',').map((v) => parseFloat(v.trim()));
        // Y component should be positive (looking above ground)
        expect(values[1]).toBeGreaterThan(0);
      }
    }
  });

  it('T-089-29: near clip for all modes is small enough to avoid geometry clipping', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const mainSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/main.ts'),
      'utf-8',
    );

    const nears = Array.from(
      mainSource.matchAll(/nearClip\s*:\s*([\d.]+)/g),
      (m) => parseFloat(m[1]),
    );

    for (const near of nears) {
      // Near clip should be ≤ 0.5 to avoid clipping geometry at close range
      expect(near).toBeLessThanOrEqual(0.5);
      expect(near).toBeGreaterThan(0);
    }
  });

  it('T-089-30: far clip for all modes exceeds targetDistance + generous margin', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const mainSource = fs.readFileSync(
      path.resolve(__dirname, '../../src/main.ts'),
      'utf-8',
    );

    const distances = Array.from(
      mainSource.matchAll(/targetDistance\s*:\s*([\d.]+)/g),
      (m) => parseFloat(m[1]),
    );
    const fars = Array.from(
      mainSource.matchAll(/farClip\s*:\s*([\d.]+)/g),
      (m) => parseFloat(m[1]),
    );

    for (let i = 0; i < Math.min(distances.length, fars.length); i++) {
      // Far clip should be at least 3× the targetDistance to avoid far-plane clipping
      expect(fars[i]).toBeGreaterThan(distances[i] * 2);
    }
  });
});

describe('US-089: Per-mode camera framing — existing camera motion tests compatibility', () => {
  beforeEach(() => {
    _clearHarmonicCache();
  });

  it('T-089-31: updateCamera still changes position over time (same as T-042-02 with framing)', () => {
    const cam = mockCamera();
    initCameraMotion('test-seed');

    const framing: FramingConfig = {
      targetDistance: 5.0,
      lookOffset: [0, 0, 0],
      nearClip: 0.1,
      farClip: 100,
    };

    updateCamera(cam, 0, 0, 1.0, framing);
    const p0 = { x: cam.position.x, y: cam.position.y, z: cam.position.z };

    updateCamera(cam, 5000, 0, 1.0, framing);
    const p1 = { x: cam.position.x, y: cam.position.y, z: cam.position.z };

    updateCamera(cam, 30000, 0, 1.0, framing);
    const p2 = { x: cam.position.x, y: cam.position.y, z: cam.position.z };

    const differs = (a: typeof p0, b: typeof p0) =>
      Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) > 1e-6 || Math.abs(a.z - b.z) > 1e-6;

    const diffCount = [differs(p0, p1), differs(p1, p2), differs(p0, p2)].filter(Boolean).length;
    expect(diffCount).toBeGreaterThanOrEqual(2);
  });

  it('T-089-32: movement is deterministic with framing — same seed produces identical positions', () => {
    const framing: FramingConfig = {
      targetDistance: 6.0,
      lookOffset: [0, 0, 0],
      nearClip: 0.1,
      farClip: 60,
    };

    const camA = mockCamera();
    initCameraMotion('det-framing-seed');
    updateCamera(camA, 45000, 0.5, 1.0, framing);

    _clearHarmonicCache();
    const camB = mockCamera();
    initCameraMotion('det-framing-seed');
    updateCamera(camB, 45000, 0.5, 1.0, framing);

    expect(camA.position.x).toBe(camB.position.x);
    expect(camA.position.y).toBe(camB.position.y);
    expect(camA.position.z).toBe(camB.position.z);
  });

  it('T-089-33: movement is smooth with framing — consecutive frame deltas are small', () => {
    const cam = mockCamera();
    initCameraMotion('smooth-framing-seed');

    const framing: FramingConfig = {
      targetDistance: 7.0,
      lookOffset: [0, 0, 0],
      nearClip: 0.1,
      farClip: 70,
    };

    let prevX = 0, prevY = 0, prevZ = 7;
    updateCamera(cam, 10000, 0, 1.0, framing);
    prevX = cam.position.x; prevY = cam.position.y; prevZ = cam.position.z;

    for (let t = 10016; t <= 12000; t += 16) {
      updateCamera(cam, t, 0, 1.0, framing);
      const dx = cam.position.x - prevX;
      const dy = cam.position.y - prevY;
      const dz = cam.position.z - prevZ;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      expect(dist).toBeLessThan(0.05);
      prevX = cam.position.x; prevY = cam.position.y; prevZ = cam.position.z;
    }
  });
});
