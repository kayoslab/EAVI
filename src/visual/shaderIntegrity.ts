import type * as THREE from 'three';

export interface GlslSymbol {
  name: string;
  type: string;
}

export const GLSL_TYPE_TO_ITEM_SIZE: Record<string, number> = {
  float: 1,
  vec2: 2,
  vec3: 3,
  vec4: 4,
  int: 1,
  mat3: 9,
  mat4: 16,
};

function stripComments(source: string): string {
  // Remove single-line comments
  let result = source.replace(/\/\/.*$/gm, '');
  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  return result;
}

export function parseGlslAttributes(source: string): GlslSymbol[] {
  const clean = stripComments(source);
  const results: GlslSymbol[] = [];
  const re = /\battribute\s+(float|vec[234]|int|mat[34])\s+(\w+)\s*;/g;
  let match;
  while ((match = re.exec(clean)) !== null) {
    results.push({ name: match[2], type: match[1] });
  }
  return results;
}

export function parseGlslUniforms(source: string): GlslSymbol[] {
  const clean = stripComments(source);
  const results: GlslSymbol[] = [];
  const re = /\buniform\s+(float|vec[234]|int|mat[34])\s+(\w+)\s*;/g;
  let match;
  while ((match = re.exec(clean)) !== null) {
    results.push({ name: match[2], type: match[1] });
  }
  return results;
}

export function parseGlslVaryings(source: string): GlslSymbol[] {
  const clean = stripComments(source);
  const results: GlslSymbol[] = [];
  const re = /\bvarying\s+(float|vec[234]|int|mat[34])\s+(\w+)\s*;/g;
  let match;
  while ((match = re.exec(clean)) !== null) {
    results.push({ name: match[2], type: match[1] });
  }
  return results;
}

export function validateShaderIntegrity(
  material: THREE.ShaderMaterial,
  geometry: THREE.BufferGeometry,
  systemName: string,
): void {
  const vertSource = material.vertexShader;
  const fragSource = material.fragmentShader;

  // Check uniforms declared in shaders exist in material.uniforms
  const vertUniforms = parseGlslUniforms(vertSource);
  const fragUniforms = parseGlslUniforms(fragSource);
  const allUniforms = new Map<string, string>();
  for (const u of [...vertUniforms, ...fragUniforms]) {
    allUniforms.set(u.name, u.type);
  }

  const missingUniforms: string[] = [];
  for (const [name] of allUniforms) {
    if (!(name in material.uniforms)) {
      missingUniforms.push(name);
    }
  }
  if (missingUniforms.length > 0) {
    throw new Error(
      `[${systemName}] Shader integrity: missing uniforms in material: ${missingUniforms.join(', ')}`,
    );
  }

  // Check custom attributes declared in vertex shader exist in geometry
  const THREEJS_BUILTIN_ATTRS = new Set(['position', 'normal', 'uv', 'color']);
  const vertAttrs = parseGlslAttributes(vertSource);

  const missingAttrs: string[] = [];
  const wrongSizes: string[] = [];
  for (const attr of vertAttrs) {
    if (THREEJS_BUILTIN_ATTRS.has(attr.name)) continue;

    const geomAttr = geometry.getAttribute(attr.name);
    if (!geomAttr) {
      missingAttrs.push(attr.name);
      continue;
    }

    const expectedSize = GLSL_TYPE_TO_ITEM_SIZE[attr.type];
    if (expectedSize !== undefined && geomAttr.itemSize !== expectedSize) {
      wrongSizes.push(
        `${attr.name}: expected itemSize ${expectedSize} (${attr.type}), got ${geomAttr.itemSize}`,
      );
    }
  }

  if (missingAttrs.length > 0) {
    throw new Error(
      `[${systemName}] Shader integrity: missing geometry attributes: ${missingAttrs.join(', ')}`,
    );
  }
  if (wrongSizes.length > 0) {
    throw new Error(
      `[${systemName}] Shader integrity: attribute size mismatches: ${wrongSizes.join('; ')}`,
    );
  }
}
