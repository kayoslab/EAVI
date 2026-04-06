import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { ShaderErrorCollector } from '../../src/visual/shaderErrorCollector';
import { validateShaderCompilation } from '../../src/visual/shaderValidation';

function mockRenderer() {
  return { compile: vi.fn() } as unknown as THREE.WebGLRenderer;
}

function mockGL(): WebGLRenderingContext {
  return {} as unknown as WebGLRenderingContext;
}

function mockShader(): WebGLShader {
  return {} as unknown as WebGLShader;
}

describe('US-048: Shader validation', () => {
  it('T-048-06: returns silently when no errors are present', () => {
    const renderer = mockRenderer();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const collector = new ShaderErrorCollector();

    expect(() => validateShaderCompilation(renderer, scene, camera, collector)).not.toThrow();
    expect(renderer.compile).toHaveBeenCalledWith(scene, camera);
  });

  it('T-048-07: throws when shader errors are present', () => {
    const renderer = mockRenderer();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const collector = new ShaderErrorCollector();
    collector.collect(mockGL(), mockShader(), 'VERTEX', 'ERROR: undeclared identifier');

    expect(() => validateShaderCompilation(renderer, scene, camera, collector)).toThrow(/shader/i);
  });

  it('T-048-08: logs each error via console.error before throwing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const renderer = mockRenderer();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const collector = new ShaderErrorCollector();
    collector.collect(mockGL(), mockShader(), 'VERTEX', 'error one');
    collector.collect(mockGL(), mockShader(), 'FRAGMENT', 'error two');

    try {
      validateShaderCompilation(renderer, scene, camera, collector);
    } catch {
      // expected
    }

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[0][0]).toContain('VERTEX');
    expect(spy.mock.calls[1][0]).toContain('FRAGMENT');
    spy.mockRestore();
  });

  it('T-048-09: thrown error message includes shader type information', () => {
    const vi_spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const renderer = mockRenderer();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const collector = new ShaderErrorCollector();
    collector.collect(mockGL(), mockShader(), 'VERTEX', 'some error');

    let thrown: Error | undefined;
    try {
      validateShaderCompilation(renderer, scene, camera, collector);
    } catch (e) {
      thrown = e as Error;
    }

    expect(thrown).toBeDefined();
    expect(thrown!.message).toContain('VERTEX');
    vi_spy.mockRestore();
  });

  it('T-048-10: renderer.compile() is called to force synchronous shader compilation', () => {
    const renderer = mockRenderer();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const collector = new ShaderErrorCollector();

    validateShaderCompilation(renderer, scene, camera, collector);

    expect(renderer.compile).toHaveBeenCalledTimes(1);
    expect(renderer.compile).toHaveBeenCalledWith(scene, camera);
  });

  it('T-048-16: end-to-end with real ShaderErrorCollector (no errors path)', () => {
    const renderer = mockRenderer();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const collector = new ShaderErrorCollector();

    expect(() => validateShaderCompilation(renderer, scene, camera, collector)).not.toThrow();
    expect(renderer.compile).toHaveBeenCalledTimes(1);
  });
});
