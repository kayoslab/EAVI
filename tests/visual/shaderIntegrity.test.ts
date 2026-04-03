import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as THREE from 'three';
import {
  parseGlslAttributes,
  parseGlslUniforms,
  parseGlslVaryings,
  GLSL_TYPE_TO_ITEM_SIZE,
} from '../../src/visual/shaderIntegrity';
import {
  COMMON_UNIFORMS,
  POINTCLOUD_ATTRIBUTES,
  PARTICLEFIELD_ATTRIBUTES,
  RIBBONFIELD_ATTRIBUTES,
} from '../../src/visual/shaderRegistry';
import { validateGeometryAttributes } from '../../src/visual/geometryValidator';

// Read raw shader sources
const shadersDir = path.resolve(__dirname, '../../src/visual/shaders');
const pointWarpVert = fs.readFileSync(path.join(shadersDir, 'pointWarp.vert.glsl'), 'utf-8');
const pointWarpFrag = fs.readFileSync(path.join(shadersDir, 'pointWarp.frag.glsl'), 'utf-8');
const particleWarpVert = fs.readFileSync(path.join(shadersDir, 'particleWarp.vert.glsl'), 'utf-8');
const particleWarpFrag = fs.readFileSync(path.join(shadersDir, 'particleWarp.frag.glsl'), 'utf-8');
const ribbonWarpVert = fs.readFileSync(path.join(shadersDir, 'ribbonWarp.vert.glsl'), 'utf-8');
const ribbonWarpFrag = fs.readFileSync(path.join(shadersDir, 'ribbonWarp.frag.glsl'), 'utf-8');
const noise3dGlsl = fs.readFileSync(path.join(shadersDir, 'noise3d.glsl'), 'utf-8');

// Three.js built-in attributes that are auto-injected (not declared in custom GLSL)
const THREEJS_BUILTIN_ATTRS = new Set(['position', 'normal', 'uv', 'color']);

// Shader system definitions
const SHADER_SYSTEMS = [
  {
    name: 'pointCloud',
    vertSource: pointWarpVert,
    fragSource: pointWarpFrag,
    requiredAttributes: POINTCLOUD_ATTRIBUTES,
  },
  {
    name: 'particleField',
    vertSource: particleWarpVert,
    fragSource: particleWarpFrag,
    requiredAttributes: PARTICLEFIELD_ATTRIBUTES,
  },
  {
    name: 'ribbonField',
    vertSource: ribbonWarpVert,
    fragSource: ribbonWarpFrag,
    requiredAttributes: RIBBONFIELD_ATTRIBUTES,
  },
];

// Comprehensive GLSL builtin/keyword allowlist
const GLSL_BUILTINS = new Set([
  // Keywords and qualifiers
  'if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue', 'discard',
  'void', 'const', 'true', 'false', 'in', 'out', 'inout',
  'uniform', 'attribute', 'varying', 'precision', 'highp', 'mediump', 'lowp',
  // Types
  'float', 'int', 'bool', 'vec2', 'vec3', 'vec4', 'mat2', 'mat3', 'mat4',
  'ivec2', 'ivec3', 'ivec4', 'bvec2', 'bvec3', 'bvec4', 'sampler2D', 'samplerCube',
  // Built-in variables
  'gl_Position', 'gl_PointSize', 'gl_PointCoord', 'gl_FragColor', 'gl_FragCoord',
  // Built-in functions
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'abs', 'floor', 'ceil', 'fract', 'mod', 'min', 'max', 'clamp', 'mix', 'step', 'smoothstep',
  'pow', 'exp', 'exp2', 'log', 'log2', 'sqrt', 'inversesqrt',
  'dot', 'cross', 'length', 'distance', 'normalize', 'reflect', 'refract',
  'sign', 'round', 'trunc',
  'texture2D', 'textureCube',
  // Three.js auto-injected uniforms
  'modelViewMatrix', 'projectionMatrix', 'modelMatrix', 'viewMatrix', 'normalMatrix', 'cameraPosition',
  // Three.js auto-injected attributes
  'position', 'normal', 'uv',
]);

// noise3d.glsl exported functions
const NOISE3D_EXPORTS = new Set(['snoise', 'fbm3', 'curl3', 'mod289', 'permute', 'taylorInvSqrt']);

/**
 * Extract all identifiers used in a GLSL shader body (after stripping comments).
 * Filters out swizzle components that follow a dot accessor.
 */
function extractBodyIdentifiers(source: string): Set<string> {
  // Strip comments
  let clean = source.replace(/\/\/.*$/gm, '');
  clean = clean.replace(/\/\*[\s\S]*?\*\//g, '');
  // Strip preprocessor lines
  clean = clean.replace(/^#.*$/gm, '');
  // Remove dot-accessed swizzles/members (e.g., .xyz, .xxyy, .r, .xy)
  clean = clean.replace(/\.\s*[a-zA-Z_]\w*/g, ' ');

  const ids = new Set<string>();
  const re = /\b([a-zA-Z_]\w*)\b/g;
  let m;
  while ((m = re.exec(clean)) !== null) {
    ids.add(m[1]);
  }
  return ids;
}

/**
 * Extract local variable declarations from GLSL main() and helper functions.
 * Matches patterns like: float x, vec3 pos, int i, etc.
 */
function extractLocalVariables(source: string): Set<string> {
  let clean = source.replace(/\/\/.*$/gm, '');
  clean = clean.replace(/\/\*[\s\S]*?\*\//g, '');
  const locals = new Set<string>();
  // Match type followed by variable name (in function bodies, for loops, etc.)
  const types = '(?:float|int|bool|vec[234]|mat[234]|ivec[234]|bvec[234]|void)';
  const re = new RegExp(`\\b${types}\\s+(\\w+)`, 'g');
  let m;
  while ((m = re.exec(clean)) !== null) {
    locals.add(m[1]);
  }
  return locals;
}

/**
 * Extract function declarations (name) from GLSL source.
 */
function extractFunctionNames(source: string): Set<string> {
  let clean = source.replace(/\/\/.*$/gm, '');
  clean = clean.replace(/\/\*[\s\S]*?\*\//g, '');
  const fns = new Set<string>();
  // Match: type funcName(
  const types = '(?:float|int|bool|vec[234]|mat[234]|ivec[234]|bvec[234]|void|vec3)';
  const re = new RegExp(`\\b${types}\\s+(\\w+)\\s*\\(`, 'g');
  let m;
  while ((m = re.exec(clean)) !== null) {
    fns.add(m[1]);
  }
  return fns;
}

/**
 * Extract function parameter names from GLSL source.
 */
function extractFunctionParams(source: string): Set<string> {
  let clean = source.replace(/\/\/.*$/gm, '');
  clean = clean.replace(/\/\*[\s\S]*?\*\//g, '');
  const params = new Set<string>();
  // Match function signatures and extract parameter names
  const fnRe = /\w+\s+\w+\s*\(([^)]*)\)/g;
  let fm;
  while ((fm = fnRe.exec(clean)) !== null) {
    const paramList = fm[1];
    // Extract individual params: "in/out type name" or "type name"
    const paramRe = /(?:in|out|inout)?\s*(?:float|int|bool|vec[234]|mat[234]|ivec[234]|bvec[234])\s+(\w+)/g;
    let pm;
    while ((pm = paramRe.exec(paramList)) !== null) {
      params.add(pm[1]);
    }
  }
  return params;
}

describe('T-049-01: Every custom attribute referenced in GLSL vertex shaders is explicitly declared', () => {
  for (const sys of SHADER_SYSTEMS) {
    it(`${sys.name}: all custom attributes used in shader body are declared`, () => {
      const declaredAttrs = parseGlslAttributes(sys.vertSource);
      const declaredNames = new Set(declaredAttrs.map((a) => a.name));

      // Known custom attribute names across the project
      const customAttrNames = ['size', 'aHueOffset', 'aRandom'];

      const bodyIds = extractBodyIdentifiers(sys.vertSource);
      for (const attrName of customAttrNames) {
        if (bodyIds.has(attrName)) {
          expect(declaredNames.has(attrName)).toBe(true);
        }
      }
    });

    it(`${sys.name}: Three.js built-in attribute 'position' is used but not required in custom declarations`, () => {
      const bodyIds = extractBodyIdentifiers(sys.vertSource);
      expect(bodyIds.has('position')).toBe(true);
      // position is auto-injected by Three.js, not declared in custom GLSL
    });
  }
});

describe('T-049-02: Every GLSL-declared custom attribute has a matching BufferGeometry binding', () => {
  for (const sys of SHADER_SYSTEMS) {
    it(`${sys.name}: every declared custom attribute exists in REQUIRED_ATTRIBUTES`, () => {
      const declaredAttrs = parseGlslAttributes(sys.vertSource);
      const reqMap = new Map(sys.requiredAttributes.map((a) => [a.name, a.itemSize]));

      for (const attr of declaredAttrs) {
        if (THREEJS_BUILTIN_ATTRS.has(attr.name)) continue;
        expect(reqMap.has(attr.name)).toBe(true);
      }
    });
  }
});

describe('T-049-03: Every custom uniform is declared and initialized', () => {
  for (const sys of SHADER_SYSTEMS) {
    it(`${sys.name}: all GLSL uniforms are present in COMMON_UNIFORMS`, () => {
      const vertUniforms = parseGlslUniforms(sys.vertSource);
      const fragUniforms = parseGlslUniforms(sys.fragSource);
      const allGlslUniforms = new Map<string, string>();
      for (const u of [...vertUniforms, ...fragUniforms]) {
        allGlslUniforms.set(u.name, u.type);
      }

      const registryMap = new Map(COMMON_UNIFORMS.map((u) => [u.name, u.type]));

      for (const [name, type] of allGlslUniforms) {
        expect(registryMap.has(name)).toBe(true);
        expect(registryMap.get(name)).toBe(type);
      }
    });

    it(`${sys.name}: COMMON_UNIFORMS has non-undefined default values`, () => {
      for (const u of COMMON_UNIFORMS) {
        expect(u.defaultValue).not.toBeUndefined();
      }
    });
  }
});

describe('T-049-04: No undeclared identifiers remain in vertex or fragment shaders', () => {
  for (const sys of SHADER_SYSTEMS) {
    // Build full source (noise3d + vert) as the runtime would
    const fullVertSource = noise3dGlsl + '\n' + sys.vertSource;

    for (const [label, source] of [['vertex', fullVertSource], ['fragment', sys.fragSource]] as const) {
      it(`${sys.name} ${label}: all identifiers are declared`, () => {
        // Build allowlist
        const allowed = new Set(GLSL_BUILTINS);
        for (const n of NOISE3D_EXPORTS) allowed.add(n);

        // Declared symbols from GLSL
        for (const a of parseGlslAttributes(source)) allowed.add(a.name);
        for (const u of parseGlslUniforms(source)) allowed.add(u.name);
        for (const v of parseGlslVaryings(source)) allowed.add(v.name);

        // Local variables and function names
        for (const l of extractLocalVariables(source)) allowed.add(l);
        for (const f of extractFunctionNames(source)) allowed.add(f);
        for (const p of extractFunctionParams(source)) allowed.add(p);

        // Constants declared with const
        const constRe = /\bconst\s+\w+\s+(\w+)/g;
        let cm;
        while ((cm = constRe.exec(source)) !== null) {
          allowed.add(cm[1]);
        }

        // Noise3d internal identifiers (local vars in the noise library)
        const noise3dLocals = extractLocalVariables(noise3dGlsl);
        const noise3dFns = extractFunctionNames(noise3dGlsl);
        const noise3dParams = extractFunctionParams(noise3dGlsl);
        for (const l of noise3dLocals) allowed.add(l);
        for (const f of noise3dFns) allowed.add(f);
        for (const p of noise3dParams) allowed.add(p);

        const bodyIds = extractBodyIdentifiers(source);
        const undeclared: string[] = [];
        for (const id of bodyIds) {
          if (!allowed.has(id)) {
            undeclared.push(id);
          }
        }

        expect(undeclared).toEqual([]);
      });
    }
  }
});

describe('T-049-05: GLSL attribute types match BufferAttribute itemSize', () => {
  for (const sys of SHADER_SYSTEMS) {
    it(`${sys.name}: attribute type → itemSize mapping is correct`, () => {
      const declaredAttrs = parseGlslAttributes(sys.vertSource);
      const reqMap = new Map(sys.requiredAttributes.map((a) => [a.name, a.itemSize]));

      for (const attr of declaredAttrs) {
        if (THREEJS_BUILTIN_ATTRS.has(attr.name)) continue;
        const expectedSize = GLSL_TYPE_TO_ITEM_SIZE[attr.type];
        expect(expectedSize).toBeDefined();
        expect(reqMap.get(attr.name)).toBe(expectedSize);
      }
    });
  }
});

describe('T-049-06: Uniform declarations are consistent across all vertex shaders', () => {
  it('all three vertex shaders declare identical uniform sets', () => {
    const uniformSets = SHADER_SYSTEMS.map((sys) => {
      const uniforms = parseGlslUniforms(sys.vertSource);
      return uniforms
        .map((u) => `${u.type} ${u.name}`)
        .sort()
        .join('\n');
    });

    expect(uniformSets[0]).toBe(uniformSets[1]);
    expect(uniformSets[1]).toBe(uniformSets[2]);
  });
});

describe('T-049-07: Fragment shader uniforms are subset of vertex shader uniforms', () => {
  for (const sys of SHADER_SYSTEMS) {
    it(`${sys.name}: every fragment uniform is declared in vertex shader or is fragment-only`, () => {
      const vertUniforms = new Map(
        parseGlslUniforms(sys.vertSource).map((u) => [u.name, u.type]),
      );
      const fragUniforms = parseGlslUniforms(sys.fragSource);

      // Known fragment-only uniforms
      const fragmentOnly = new Set(['uOpacity']);

      for (const u of fragUniforms) {
        const inVert = vertUniforms.has(u.name);
        const isFragOnly = fragmentOnly.has(u.name);
        expect(inVert || isFragOnly).toBe(true);

        // Fragment-only uniforms must still be in the registry
        if (isFragOnly) {
          const inRegistry = COMMON_UNIFORMS.some((r) => r.name === u.name);
          expect(inRegistry).toBe(true);
        }
      }
    });
  }
});

describe('T-049-08: Varyings are consistent between vertex and fragment shaders', () => {
  for (const sys of SHADER_SYSTEMS) {
    it(`${sys.name}: fragment varyings are a subset of vertex varyings with matching types`, () => {
      const vertVaryings = new Map(
        parseGlslVaryings(sys.vertSource).map((v) => [v.name, v.type]),
      );
      const fragVaryings = parseGlslVaryings(sys.fragSource);

      for (const v of fragVaryings) {
        expect(vertVaryings.has(v.name)).toBe(true);
        expect(vertVaryings.get(v.name)).toBe(v.type);
      }
    });
  }
});

describe('T-049-09: Runtime geometry validation catches missing attributes', () => {
  it('validateGeometryAttributes returns ok: false for missing attribute', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array([1]), 1));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    // Deliberately omit aHueOffset

    const result = validateGeometryAttributes(geometry, POINTCLOUD_ATTRIBUTES);
    expect(result.ok).toBe(false);
    const missingErrors = result.errors.filter((e) => e.reason.includes('missing'));
    expect(missingErrors.length).toBeGreaterThan(0);
    expect(missingErrors.some((e) => e.attribute === 'aHueOffset')).toBe(true);
  });

  it('validateGeometryAttributes returns ok: false for wrong itemSize', () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 1, 1]), 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(new Float32Array([1, 1, 1]), 3)); // wrong: should be 1
    geometry.setAttribute('aHueOffset', new THREE.BufferAttribute(new Float32Array([0]), 1));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));

    const result = validateGeometryAttributes(geometry, POINTCLOUD_ATTRIBUTES);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.attribute === 'size' && e.reason.includes('itemSize'))).toBe(true);
  });
});

describe('T-049-10: No forbidden storage APIs in shader integrity modules', () => {
  const FORBIDDEN = ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB', 'openDatabase'];

  it('shaderIntegrity.ts has no forbidden APIs', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/visual/shaderIntegrity.ts'),
      'utf-8',
    );
    for (const api of FORBIDDEN) {
      expect(source).not.toContain(api);
    }
  });

  it('shaderRegistry.ts has no forbidden APIs', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../../src/visual/shaderRegistry.ts'),
      'utf-8',
    );
    for (const api of FORBIDDEN) {
      expect(source).not.toContain(api);
    }
  });
});
