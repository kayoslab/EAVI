import { describe, it, expect } from 'vitest';
import { WIREPOLYHEDRA_ATTRIBUTES, WIREPOLYHEDRA_VERTEX_ATTRIBUTES } from '../../src/visual/shaderRegistry';
import type { AttributeSpec } from '../../src/visual/types';

describe('US-065: Shader registry — wireframe vertex dot attributes', () => {
  it('T-065-66: WIREPOLYHEDRA_VERTEX_ATTRIBUTES is exported and is an array', () => {
    expect(Array.isArray(WIREPOLYHEDRA_VERTEX_ATTRIBUTES)).toBe(true);
    expect(WIREPOLYHEDRA_VERTEX_ATTRIBUTES.length).toBeGreaterThanOrEqual(2);
  });

  it('T-065-67: WIREPOLYHEDRA_VERTEX_ATTRIBUTES includes position with itemSize 3', () => {
    const pos = WIREPOLYHEDRA_VERTEX_ATTRIBUTES.find((a: AttributeSpec) => a.name === 'position');
    expect(pos).toBeDefined();
    expect(pos!.itemSize).toBe(3);
  });

  it('T-065-68: WIREPOLYHEDRA_VERTEX_ATTRIBUTES includes aRandom with itemSize 3', () => {
    const aRandom = WIREPOLYHEDRA_VERTEX_ATTRIBUTES.find((a: AttributeSpec) => a.name === 'aRandom');
    expect(aRandom).toBeDefined();
    expect(aRandom!.itemSize).toBe(3);
  });

  it('T-065-69: WIREPOLYHEDRA_VERTEX_ATTRIBUTES does not include edge-only attributes', () => {
    const names = WIREPOLYHEDRA_VERTEX_ATTRIBUTES.map((a: AttributeSpec) => a.name);
    expect(names).not.toContain('aEdgeParam');
    expect(names).not.toContain('aEdgeTangent');
  });

  it('T-065-70: existing WIREPOLYHEDRA_ATTRIBUTES still has position and aRandom', () => {
    const pos = WIREPOLYHEDRA_ATTRIBUTES.find((a: AttributeSpec) => a.name === 'position');
    expect(pos).toBeDefined();
    const aRandom = WIREPOLYHEDRA_ATTRIBUTES.find((a: AttributeSpec) => a.name === 'aRandom');
    expect(aRandom).toBeDefined();
  });
});
