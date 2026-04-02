import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  initCameraMotion,
  updateCamera,
  _clearHarmonicCache,
} from '../../src/visual/cameraMotion';

function mockCamera() {
  const lookAtCalls: { x: number; y: number; z: number }[] = [];
  return {
    position: { x: 0, y: 0, z: 5, set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; } },
    lookAt(x: number, y: number, z: number) { lookAtCalls.push({ x, y, z }); },
    _lookAtCalls: lookAtCalls,
  } as any;
}

describe('US-042: Autonomous spatial camera motion', () => {
  beforeEach(() => {
    _clearHarmonicCache();
  });

  it('T-042-01: initCameraMotion and updateCamera are exported functions', () => {
    expect(typeof initCameraMotion).toBe('function');
    expect(typeof updateCamera).toBe('function');
  });

  it('T-042-02: updateCamera changes camera position over time', () => {
    const cam = mockCamera();
    initCameraMotion('test-seed');

    updateCamera(cam, 0, 0, 1.0);
    const p0 = { x: cam.position.x, y: cam.position.y, z: cam.position.z };

    updateCamera(cam, 5000, 0, 1.0);
    const p1 = { x: cam.position.x, y: cam.position.y, z: cam.position.z };

    updateCamera(cam, 30000, 0, 1.0);
    const p2 = { x: cam.position.x, y: cam.position.y, z: cam.position.z };

    const differs = (a: typeof p0, b: typeof p0) =>
      Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) > 1e-6 || Math.abs(a.z - b.z) > 1e-6;

    const diffCount = [differs(p0, p1), differs(p1, p2), differs(p0, p2)].filter(Boolean).length;
    expect(diffCount).toBeGreaterThanOrEqual(2);
  });

  it('T-042-03: camera movement spans all three axes for parallax', () => {
    const cam = mockCamera();
    initCameraMotion('parallax-seed');

    const xs: number[] = [];
    const ys: number[] = [];
    const zs: number[] = [];

    for (let t = 0; t <= 60000; t += 1000) {
      updateCamera(cam, t, 0, 1.0);
      xs.push(cam.position.x);
      ys.push(cam.position.y);
      zs.push(cam.position.z);
    }

    const range = (arr: number[]) => Math.max(...arr) - Math.min(...arr);
    expect(range(xs)).toBeGreaterThan(0.05);
    expect(range(ys)).toBeGreaterThan(0.05);
    expect(range(zs)).toBeGreaterThan(0.05);
  });

  it('T-042-04: movement is smooth — consecutive frame deltas are small', () => {
    const cam = mockCamera();
    initCameraMotion('smooth-seed');

    let prevX = 0, prevY = 0, prevZ = 5;
    updateCamera(cam, 10000, 0, 1.0);
    prevX = cam.position.x; prevY = cam.position.y; prevZ = cam.position.z;

    for (let t = 10016; t <= 12000; t += 16) {
      updateCamera(cam, t, 0, 1.0);
      const dx = cam.position.x - prevX;
      const dy = cam.position.y - prevY;
      const dz = cam.position.z - prevZ;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      expect(dist).toBeLessThan(0.05);
      prevX = cam.position.x; prevY = cam.position.y; prevZ = cam.position.z;
    }
  });

  it('T-042-05: movement is deterministic — same seed produces identical positions', () => {
    const camA = mockCamera();
    initCameraMotion('det-seed');
    updateCamera(camA, 45000, 0.5, 1.0);

    _clearHarmonicCache();
    const camB = mockCamera();
    initCameraMotion('det-seed');
    updateCamera(camB, 45000, 0.5, 1.0);

    expect(camA.position.x).toBe(camB.position.x);
    expect(camA.position.y).toBe(camB.position.y);
    expect(camA.position.z).toBe(camB.position.z);
  });

  it('T-042-06: different seeds produce different camera paths', () => {
    const camA = mockCamera();
    initCameraMotion('seed-alpha');
    updateCamera(camA, 30000, 0, 1.0);

    _clearHarmonicCache();
    const camB = mockCamera();
    initCameraMotion('seed-beta');
    updateCamera(camB, 30000, 0, 1.0);

    const differs =
      Math.abs(camA.position.x - camB.position.x) > 1e-6 ||
      Math.abs(camA.position.y - camB.position.y) > 1e-6 ||
      Math.abs(camA.position.z - camB.position.z) > 1e-6;
    expect(differs).toBe(true);
  });

  it('T-042-07: pointer input does not affect camera position', () => {
    // updateCamera signature has no pointer parameter
    expect(updateCamera.length).toBe(4); // camera, elapsedMs, bassEnergy, motionAmplitude

    const cam = mockCamera();
    initCameraMotion('pointer-test');
    updateCamera(cam, 20000, 0.5, 1.0);
    const p1 = { x: cam.position.x, y: cam.position.y, z: cam.position.z };

    updateCamera(cam, 20000, 0.5, 1.0);
    const p2 = { x: cam.position.x, y: cam.position.y, z: cam.position.z };

    expect(p1.x).toBe(p2.x);
    expect(p1.y).toBe(p2.y);
    expect(p1.z).toBe(p2.z);
  });

  it('T-042-08: bass energy modulates camera orbit radius', () => {
    const camA = mockCamera();
    const camB = mockCamera();
    initCameraMotion('bass-test');

    updateCamera(camA, 30000, 0.0, 1.0);
    updateCamera(camB, 30000, 1.0, 1.0);

    const distA = Math.sqrt(camA.position.x ** 2 + camA.position.y ** 2 + (camA.position.z - 5) ** 2);
    const distB = Math.sqrt(camB.position.x ** 2 + camB.position.y ** 2 + (camB.position.z - 5) ** 2);
    expect(distB).toBeGreaterThanOrEqual(distA - 1e-10);
  });

  it('T-042-09: motionAmplitude=0.2 produces smaller offsets than motionAmplitude=1.0', () => {
    const camA = mockCamera();
    const camB = mockCamera();
    initCameraMotion('amp-test');

    updateCamera(camA, 30000, 0.5, 0.2);
    updateCamera(camB, 30000, 0.5, 1.0);

    const distA = Math.sqrt(camA.position.x ** 2 + camA.position.y ** 2 + (camA.position.z - 5) ** 2);
    const distB = Math.sqrt(camB.position.x ** 2 + camB.position.y ** 2 + (camB.position.z - 5) ** 2);

    expect(distA).toBeLessThanOrEqual(distB + 1e-10);
    // Should be approximately 0.2x
    if (distB > 0.001) {
      expect(distA / distB).toBeCloseTo(0.2, 1);
    }
  });

  it('T-042-10: camera stays within safe bounds over 300s sweep', () => {
    const cam = mockCamera();
    initCameraMotion('bounds-seed');

    for (let t = 0; t <= 300000; t += 1000) {
      updateCamera(cam, t, 0.5, 1.0);
      expect(Math.abs(cam.position.x)).toBeLessThan(3);
      expect(Math.abs(cam.position.y)).toBeLessThan(3);
      expect(cam.position.z).toBeGreaterThan(2);
      expect(cam.position.z).toBeLessThan(8);
    }
  });

  it('T-042-11: camera lookAt target stays near origin', () => {
    const cam = mockCamera();
    initCameraMotion('look-seed');

    const times = [0, 15000, 30000, 60000];
    for (const t of times) {
      updateCamera(cam, t, 0, 1.0);
    }

    for (const call of cam._lookAtCalls) {
      expect(Math.abs(call.x)).toBeLessThan(1);
      expect(Math.abs(call.y)).toBeLessThan(1);
      expect(Math.abs(call.z)).toBeLessThan(1);
    }
  });

  it('T-042-12: no hard resets — max frame-to-frame delta bounded over 120s', () => {
    const cam = mockCamera();
    initCameraMotion('delta-seed');

    let maxDelta = 0;
    updateCamera(cam, 0, 0, 1.0);
    let prevX = cam.position.x, prevY = cam.position.y, prevZ = cam.position.z;

    for (let t = 16; t <= 120000; t += 16) {
      updateCamera(cam, t, 0, 1.0);
      const dx = cam.position.x - prevX;
      const dy = cam.position.y - prevY;
      const dz = cam.position.z - prevZ;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > maxDelta) maxDelta = dist;
      prevX = cam.position.x; prevY = cam.position.y; prevZ = cam.position.z;
    }

    expect(maxDelta).toBeLessThan(0.1);
  });

  it('T-042-13: harmonic cache is reused for same seed', () => {
    const cam = mockCamera();
    initCameraMotion('cache-seed');
    updateCamera(cam, 50000, 0, 1.0);
    const p1 = { x: cam.position.x, y: cam.position.y, z: cam.position.z };

    initCameraMotion('cache-seed');
    updateCamera(cam, 50000, 0, 1.0);
    const p2 = { x: cam.position.x, y: cam.position.y, z: cam.position.z };

    expect(p1.x).toBe(p2.x);
    expect(p1.y).toBe(p2.y);
    expect(p1.z).toBe(p2.z);
  });

  it('T-042-14: no forbidden storage APIs accessed during camera motion', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'set');

    const cam = mockCamera();
    initCameraMotion('privacy-seed');
    updateCamera(cam, 10000, 0, 1.0);
    updateCamera(cam, 20000, 0.5, 1.0);
    updateCamera(cam, 30000, 1.0, 0.5);

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('T-042-15: organic non-repeating motion within 5 minutes', () => {
    const cam = mockCamera();
    initCameraMotion('organic-seed');

    const samples: number[] = [];
    for (let t = 0; t <= 300000; t += 1000) {
      updateCamera(cam, t, 0, 1.0);
      samples.push(Math.round(cam.position.x * 10000) / 10000);
    }

    // Check for repeated 30-sample subsequences
    for (let i = 0; i <= samples.length - 60; i++) {
      const seq = samples.slice(i, i + 30).join(',');
      for (let j = i + 30; j <= samples.length - 30; j++) {
        const cmp = samples.slice(j, j + 30).join(',');
        expect(seq).not.toBe(cmp);
      }
    }
  });

  it('T-042-16: renderLoop integrates camera motion — updateCamera called each frame', async () => {
    const cameraMotion = await import('../../src/visual/cameraMotion');
    const initSpy = vi.spyOn(cameraMotion, 'initCameraMotion');
    const updateSpy = vi.spyOn(cameraMotion, 'updateCamera');

    // Verify functions are importable and callable
    expect(typeof cameraMotion.initCameraMotion).toBe('function');
    expect(typeof cameraMotion.updateCamera).toBe('function');

    // Verify the renderLoop source imports and calls cameraMotion
    const fs = await import('fs');
    const path = await import('path');
    const loopSrc = fs.readFileSync(
      path.resolve(__dirname, '../../src/visual/renderLoop.ts'),
      'utf-8',
    );
    expect(loopSrc).toContain("import { initCameraMotion, updateCamera } from './cameraMotion'");
    expect(loopSrc).toContain('initCameraMotion(');
    expect(loopSrc).toContain('updateCamera(');

    initSpy.mockRestore();
    updateSpy.mockRestore();
  });

  it('T-042-17: motionAmplitude=0 results in no camera displacement', () => {
    const cam = mockCamera();
    initCameraMotion('zero-amp');

    updateCamera(cam, 30000, 0.5, 0);
    expect(Math.abs(cam.position.x)).toBeLessThan(0.001);
    expect(Math.abs(cam.position.y)).toBeLessThan(0.001);
    expect(Math.abs(cam.position.z - 5)).toBeLessThan(0.001);
  });
});
