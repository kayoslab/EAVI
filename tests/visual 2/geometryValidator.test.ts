import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { validateGeometryAttributes } from '../../src/visual/geometryValidator';
import type { AttributeSpec } from '../../src/visual/types';

const FULL_SCHEMA: AttributeSpec[] = [
  { name: 'position', itemSize: 3 },
  { name: 'color', itemSize: 3 },
  { name: 'size', itemSize: 1 },
  { name: 'aHueOffset', itemSize: 1 },
  { name: 'aRandom', itemSize: 3 },
];

function createValidGeometry(pointCount: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pointCount * 3).fill(1.0), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pointCount * 3).fill(0.5), 3));
  geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(pointCount).fill(0.04), 1));
  geo.setAttribute('aHueOffset', new THREE.BufferAttribute(new Float32Array(pointCount).fill(10), 1));
  geo.setAttribute('aRandom', new THREE.BufferAttribute(new Float32Array(pointCount * 3).fill(0.5), 3));
  return geo;
}

describe('US-050: geometryValidator', () => {
  it('T-050-01: returns ok:true for geometry with all required attributes at correct item sizes and finite values', () => {
    const geo = createValidGeometry(10);
    const result = validateGeometryAttributes(geo, FULL_SCHEMA);
    expect(result.ok).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('T-050-02: detects missing attribute and returns descriptive error', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const schema: AttributeSpec[] = [
      { name: 'position', itemSize: 3 },
      { name: 'size', itemSize: 1 },
    ];
    const result = validateGeometryAttributes(geo, schema);
    expect(result.ok).toBe(false);
    const sizeError = result.errors.find((e) => e.attribute === 'size');
    expect(sizeError).toBeDefined();
    expect(sizeError!.reason).toMatch(/missing/i);
  });

  it('T-050-03: detects wrong itemSize for position attribute', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4), 2));
    const schema: AttributeSpec[] = [{ name: 'position', itemSize: 3 }];
    const result = validateGeometryAttributes(geo, schema);
    expect(result.ok).toBe(false);
    const posError = result.errors.find((e) => e.attribute === 'position');
    expect(posError).toBeDefined();
    expect(posError!.reason).toContain('3');
    expect(posError!.reason).toContain('2');
  });

  it('T-050-04: detects NaN values in position buffer', () => {
    const geo = createValidGeometry(4);
    const posArr = (geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    posArr[3] = NaN;
    const result = validateGeometryAttributes(geo, FULL_SCHEMA);
    expect(result.ok).toBe(false);
    const posError = result.errors.find((e) => e.attribute === 'position');
    expect(posError).toBeDefined();
    expect(posError!.reason).toMatch(/NaN|non-finite/i);
  });

  it('T-050-05: detects Infinity values in size buffer', () => {
    const geo = createValidGeometry(4);
    const sizeArr = (geo.getAttribute('size') as THREE.BufferAttribute).array as Float32Array;
    sizeArr[0] = Infinity;
    const result = validateGeometryAttributes(geo, FULL_SCHEMA);
    expect(result.ok).toBe(false);
    const sizeError = result.errors.find((e) => e.attribute === 'size');
    expect(sizeError).toBeDefined();
    expect(sizeError!.reason).toMatch(/non-finite/i);
  });

  it('T-050-06: detects negative Infinity in aRandom buffer', () => {
    const geo = createValidGeometry(4);
    const arr = (geo.getAttribute('aRandom') as THREE.BufferAttribute).array as Float32Array;
    arr[0] = -Infinity;
    const result = validateGeometryAttributes(geo, FULL_SCHEMA);
    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.attribute === 'aRandom');
    expect(err).toBeDefined();
  });

  it('T-050-07: passes for empty geometry (0-length Float32Arrays)', () => {
    const geo = createValidGeometry(0);
    const result = validateGeometryAttributes(geo, FULL_SCHEMA);
    expect(result.ok).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('T-050-08: passes for single-point geometry with valid values', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([1, 2, 3]), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.5, 0.5, 0.5]), 3));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array([0.04]), 1));
    geo.setAttribute('aHueOffset', new THREE.BufferAttribute(new Float32Array([10]), 1));
    geo.setAttribute('aRandom', new THREE.BufferAttribute(new Float32Array([0.1, 0.2, 0.3]), 3));
    const result = validateGeometryAttributes(geo, FULL_SCHEMA);
    expect(result.ok).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('T-050-09: reports multiple errors when multiple attributes are invalid', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3));
    const sizeArr = new Float32Array([NaN]);
    geo.setAttribute('size', new THREE.BufferAttribute(sizeArr, 1));
    geo.setAttribute('aHueOffset', new THREE.BufferAttribute(new Float32Array([10]), 1));
    geo.setAttribute('aRandom', new THREE.BufferAttribute(new Float32Array([0.1, 0.2, 0.3]), 3));
    // color is missing
    const result = validateGeometryAttributes(geo, FULL_SCHEMA);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.errors.some((e) => e.attribute === 'color')).toBe(true);
    expect(result.errors.some((e) => e.attribute === 'size')).toBe(true);
  });

  it('T-050-10: with no expected attributes passes any geometry', () => {
    const geo = new THREE.BufferGeometry();
    const result = validateGeometryAttributes(geo, []);
    expect(result.ok).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('T-050-11: detects wrong itemSize on custom attribute (aRandom expects 3, given 1)', () => {
    const geo = createValidGeometry(4);
    geo.deleteAttribute('aRandom');
    geo.setAttribute('aRandom', new THREE.BufferAttribute(new Float32Array(4), 1));
    const result = validateGeometryAttributes(geo, FULL_SCHEMA);
    expect(result.ok).toBe(false);
    const err = result.errors.find((e) => e.attribute === 'aRandom');
    expect(err).toBeDefined();
    expect(err!.reason).toContain('itemSize');
  });

  it('T-050-12: accepts negative finite values (valid for positions)', () => {
    const geo = createValidGeometry(1);
    const posArr = (geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    posArr[0] = -5.0;
    posArr[1] = -3.2;
    posArr[2] = -1.0;
    const result = validateGeometryAttributes(geo, FULL_SCHEMA);
    expect(result.ok).toBe(true);
  });

  it('T-050-13: accepts zero values in all buffers (valid edge case)', () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3).fill(0), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3).fill(0), 3));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(1).fill(0), 1));
    geo.setAttribute('aHueOffset', new THREE.BufferAttribute(new Float32Array(1).fill(0), 1));
    geo.setAttribute('aRandom', new THREE.BufferAttribute(new Float32Array(3).fill(0), 3));
    const result = validateGeometryAttributes(geo, FULL_SCHEMA);
    expect(result.ok).toBe(true);
  });
});
