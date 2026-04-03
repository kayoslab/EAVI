import { describe, it, expect } from 'vitest';
import { ShaderErrorCollector } from '../../src/visual/shaderErrorCollector';

function mockGL(): WebGLRenderingContext {
  return {} as unknown as WebGLRenderingContext;
}

function mockShader(): WebGLShader {
  return {} as unknown as WebGLShader;
}

describe('US-048: ShaderErrorCollector', () => {
  it('T-048-01: starts with no errors', () => {
    const collector = new ShaderErrorCollector();
    expect(collector.hasErrors()).toBe(false);
    expect(collector.getErrors()).toEqual([]);
  });

  it('T-048-02: collect() adds an error and hasErrors() returns true', () => {
    const collector = new ShaderErrorCollector();
    collector.collect(mockGL(), mockShader(), 'VERTEX', 'ERROR: 0:5: undeclared identifier');
    expect(collector.hasErrors()).toBe(true);
  });

  it('T-048-03: getErrors() returns all collected error records with correct fields', () => {
    const collector = new ShaderErrorCollector();
    collector.collect(mockGL(), mockShader(), 'VERTEX', 'ERROR: 0:5: undeclared identifier');
    collector.collect(mockGL(), mockShader(), 'FRAGMENT', 'ERROR: 0:10: syntax error');

    const errors = collector.getErrors();
    expect(errors).toHaveLength(2);
    expect(errors[0].shaderType).toBe('VERTEX');
    expect(errors[0].message).toBe('ERROR: 0:5: undeclared identifier');
    expect(errors[0].summary).toBeTruthy();
    expect(errors[1].shaderType).toBe('FRAGMENT');
    expect(errors[1].message).toBe('ERROR: 0:10: syntax error');
    expect(errors[1].summary).toBeTruthy();
  });

  it('T-048-04: clear() resets the collector to empty state', () => {
    const collector = new ShaderErrorCollector();
    collector.collect(mockGL(), mockShader(), 'VERTEX', 'some error');
    expect(collector.hasErrors()).toBe(true);

    collector.clear();
    expect(collector.hasErrors()).toBe(false);
    expect(collector.getErrors()).toEqual([]);
  });

  it('T-048-05: formatted summary includes shader type and source snippet', () => {
    const collector = new ShaderErrorCollector();
    collector.collect(mockGL(), mockShader(), 'VERTEX', 'ERROR: 0:5: undeclared identifier');

    const error = collector.getErrors()[0];
    expect(error.summary).toContain('VERTEX');
    expect(error.summary).toContain('ERROR: 0:5: undeclared identifier');
  });

  it('T-048-18: multiple errors from different shaders are stored independently', () => {
    const collector = new ShaderErrorCollector();
    collector.collect(mockGL(), mockShader(), 'VERTEX', 'error A');
    collector.collect(mockGL(), mockShader(), 'FRAGMENT', 'error B');
    collector.collect(mockGL(), mockShader(), 'VERTEX', 'error C');

    const errors = collector.getErrors();
    expect(errors).toHaveLength(3);
    expect(errors[0].message).toBe('error A');
    expect(errors[1].message).toBe('error B');
    expect(errors[2].message).toBe('error C');
  });
});
