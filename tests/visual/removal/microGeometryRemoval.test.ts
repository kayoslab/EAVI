import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { computeQuality, extractSystemConfig, scaleQualityProfile } from '../../../src/visual/quality';
import { COMPOUND_MODE_DEFS, buildCompoundEntries } from '../../../src/visual/compoundModes';
import type { BrowserSignals } from '../../../src/input/signals';
import type { GeometrySystem } from '../../../src/visual/types';

const mediumSignals: BrowserSignals = {
  language: 'en',
  timezone: 'UTC',
  devicePixelRatio: 2,
  hardwareConcurrency: 4,
  deviceMemory: 4,
  screenWidth: 390,
  screenHeight: 844,
  touchCapable: true,
  prefersColorScheme: 'dark',
  prefersReducedMotion: false,
};

const highSignals: BrowserSignals = {
  language: 'en',
  timezone: 'UTC',
  devicePixelRatio: 2,
  hardwareConcurrency: 16,
  deviceMemory: 8,
  screenWidth: 2560,
  screenHeight: 1440,
  touchCapable: false,
  prefersColorScheme: 'dark',
  prefersReducedMotion: false,
};

function createMockRegistry(): Record<string, (config: Record<string, unknown>) => GeometrySystem> {
  const names = ['pointcloud', 'wirepolyhedra', 'particles', 'crystal', 'flowribbon', 'ribbon', 'cubelattice', 'fractalgrowth'];
  const registry: Record<string, (config: Record<string, unknown>) => GeometrySystem> = {};
  for (const name of names) {
    registry[name] = vi.fn(() => ({ init: vi.fn(), draw: vi.fn(), cleanup: vi.fn(), setOpacity: vi.fn() }));
  }
  return registry;
}

describe('US-064: File removal verification', () => {
  it('T-064-01: microGeometry system source file is deleted', () => {
    const filePath = path.resolve(__dirname, '../../../src/visual/systems/microGeometry.ts');
    expect(existsSync(filePath)).toBe(false);
  });

  it('T-064-02: microGeo vertex shader is deleted', () => {
    const filePath = path.resolve(__dirname, '../../../src/visual/shaders/microGeo.vert.glsl');
    expect(existsSync(filePath)).toBe(false);
  });

  it('T-064-03: microGeo fragment shader is deleted', () => {
    const filePath = path.resolve(__dirname, '../../../src/visual/shaders/microGeo.frag.glsl');
    expect(existsSync(filePath)).toBe(false);
  });

  it('T-064-04: microGeometry test file is deleted', () => {
    const filePath = path.resolve(__dirname, '../../../tests/visual/systems/microGeometry.test.ts');
    expect(existsSync(filePath)).toBe(false);
  });
});

describe('US-064: QualityProfile regression', () => {
  it('T-064-05: QualityProfile does not include maxInstances field', () => {
    const result = computeQuality(mediumSignals);
    expect(result).not.toHaveProperty('maxInstances');
  });

  it('T-064-06: extractSystemConfig throws for microgeometry', () => {
    const profile = computeQuality(mediumSignals);
    expect(() => extractSystemConfig('microgeometry', profile)).toThrow();
  });

  it('T-064-07: extractSystemConfig covers 7 remaining system names', () => {
    const profile = computeQuality(mediumSignals);
    const names = ['particles', 'ribbon', 'pointcloud', 'crystal', 'wirepolyhedra', 'flowribbon', 'cubelattice'];
    for (const name of names) {
      expect(() => extractSystemConfig(name, profile)).not.toThrow();
      const config = extractSystemConfig(name, profile);
      expect(typeof config).toBe('object');
      expect(Object.keys(config).length).toBeGreaterThan(0);
    }
  });

  it('T-064-14: scaleQualityProfile result has no maxInstances', () => {
    const profile = computeQuality(mediumSignals);
    const scaled = scaleQualityProfile(profile, 0.5);
    expect(scaled).not.toHaveProperty('maxInstances');
  });

  it('T-064-15: scaleQualityProfile halves remaining count fields correctly', () => {
    const medium = computeQuality(mediumSignals);
    const scaled = scaleQualityProfile(medium, 0.5);
    expect(scaled.maxParticles).toBe(Math.round(medium.maxParticles * 0.5));
    expect(scaled.maxPoints).toBe(Math.round(medium.maxPoints * 0.5));
    expect(scaled.maxRibbonPoints).toBe(Math.round(medium.maxRibbonPoints * 0.5));
    expect(scaled.maxPolyhedra).toBeGreaterThanOrEqual(2);
    expect(scaled.maxFlowRibbonPoints).toBe(Math.round(medium.maxFlowRibbonPoints * 0.5));
  });
});

describe('US-064: CompoundModes regression', () => {
  it('T-064-08: COMPOUND_MODE_DEFS defines exactly 1 compound mode (after US-080 retirement)', () => {
    expect(COMPOUND_MODE_DEFS.length).toBe(1);
    for (const def of COMPOUND_MODE_DEFS) {
      expect(typeof def.name).toBe('string');
      expect(def.layers.length).toBe(2);
    }
  });

  it('T-064-09: COMPOUND_MODE_DEFS does not include crystal+microgeometry', () => {
    const names = COMPOUND_MODE_DEFS.map((d) => d.name);
    expect(names).not.toContain('crystal+microgeometry');
  });

  it('T-064-10: COMPOUND_MODE_DEFS retains particles+flowribbon (after US-080 retirement, fractalgrowth removed)', () => {
    const names = COMPOUND_MODE_DEFS.map((d) => d.name);
    expect(names).toContain('particles+flowribbon');
  });

  it('T-064-11: no compound mode layer references microgeometry', () => {
    for (const def of COMPOUND_MODE_DEFS) {
      for (const layer of def.layers) {
        expect(layer.systemName).not.toBe('microgeometry');
      }
    }
  });

  it('T-064-12: buildCompoundEntries returns 1 entry on medium tier (after US-080 retirement)', () => {
    const profile = computeQuality(mediumSignals);
    const registry = createMockRegistry();
    const entries = buildCompoundEntries(profile, registry);
    expect(entries.length).toBe(1);
  });

  it('T-064-13: buildCompoundEntries returns 1 entry on high tier (after US-080 retirement)', () => {
    const profile = computeQuality(highSignals);
    const registry = createMockRegistry();
    const entries = buildCompoundEntries(profile, registry);
    expect(entries.length).toBe(1);
  });

  it('T-064-20: each remaining compound mode has exactly one primary layer', () => {
    for (const def of COMPOUND_MODE_DEFS) {
      const primaryCount = def.layers.filter((l) => l.isPrimary).length;
      expect(primaryCount).toBe(1);
    }
  });
});

describe('US-064: Codebase hygiene', () => {
  it('T-064-16: no source file imports from microGeometry', () => {
    const srcDir = path.resolve(__dirname, '../../../src');
    let output = '';
    try {
      output = execSync(`grep -r "microGeometry\\|microgeometry\\|MicroGeometry\\|microGeo" ${srcDir} --include='*.ts' -l`, { encoding: 'utf-8' });
    } catch {
      output = '';
    }
    expect(output.trim()).toBe('');
  });

  it('T-064-17: no source file references maxInstances', () => {
    const srcDir = path.resolve(__dirname, '../../../src');
    let output = '';
    try {
      output = execSync(`grep -r "maxInstances" ${srcDir} --include='*.ts' -l`, { encoding: 'utf-8' });
    } catch {
      output = '';
    }
    expect(output.trim()).toBe('');
  });

  it('T-064-18: microGeo shader files do not exist', () => {
    const vertPath = path.resolve(__dirname, '../../../src/visual/shaders/microGeo.vert.glsl');
    const fragPath = path.resolve(__dirname, '../../../src/visual/shaders/microGeo.frag.glsl');
    expect(existsSync(vertPath)).toBe(false);
    expect(existsSync(fragPath)).toBe(false);
  });
});

describe('US-064: Build verification', () => {
  it('T-064-19: production build passes', () => {
    const root = path.resolve(__dirname, '../../..');
    expect(() => execSync('npm run build', { cwd: root, timeout: 60000 })).not.toThrow();
  }, 60000);
});
