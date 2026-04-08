import { describe, it, expect } from 'vitest';
import {
  TERRAIN_ATTRIBUTES,
  OPTIONAL_TERRAIN_ATTRIBUTES,
} from '../../src/visual/shaderRegistry';
import type { AttributeSpec } from '../../src/visual/types';

describe('US-075: Shader registry — terrain attributes', () => {
  it('T-075-41: TERRAIN_ATTRIBUTES is exported and is an array', () => {
    expect(Array.isArray(TERRAIN_ATTRIBUTES)).toBe(true);
    expect(TERRAIN_ATTRIBUTES.length).toBeGreaterThanOrEqual(2);
  });

  it('T-075-42: TERRAIN_ATTRIBUTES includes position with itemSize 3', () => {
    const pos = TERRAIN_ATTRIBUTES.find((a: AttributeSpec) => a.name === 'position');
    expect(pos).toBeDefined();
    expect(pos!.itemSize).toBe(3);
  });

  it('T-075-43: TERRAIN_ATTRIBUTES includes aRandom with itemSize 3', () => {
    const aRandom = TERRAIN_ATTRIBUTES.find((a: AttributeSpec) => a.name === 'aRandom');
    expect(aRandom).toBeDefined();
    expect(aRandom!.itemSize).toBe(3);
  });

  it('T-075-44: OPTIONAL_TERRAIN_ATTRIBUTES is exported and is an array', () => {
    expect(Array.isArray(OPTIONAL_TERRAIN_ATTRIBUTES)).toBe(true);
    expect(OPTIONAL_TERRAIN_ATTRIBUTES.length).toBeGreaterThanOrEqual(1);
  });

  it('T-075-45: OPTIONAL_TERRAIN_ATTRIBUTES includes aVertexColor with itemSize 3', () => {
    const vc = OPTIONAL_TERRAIN_ATTRIBUTES.find((a: AttributeSpec) => a.name === 'aVertexColor');
    expect(vc).toBeDefined();
    expect(vc!.itemSize).toBe(3);
  });

  it('T-075-46: TERRAIN_ATTRIBUTES does not include aVertexColor (it is optional)', () => {
    const names = TERRAIN_ATTRIBUTES.map((a: AttributeSpec) => a.name);
    expect(names).not.toContain('aVertexColor');
  });
});
