import type { BrowserSignals } from '../input/signals';
import type { GeoHint } from '../input/geo';

export interface SeedInputs {
  signals: BrowserSignals;
  geo: GeoHint;
  timestamp: number;
}

function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function hashInputs(inputs: SeedInputs): string {
  const canonical = JSON.stringify({
    geo: { country: inputs.geo.country, region: inputs.geo.region },
    signals: {
      devicePixelRatio: inputs.signals.devicePixelRatio,
      hardwareConcurrency: inputs.signals.hardwareConcurrency,
      language: inputs.signals.language,
      prefersColorScheme: inputs.signals.prefersColorScheme,
      prefersReducedMotion: inputs.signals.prefersReducedMotion,
      screenHeight: inputs.signals.screenHeight,
      screenWidth: inputs.signals.screenWidth,
      timezone: inputs.signals.timezone,
      touchCapable: inputs.signals.touchCapable,
    },
    timestamp: inputs.timestamp,
  });
  return fnv1a(canonical);
}

let seed: string | null = null;

export function initSessionSeed(signals: BrowserSignals, geo: GeoHint): string {
  seed = hashInputs({ signals, geo, timestamp: Date.now() });
  return seed;
}

export function getSessionSeed(): string {
  if (seed === null) {
    throw new Error('Session seed not initialised. Call initSessionSeed() first.');
  }
  return seed;
}
