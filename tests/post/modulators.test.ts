import { describe, it, expect, vi } from 'vitest';
import { applyModulators, ZERO_SOURCES, type Modulator } from '../../src/post/modulators';
import { DEFAULT_POST, PARAM_RANGES } from '../../src/post/params';

describe('post modulators', () => {
  it('adds amount scaled by the source and clamps to the parameter range', () => {
    const mods: Modulator[] = [{ param: 'bloomNear', source: 'bass', amount: 0.5 }];
    const half = applyModulators(DEFAULT_POST, { ...ZERO_SOURCES, bass: 0.5 }, mods);
    expect(half.bloomNear).toBeCloseTo(DEFAULT_POST.bloomNear + 0.25, 6);
    const huge = applyModulators(DEFAULT_POST, { ...ZERO_SOURCES, bass: 1 }, [{ param: 'bloomNear', source: 'bass', amount: 100 }]);
    expect(huge.bloomNear).toBe(PARAM_RANGES.bloomNear[1]);
  });

  it('applies the power curve to the source', () => {
    const mods: Modulator[] = [{ param: 'rgbShift', source: 'treble', amount: 0.01, curve: 2 }];
    const out = applyModulators(DEFAULT_POST, { ...ZERO_SOURCES, treble: 0.5 }, mods);
    expect(out.rgbShift).toBeCloseTo(DEFAULT_POST.rgbShift + 0.0025, 6);
  });

  it('never changes exposure or the limiter even when asked to', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const illegal = [{ param: 'exposure', source: 'bass', amount: 3 }, { param: 'limiterSlewUp', source: 'beat', amount: 1 }] as unknown as Modulator[];
    const out = applyModulators(DEFAULT_POST, { ...ZERO_SOURCES, bass: 1, beat: 1 }, illegal);
    expect(out.exposure).toBe(DEFAULT_POST.exposure);
    expect(out.limiterSlewUp).toBe(DEFAULT_POST.limiterSlewUp);
    warn.mockRestore();
  });

  it('is pure: the base object is untouched and sources outside 0..1 are clamped', () => {
    const base = { ...DEFAULT_POST };
    const out = applyModulators(base, { ...ZERO_SOURCES, bass: 7 }, [{ param: 'bloomNear', source: 'bass', amount: 0.1 }]);
    expect(base).toEqual(DEFAULT_POST);
    expect(out.bloomNear).toBeCloseTo(DEFAULT_POST.bloomNear + 0.1, 6);
  });
});
