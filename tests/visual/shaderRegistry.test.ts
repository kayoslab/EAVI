import { describe, it, expect } from 'vitest';
import { WIREPOLYHEDRA_ATTRIBUTES, FLOWRIBBON_ATTRIBUTES, OPTIONAL_FLOWRIBBON_ATTRIBUTES } from '../../src/visual/shaderRegistry';
import type { AttributeSpec } from '../../src/visual/types';

describe('US-054: Shader registry — wireframe polyhedra attributes', () => {
  it('T-054-45: WIREPOLYHEDRA_ATTRIBUTES is exported and is an array', () => {
    expect(Array.isArray(WIREPOLYHEDRA_ATTRIBUTES)).toBe(true);
    expect(WIREPOLYHEDRA_ATTRIBUTES.length).toBeGreaterThanOrEqual(2);
  });

  it('T-054-46: WIREPOLYHEDRA_ATTRIBUTES includes position with itemSize 3', () => {
    const pos = WIREPOLYHEDRA_ATTRIBUTES.find((a) => a.name === 'position');
    expect(pos).toBeDefined();
    expect(pos!.itemSize).toBe(3);
  });

  it('T-054-47: WIREPOLYHEDRA_ATTRIBUTES includes aRandom with itemSize 3', () => {
    const aRandom = WIREPOLYHEDRA_ATTRIBUTES.find((a) => a.name === 'aRandom');
    expect(aRandom).toBeDefined();
    expect(aRandom!.itemSize).toBe(3);
  });

  it('T-054-48: WIREPOLYHEDRA_ATTRIBUTES does not include point-only attributes (aHueOffset, aDistance, color, size)', () => {
    const names = WIREPOLYHEDRA_ATTRIBUTES.map((a) => a.name);
    expect(names).not.toContain('aHueOffset');
    expect(names).not.toContain('aDistance');
    expect(names).not.toContain('color');
    expect(names).not.toContain('size');
  });
});

describe('US-063: Shader registry — flow ribbon attributes', () => {
  it('T-063-31: FLOWRIBBON_ATTRIBUTES registered in shaderRegistry', () => {
    expect(FLOWRIBBON_ATTRIBUTES).toBeDefined();
    expect(Array.isArray(FLOWRIBBON_ATTRIBUTES)).toBe(true);
    const names = FLOWRIBBON_ATTRIBUTES.map((a: AttributeSpec) => a.name);
    expect(names).toContain('position');
    expect(names).toContain('aVertexColor');
    expect(names).toContain('aRandom');
  });

  it('T-063-32: OPTIONAL_FLOWRIBBON_ATTRIBUTES includes size attribute', () => {
    expect(OPTIONAL_FLOWRIBBON_ATTRIBUTES).toBeDefined();
    expect(Array.isArray(OPTIONAL_FLOWRIBBON_ATTRIBUTES)).toBe(true);
    const sizeSpec = OPTIONAL_FLOWRIBBON_ATTRIBUTES.find((a: AttributeSpec) => a.name === 'size');
    expect(sizeSpec).toBeDefined();
    expect(sizeSpec!.itemSize).toBe(1);
  });
});
