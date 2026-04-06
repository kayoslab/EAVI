import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  selectGenerationMode,
  selectShape,
  generatePolyhedronEdges,
} from '../../../src/visual/generators/polyhedraEdges';
import type { PolyhedronShape, PolyhedronEdgeData } from '../../../src/visual/generators/polyhedraEdges';

describe('US-062: polyhedraEdges — GenerationMode and cube support', () => {
  // --- GenerationMode type and selectGenerationMode ---

  it('T-062-01: selectGenerationMode returns "plain" for low tier', () => {
    const seeds = ['seed-a', 'seed-b', 'seed-c', 'seed-d', 'seed-e'];
    for (const seed of seeds) {
      expect(selectGenerationMode(seed, 'low')).toBe('plain');
    }
  });

  it('T-062-02: selectGenerationMode returns a valid mode for medium tier', () => {
    const validModes = ['plain', 'geodesic', 'nested', 'dual'];
    const seeds = ['med-a', 'med-b', 'med-c', 'med-d', 'med-e', 'med-f', 'med-g', 'med-h'];
    for (const seed of seeds) {
      const mode = selectGenerationMode(seed, 'medium');
      expect(validModes).toContain(mode);
    }
  });

  it('T-062-03: selectGenerationMode returns a valid mode for high tier', () => {
    const validModes = ['plain', 'geodesic', 'nested', 'dual'];
    const seeds = ['hi-a', 'hi-b', 'hi-c', 'hi-d', 'hi-e', 'hi-f', 'hi-g', 'hi-h'];
    for (const seed of seeds) {
      const mode = selectGenerationMode(seed, 'high');
      expect(validModes).toContain(mode);
    }
  });

  it('T-062-04: selectGenerationMode is deterministic — same seed+tier gives same mode', () => {
    const mode1 = selectGenerationMode('deterministic-seed', 'high');
    const mode2 = selectGenerationMode('deterministic-seed', 'high');
    expect(mode1).toBe(mode2);
  });

  it('T-062-05: selectGenerationMode covers all four modes across enough seeds (medium tier)', () => {
    const modes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      modes.add(selectGenerationMode(`sweep-${i}`, 'medium'));
    }
    expect(modes).toContain('plain');
    expect(modes).toContain('geodesic');
    expect(modes).toContain('nested');
    expect(modes).toContain('dual');
  });

  it('T-062-06: selectGenerationMode covers all four modes across enough seeds (high tier)', () => {
    const modes = new Set<string>();
    for (let i = 0; i < 200; i++) {
      modes.add(selectGenerationMode(`hi-sweep-${i}`, 'high'));
    }
    expect(modes).toContain('plain');
    expect(modes).toContain('geodesic');
    expect(modes).toContain('nested');
    expect(modes).toContain('dual');
  });

  // --- Cube in PolyhedronShape but not in SHAPES ---

  it('T-062-07: selectShape never returns "cube" (cube is not in SHAPES selection array)', () => {
    for (let i = 0; i < 500; i++) {
      const shape = selectShape(`cube-test-${i}`);
      expect(shape).not.toBe('cube');
    }
  });

  it('T-062-08: generatePolyhedronEdges accepts "cube" as a valid shape', () => {
    const result = generatePolyhedronEdges({
      shape: 'cube' as PolyhedronShape,
      radius: 0.3,
      seed: 'cube-gen',
    });
    expect(result.edgeCount).toBeGreaterThan(0);
    expect(result.positions.length).toBe(result.edgeCount * 2 * 3);
    expect(result.randoms.length).toBe(result.edgeCount * 2 * 3);
  });

  it('T-062-09: cube generates exactly 12 edges', () => {
    const result = generatePolyhedronEdges({
      shape: 'cube' as PolyhedronShape,
      radius: 0.3,
      seed: 'cube-12',
    });
    expect(result.edgeCount).toBe(12);
  });

  it('T-062-10: cube edge positions are all finite', () => {
    const result = generatePolyhedronEdges({
      shape: 'cube' as PolyhedronShape,
      radius: 0.3,
      seed: 'cube-finite',
    });
    for (let i = 0; i < result.positions.length; i++) {
      expect(Number.isFinite(result.positions[i])).toBe(true);
    }
  });

  it('T-062-11: cube edge randoms are all in [0, 1)', () => {
    const result = generatePolyhedronEdges({
      shape: 'cube' as PolyhedronShape,
      radius: 0.3,
      seed: 'cube-randoms',
    });
    for (let i = 0; i < result.randoms.length; i++) {
      expect(result.randoms[i]).toBeGreaterThanOrEqual(0);
      expect(result.randoms[i]).toBeLessThan(1);
    }
  });
});
