import { describe, it, expect } from 'vitest';
import { generateCubeGrowth } from '../../../src/visual/generators/cubeGrowth';

/**
 * US-070: Tests for cubeGrowth generator instance transform exports.
 *
 * The generator must expose per-cube instance offsets and scales
 * so the occluder InstancedMesh can match the wireframe geometry.
 */
describe('US-070: cubeGrowth generator instance transforms', () => {
  it('T-070-56: output includes instanceOffsets Float32Array', () => {
    const result = generateCubeGrowth({
      seed: 'inst-test',
      depth: 3,
      maxVertices: 320,
      maxEdges: 480,
    });
    expect(result.instanceOffsets).toBeInstanceOf(Float32Array);
  });

  it('T-070-57: output includes instanceScales Float32Array', () => {
    const result = generateCubeGrowth({
      seed: 'inst-test',
      depth: 3,
      maxVertices: 320,
      maxEdges: 480,
    });
    expect(result.instanceScales).toBeInstanceOf(Float32Array);
  });

  it('T-070-58: output includes normScale number', () => {
    const result = generateCubeGrowth({
      seed: 'inst-test',
      depth: 3,
      maxVertices: 320,
      maxEdges: 480,
    });
    expect(typeof result.normScale).toBe('number');
    expect(result.normScale).toBeGreaterThan(0);
  });

  it('T-070-59: instanceOffsets length = cubeCount * 3', () => {
    const result = generateCubeGrowth({
      seed: 'offset-len',
      depth: 3,
      maxVertices: 320,
      maxEdges: 480,
    });
    // cubeCount can be derived: each cube has 8 vertices
    const cubeCount = result.vertexCount / 8;
    expect(result.instanceOffsets.length).toBe(cubeCount * 3);
  });

  it('T-070-60: instanceScales length = cubeCount', () => {
    const result = generateCubeGrowth({
      seed: 'scale-len',
      depth: 3,
      maxVertices: 320,
      maxEdges: 480,
    });
    const cubeCount = result.vertexCount / 8;
    expect(result.instanceScales.length).toBe(cubeCount);
  });

  it('T-070-61: all instanceOffsets values are finite', () => {
    const result = generateCubeGrowth({
      seed: 'finite-off',
      depth: 4,
      maxVertices: 640,
      maxEdges: 960,
    });
    for (let i = 0; i < result.instanceOffsets.length; i++) {
      expect(isFinite(result.instanceOffsets[i])).toBe(true);
    }
  });

  it('T-070-62: all instanceScales values are finite and positive', () => {
    const result = generateCubeGrowth({
      seed: 'finite-scl',
      depth: 4,
      maxVertices: 640,
      maxEdges: 960,
    });
    for (let i = 0; i < result.instanceScales.length; i++) {
      expect(isFinite(result.instanceScales[i])).toBe(true);
      expect(result.instanceScales[i]).toBeGreaterThan(0);
    }
  });

  it('T-070-63: instanceOffsets are normalized (match vertex position normalization)', () => {
    const result = generateCubeGrowth({
      seed: 'norm-check',
      depth: 3,
      maxVertices: 320,
      maxEdges: 480,
    });
    // Offsets should be within a reasonable range (TARGET_RADIUS = 2.5)
    for (let i = 0; i < result.instanceOffsets.length; i++) {
      expect(Math.abs(result.instanceOffsets[i])).toBeLessThan(10);
    }
  });

  it('T-070-64: deterministic — same seed produces same instance transforms', () => {
    const config = { seed: 'det-inst', depth: 3, maxVertices: 320, maxEdges: 480 };
    const r1 = generateCubeGrowth(config);
    const r2 = generateCubeGrowth(config);
    expect(r1.instanceOffsets).toEqual(r2.instanceOffsets);
    expect(r1.instanceScales).toEqual(r2.instanceScales);
    expect(r1.normScale).toBe(r2.normScale);
  });
});
