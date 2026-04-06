import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as THREE from 'three';
import {
  parseGlslAttributes,
  parseGlslUniforms,
  parseGlslVaryings,
} from '../../src/visual/shaderIntegrity';
import {
  COMMON_UNIFORMS,
  POINTCLOUD_ATTRIBUTES,
  PARTICLEFIELD_ATTRIBUTES,
  RIBBONFIELD_ATTRIBUTES,
} from '../../src/visual/shaderRegistry';
import { validateGeometryAttributes } from '../../src/visual/geometryValidator';
import type { AttributeSpec } from '../../src/visual/types';

// Read raw shader sources
const shadersDir = path.resolve(__dirname, '../../src/visual/shaders');
const pointWarpVert = fs.readFileSync(path.join(shadersDir, 'pointWarp.vert.glsl'), 'utf-8');
const particleWarpVert = fs.readFileSync(path.join(shadersDir, 'particleWarp.vert.glsl'), 'utf-8');
const ribbonWarpVert = fs.readFileSync(path.join(shadersDir, 'ribbonWarp.vert.glsl'), 'utf-8');
const crystalWarpVert = fs.readFileSync(path.join(shadersDir, 'crystalWarp.vert.glsl'), 'utf-8');

const ALL_VERT_SHADERS = [
  { name: 'pointWarp', source: pointWarpVert },
  { name: 'particleWarp', source: particleWarpVert },
  { name: 'ribbonWarp', source: ribbonWarpVert },
  { name: 'crystalWarp', source: crystalWarpVert },
];

// GLSL mix(a, b, t) = a * (1 - t) + b * t
function glslMix(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

describe('US-051: Fallback point-size path', () => {
  describe('T-051-01: All vertex shaders declare uHasSizeAttr uniform', () => {
    for (const shader of ALL_VERT_SHADERS) {
      it(`${shader.name}: declares uniform float uHasSizeAttr`, () => {
        const uniforms = parseGlslUniforms(shader.source);
        const hasSizeAttr = uniforms.find((u) => u.name === 'uHasSizeAttr');
        expect(hasSizeAttr).toBeDefined();
        expect(hasSizeAttr!.type).toBe('float');
      });
    }
  });

  describe('T-051-02: All vertex shaders use mix() fallback for point size', () => {
    for (const shader of ALL_VERT_SHADERS) {
      it(`${shader.name}: uses sizeMultiplier via mix(1.0, size, uHasSizeAttr)`, () => {
        // Must contain the mix fallback pattern
        expect(shader.source).toMatch(/mix\s*\(\s*1\.0\s*,\s*size\s*,\s*uHasSizeAttr\s*\)/);
      });

      it(`${shader.name}: declares sizeMultiplier local variable`, () => {
        expect(shader.source).toMatch(/float\s+sizeMultiplier/);
      });

      it(`${shader.name}: uses sizeMultiplier (not raw size) in pointSize calculation`, () => {
        // The pointSize line should reference sizeMultiplier, not raw 'size *'
        const pointSizeLines = shader.source
          .split('\n')
          .filter((line) => line.includes('float pointSize') && line.includes('uBasePointSize'));
        expect(pointSizeLines.length).toBe(1);
        expect(pointSizeLines[0]).toContain('sizeMultiplier');
        // Should NOT use raw 'size *' in the pointSize line
        expect(pointSizeLines[0]).not.toMatch(/\bsize\s*\*/);
      });
    }
  });

  describe('T-051-03: uHasSizeAttr defaults to 0.0 in COMMON_UNIFORMS', () => {
    it('COMMON_UNIFORMS contains uHasSizeAttr with float type and 0.0 default', () => {
      const spec = COMMON_UNIFORMS.find((u) => u.name === 'uHasSizeAttr');
      expect(spec).toBeDefined();
      expect(spec!.type).toBe('float');
      expect(spec!.defaultValue).toBe(0.0);
    });
  });

  describe('T-051-04: Required attribute arrays no longer include size', () => {
    it('POINTCLOUD_ATTRIBUTES does not contain size', () => {
      expect(POINTCLOUD_ATTRIBUTES.find((a) => a.name === 'size')).toBeUndefined();
    });

    it('PARTICLEFIELD_ATTRIBUTES does not contain size', () => {
      expect(PARTICLEFIELD_ATTRIBUTES.find((a) => a.name === 'size')).toBeUndefined();
    });

    it('RIBBONFIELD_ATTRIBUTES does not contain size', () => {
      expect(RIBBONFIELD_ATTRIBUTES.find((a) => a.name === 'size')).toBeUndefined();
    });
  });

  describe('T-051-05: Optional attribute arrays contain size', () => {
    let OPTIONAL_POINTCLOUD_ATTRIBUTES: AttributeSpec[];
    let OPTIONAL_PARTICLEFIELD_ATTRIBUTES: AttributeSpec[];
    let OPTIONAL_RIBBONFIELD_ATTRIBUTES: AttributeSpec[];

    beforeAll(async () => {
      const registry = await import('../../src/visual/shaderRegistry');
      OPTIONAL_POINTCLOUD_ATTRIBUTES = registry.OPTIONAL_POINTCLOUD_ATTRIBUTES;
      OPTIONAL_PARTICLEFIELD_ATTRIBUTES = registry.OPTIONAL_PARTICLEFIELD_ATTRIBUTES;
      OPTIONAL_RIBBONFIELD_ATTRIBUTES = registry.OPTIONAL_RIBBONFIELD_ATTRIBUTES;
    });

    it('OPTIONAL_POINTCLOUD_ATTRIBUTES contains size with itemSize 1', () => {
      const sizeSpec = OPTIONAL_POINTCLOUD_ATTRIBUTES.find((a) => a.name === 'size');
      expect(sizeSpec).toBeDefined();
      expect(sizeSpec!.itemSize).toBe(1);
    });

    it('OPTIONAL_PARTICLEFIELD_ATTRIBUTES contains size with itemSize 1', () => {
      const sizeSpec = OPTIONAL_PARTICLEFIELD_ATTRIBUTES.find((a) => a.name === 'size');
      expect(sizeSpec).toBeDefined();
      expect(sizeSpec!.itemSize).toBe(1);
    });

    it('OPTIONAL_RIBBONFIELD_ATTRIBUTES contains size with itemSize 1', () => {
      const sizeSpec = OPTIONAL_RIBBONFIELD_ATTRIBUTES.find((a) => a.name === 'size');
      expect(sizeSpec).toBeDefined();
      expect(sizeSpec!.itemSize).toBe(1);
    });
  });

  describe('T-051-06: Geometry validator passes when optional size attribute is absent', () => {
    it('validates ok when geometry has all required attrs but no optional size', () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1]), 3));
      geo.setAttribute('aHueOffset', new THREE.BufferAttribute(new Float32Array([0.1]), 1));
      geo.setAttribute('aRandom', new THREE.BufferAttribute(new Float32Array([0.1, 0.2, 0.3]), 3));

      // Validate against required-only attrs (size excluded)
      const result = validateGeometryAttributes(geo, POINTCLOUD_ATTRIBUTES);
      expect(result.ok).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('T-051-07: Geometry validator validates present optional attributes', () => {
    it('passes when optional size attribute is present with correct itemSize and finite values', () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
      geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array([0.05]), 1));

      const optionalAttrs: AttributeSpec[] = [{ name: 'size', itemSize: 1 }];
      const result = validateGeometryAttributes(geo, [], optionalAttrs);
      expect(result.ok).toBe(true);
    });
  });

  describe('T-051-08: Geometry validator catches NaN in optional size attribute', () => {
    it('reports error when optional size attribute contains NaN', () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
      const sizeArr = new Float32Array([NaN]);
      geo.setAttribute('size', new THREE.BufferAttribute(sizeArr, 1));

      const optionalAttrs: AttributeSpec[] = [{ name: 'size', itemSize: 1 }];
      const result = validateGeometryAttributes(geo, [], optionalAttrs);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.attribute === 'size' && e.reason.includes('NaN'))).toBe(true);
    });
  });

  describe('T-051-09: Geometry validator catches wrong itemSize on optional size attribute', () => {
    it('reports error when optional size attribute has wrong itemSize', () => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
      geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array([1, 1, 1]), 3)); // wrong itemSize

      const optionalAttrs: AttributeSpec[] = [{ name: 'size', itemSize: 1 }];
      const result = validateGeometryAttributes(geo, [], optionalAttrs);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.attribute === 'size' && e.reason.includes('itemSize'))).toBe(true);
    });
  });

  describe('T-051-10: mix(1.0, size, 0.0) yields safe baseline of 1.0', () => {
    it('fallback produces multiplier of 1.0 regardless of size value', () => {
      // When uHasSizeAttr = 0.0, mix(1.0, size, 0.0) should always be 1.0
      for (const sizeVal of [0.0, 0.03, 0.07, 1.0, 100.0, -1.0]) {
        expect(glslMix(1.0, sizeVal, 0.0)).toBe(1.0);
      }
    });
  });

  describe('T-051-11: mix(1.0, size, 1.0) yields per-vertex size when enabled', () => {
    it('enabled path produces the per-vertex size value', () => {
      // When uHasSizeAttr = 1.0, mix(1.0, size, 1.0) should yield size
      for (const sizeVal of [0.03, 0.05, 0.07, 1.0]) {
        expect(glslMix(1.0, sizeVal, 1.0)).toBeCloseTo(sizeVal, 10);
      }
    });
  });

  describe('T-051-12: All GLSL uniforms including uHasSizeAttr are registered', () => {
    const registryMap = new Map(COMMON_UNIFORMS.map((u) => [u.name, u.type]));

    for (const shader of ALL_VERT_SHADERS) {
      it(`${shader.name}: every uniform is in COMMON_UNIFORMS with correct type`, () => {
        const uniforms = parseGlslUniforms(shader.source);
        for (const u of uniforms) {
          expect(registryMap.has(u.name)).toBe(true);
          expect(registryMap.get(u.name)).toBe(u.type);
        }
      });
    }
  });

  describe('T-051-13: Shader identifier resolution still passes with new symbols', () => {
    for (const shader of ALL_VERT_SHADERS) {
      it(`${shader.name}: sizeMultiplier is a declared local variable`, () => {
        // sizeMultiplier should be declared as a local float
        expect(shader.source).toMatch(/float\s+sizeMultiplier\s*=/);
      });

      it(`${shader.name}: uHasSizeAttr is a declared uniform`, () => {
        expect(shader.source).toMatch(/uniform\s+float\s+uHasSizeAttr/);
      });
    }
  });
});
