import { describe, it, expect, vi } from 'vitest';
import { readSignals } from '../src/input/signals';

describe('US-003: Read low-entropy browser signals', () => {
  it('returns language from navigator.language', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr-FR');
    const signals = readSignals();
    expect(signals.language).toBe('fr-FR');
  });

  it('falls back to en when navigator.language is empty', () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('');
    const signals = readSignals();
    expect(signals.language).toBe('en');
  });

  it('returns timezone from Intl.DateTimeFormat', () => {
    const signals = readSignals();
    expect(typeof signals.timezone).toBe('string');
    expect(signals.timezone.length).toBeGreaterThan(0);
  });

  it('falls back to UTC when Intl is unavailable', () => {
    const original = globalThis.Intl;
    // @ts-expect-error — intentionally breaking Intl for fallback test
    globalThis.Intl = undefined;
    const signals = readSignals();
    expect(signals.timezone).toBe('UTC');
    globalThis.Intl = original;
  });

  it('returns screen dimensions as positive numbers', () => {
    const signals = readSignals();
    expect(signals.screenWidth).toBeGreaterThan(0);
    expect(signals.screenHeight).toBeGreaterThan(0);
    expect(Number.isFinite(signals.screenWidth)).toBe(true);
    expect(Number.isFinite(signals.screenHeight)).toBe(true);
  });

  it('returns devicePixelRatio when available', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    const signals = readSignals();
    expect(signals.devicePixelRatio).toBe(2);
  });

  it('returns null devicePixelRatio when undefined', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: undefined, configurable: true });
    const signals = readSignals();
    expect(signals.devicePixelRatio).toBeNull();
  });

  it('does not access localStorage or sessionStorage', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    readSignals();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
  });

  it('does not set cookies', () => {
    const cookieSpy = vi.spyOn(document, 'cookie', 'set');
    readSignals();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('returns object with exactly the expected keys', () => {
    const signals = readSignals();
    const keys = Object.keys(signals).sort();
    expect(keys).toEqual(['devicePixelRatio', 'language', 'screenHeight', 'screenWidth', 'timezone']);
  });
});
