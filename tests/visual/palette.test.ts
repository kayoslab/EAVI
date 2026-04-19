import { describe, it, expect } from 'vitest';
import {
  classifyGeo,
  getPaletteFamily,
  getAllPaletteFamilies,
  getAllGeoClasses,
} from '../../src/visual/palette';
import type { GeoClass } from '../../src/visual/palette';

describe('US-010: Palette module — geo classification and palette families', () => {
  it('T-010-01: classifyGeo returns "tropical" for known tropical countries', () => {
    for (const code of ['BR', 'TH', 'ID', 'NG']) {
      expect(classifyGeo(code, 'SP')).toBe('tropical');
    }
  });

  it('T-010-02: classifyGeo returns "northern" for northern hemisphere countries', () => {
    for (const code of ['NO', 'SE', 'FI']) {
      expect(classifyGeo(code, null)).toBe('northern');
    }
  });

  it('T-010-03: classifyGeo returns valid class for southern hemisphere countries', () => {
    const validClasses = getAllGeoClasses();
    for (const code of ['AU', 'NZ', 'AR']) {
      const cls = classifyGeo(code, null);
      expect(validClasses).toContain(cls);
    }
  });

  it('T-010-04: classifyGeo returns "unknown" for null country', () => {
    expect(classifyGeo(null, null)).toBe('unknown');
  });

  it('T-010-05: classifyGeo returns "unknown" for unrecognized country codes', () => {
    expect(classifyGeo('XX', null)).toBe('unknown');
    expect(classifyGeo('ZZ', 'AB')).toBe('unknown');
  });

  it('T-010-06: every geo class has a valid palette family entry', () => {
    const classes = getAllGeoClasses();
    for (const cls of classes) {
      const family = getPaletteFamily(cls);
      expect(family).toBeDefined();
      expect(family.id).toBe(cls);
    }
  });

  it('T-010-07: all palette family hueRanges are positive and at most 100', () => {
    const families = getAllPaletteFamilies();
    for (const [cls, family] of Object.entries(families)) {
      if (cls === 'unknown') continue; // unknown uses full range by design
      expect(family.hueRange).toBeGreaterThan(0);
      expect(family.hueRange).toBeLessThanOrEqual(100);
    }
  });

  it('T-010-08: all palette family saturationBase values are in 0.3-0.8', () => {
    const families = getAllPaletteFamilies();
    for (const family of Object.values(families)) {
      expect(family.saturationBase).toBeGreaterThanOrEqual(0.3);
      expect(family.saturationBase).toBeLessThanOrEqual(0.8);
    }
  });

  it('T-010-09: all palette family hueCenters are in 0-360 range', () => {
    const families = getAllPaletteFamilies();
    for (const family of Object.values(families)) {
      expect(family.hueCenter).toBeGreaterThanOrEqual(0);
      expect(family.hueCenter).toBeLessThanOrEqual(360);
    }
  });

  it('T-010-10: each distinct geo class maps to a palette family with a different hueCenter', () => {
    const families = getAllPaletteFamilies();
    const hueCenters = new Set<number>();
    for (const [cls, family] of Object.entries(families)) {
      if (cls === 'unknown') continue;
      hueCenters.add(family.hueCenter);
    }
    expect(hueCenters.size).toBeGreaterThanOrEqual(4);
  });
});
