import { clampParam, type NumericParamKey, type PostParams } from './params';

/** Per-frame signal sources a modulator can read, all normalised 0..1. */
export type ModSource = 'bass' | 'mid' | 'treble' | 'beat' | 'pointer' | 'cadence' | 'timeOfDay' | 'build' | 'drop';

export type ModSources = Record<ModSource, number>;

/**
 * Parameters that may never be bound to audio or input: anything that changes global brightness,
 * plus the limiter itself. Enforced at the type level and again at runtime.
 */
export type ForbiddenParam = 'exposure' | 'limiterSlewUp' | 'limiterSlewDown' | 'agcTarget' | 'agcRate';
export type ModulatableParam = Exclude<NumericParamKey, ForbiddenParam>;

export const FORBIDDEN_MODULATION_TARGETS: readonly NumericParamKey[] = ['exposure', 'limiterSlewUp', 'limiterSlewDown', 'agcTarget', 'agcRate'];

export interface Modulator {
  readonly param: ModulatableParam;
  readonly source: ModSource;
  /** Added to the base value at source = 1 (linear in the shaped source). */
  readonly amount: number;
  /** Power curve applied to the source before scaling; 1 = linear, >1 = late response. */
  readonly curve?: number;
}

export const ZERO_SOURCES: ModSources = {
  bass: 0, mid: 0, treble: 0, beat: 0, pointer: 0, cadence: 0, timeOfDay: 0, build: 0, drop: 0,
};

const warned = new Set<string>();

/** Base params + modulator deltas, clamped to each parameter's range. Pure. */
export function applyModulators(base: PostParams, sources: ModSources, modulators: readonly Modulator[]): PostParams {
  const out: PostParams = { ...base };
  for (const mod of modulators) {
    if ((FORBIDDEN_MODULATION_TARGETS as readonly string[]).includes(mod.param)) {
      if (!warned.has(mod.param)) {
        warned.add(mod.param);
        console.warn(`[EAVI post] modulator ignored: '${mod.param}' may not be modulated`);
      }
      continue;
    }
    const raw = Math.max(0, Math.min(1, sources[mod.source] ?? 0));
    const shaped = mod.curve && mod.curve !== 1 ? Math.pow(raw, mod.curve) : raw;
    const key = mod.param as NumericParamKey;
    out[key] = clampParam(key, out[key] + shaped * mod.amount);
  }
  return out;
}
