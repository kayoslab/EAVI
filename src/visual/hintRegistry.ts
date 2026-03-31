import type { VisualParams } from './mappings';

export interface HintEntry {
  category: string;
  description: string;
  paramKeys: (keyof VisualParams)[];
}

export const INFLUENCE_HINTS: HintEntry[] = [
  { category: 'location', description: 'Where you are tints the palette', paramKeys: ['paletteHue', 'paletteSaturation'] },
  { category: 'time', description: 'Time of day sets the rhythm', paramKeys: ['cadence'] },
  { category: 'device', description: 'Your device shapes the density', paramKeys: ['density'] },
  { category: 'preference', description: 'Your motion preference tempers the energy', paramKeys: ['motionAmplitude'] },
  { category: 'motion', description: 'Your movement disturbs the field', paramKeys: ['pointerDisturbance'] },
  { category: 'sound', description: 'Sound drives the motion and shimmer', paramKeys: ['bassEnergy', 'trebleEnergy'] },
];

// Compile-time completeness check: ensure every VisualParams key is covered
type CoveredKeys = (typeof INFLUENCE_HINTS)[number]['paramKeys'][number];
export type AssertAllCovered = Record<Exclude<keyof VisualParams, CoveredKeys>, never>;
export type AssertNoneExtra = Record<Exclude<CoveredKeys, keyof VisualParams>, never>;
