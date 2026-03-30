export interface BrowserSignals {
  language: string;
  timezone: string;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number | null;
}

export function readSignals(): BrowserSignals {
  let timezone = 'UTC';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    // Intl unavailable — keep UTC default
  }

  return {
    language: navigator.language || 'en',
    timezone,
    screenWidth: window.screen.width || window.innerWidth || 0,
    screenHeight: window.screen.height || window.innerHeight || 0,
    devicePixelRatio: window.devicePixelRatio ?? null,
  };
}
