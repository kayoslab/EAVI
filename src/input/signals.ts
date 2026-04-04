export interface BrowserSignals {
  language: string;
  timezone: string;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number | null;
  hardwareConcurrency: number | null;
  prefersColorScheme: 'light' | 'dark' | null;
  prefersReducedMotion: boolean | null;
  touchCapable: boolean | null;
  deviceMemory: number | null;
}

export function readSignals(): BrowserSignals {
  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    // Intl unavailable — keep UTC default
  }

  let prefersColorScheme: 'light' | 'dark' | null = null;
  let prefersReducedMotion: boolean | null = null;
  try {
    if (typeof window.matchMedia === 'function') {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        prefersColorScheme = 'dark';
      } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
        prefersColorScheme = 'light';
      }
      prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  } catch {
    // matchMedia unavailable — keep null defaults
  }

  let touchCapable: boolean | null = null;
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    touchCapable = true;
  } else {
    touchCapable = false;
  }

  return {
    language: navigator.language || 'en',
    timezone,
    screenWidth: window.screen.width || window.innerWidth || 0,
    screenHeight: window.screen.height || window.innerHeight || 0,
    devicePixelRatio: window.devicePixelRatio ?? null,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    prefersColorScheme,
    prefersReducedMotion,
    touchCapable,
    deviceMemory: (navigator as any).deviceMemory ?? null,
  };
}
