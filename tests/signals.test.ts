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
    expect(keys).toEqual([
      'deviceMemory',
      'devicePixelRatio',
      'hardwareConcurrency',
      'language',
      'prefersColorScheme',
      'prefersReducedMotion',
      'screenHeight',
      'screenWidth',
      'timezone',
      'touchCapable',
    ]);
  });
});

describe('US-004: Read capability and preference signals', () => {
  it('returns hardwareConcurrency when available', () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
    const signals = readSignals();
    expect(signals.hardwareConcurrency).toBe(8);
  });

  it('returns null hardwareConcurrency when undefined', () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: undefined, configurable: true });
    const signals = readSignals();
    expect(signals.hardwareConcurrency).toBeNull();
  });

  it('returns dark when prefers-color-scheme is dark', () => {
    window.matchMedia = vi.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const signals = readSignals();
    expect(signals.prefersColorScheme).toBe('dark');
  });

  it('returns light when prefers-color-scheme is light', () => {
    window.matchMedia = vi.fn((query: string) => ({
      matches: query === '(prefers-color-scheme: light)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const signals = readSignals();
    expect(signals.prefersColorScheme).toBe('light');
  });

  it('returns null prefersColorScheme when matchMedia is unavailable', () => {
    const original = window.matchMedia;
    // @ts-expect-error — intentionally removing matchMedia for fallback test
    window.matchMedia = undefined;
    const signals = readSignals();
    expect(signals.prefersColorScheme).toBeNull();
    window.matchMedia = original;
  });

  it('returns true when prefers-reduced-motion is reduce', () => {
    window.matchMedia = vi.fn((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const signals = readSignals();
    expect(signals.prefersReducedMotion).toBe(true);
  });

  it('returns false when prefers-reduced-motion is not set', () => {
    window.matchMedia = vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
    const signals = readSignals();
    expect(signals.prefersReducedMotion).toBe(false);
  });

  it('returns null prefersReducedMotion when matchMedia is unavailable', () => {
    const original = window.matchMedia;
    // @ts-expect-error — intentionally removing matchMedia for fallback test
    window.matchMedia = undefined;
    const signals = readSignals();
    expect(signals.prefersReducedMotion).toBeNull();
    window.matchMedia = original;
  });

  it('returns true for touchCapable when ontouchstart exists', () => {
    Object.defineProperty(window, 'ontouchstart', { value: null, configurable: true });
    const signals = readSignals();
    expect(signals.touchCapable).toBe(true);
    delete (window as any).ontouchstart;
  });

  it('returns true for touchCapable when maxTouchPoints > 0', () => {
    delete (window as any).ontouchstart;
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 5, configurable: true });
    const signals = readSignals();
    expect(signals.touchCapable).toBe(true);
  });

  it('returns false for touchCapable when no touch APIs available', () => {
    delete (window as any).ontouchstart;
    Object.defineProperty(navigator, 'maxTouchPoints', { value: 0, configurable: true });
    const signals = readSignals();
    expect(signals.touchCapable).toBe(false);
  });
});

describe('US-025: deviceMemory signal', () => {
  it('T-025-09: returns deviceMemory when navigator.deviceMemory is available', () => {
    Object.defineProperty(navigator, 'deviceMemory', { value: 8, configurable: true });
    const signals = readSignals();
    expect(signals.deviceMemory).toBe(8);
  });

  it('T-025-10: returns null deviceMemory when navigator.deviceMemory is unavailable', () => {
    Object.defineProperty(navigator, 'deviceMemory', { value: undefined, configurable: true });
    const signals = readSignals();
    expect(signals.deviceMemory).toBeNull();
  });

  it('T-025-11: BrowserSignals keys include deviceMemory', () => {
    const signals = readSignals();
    const keys = Object.keys(signals).sort();
    expect(keys).toContain('deviceMemory');
  });
});
