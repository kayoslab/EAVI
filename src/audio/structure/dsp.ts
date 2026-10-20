// src/audio/structure/dsp.ts
// Pure numeric building blocks for offline track analysis. No I/O, no audio
// decoding, no dependencies, so every function is unit-testable with synthetic
// signals and the file can be loaded by Node (type stripping) or the browser.

import type { SectionLabel } from './analysis.ts';

// --- small helpers --------------------------------------------------------

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function mean(values: ArrayLike<number>, from = 0, to = values.length): number {
  const a = Math.max(0, from);
  const b = Math.min(values.length, to);
  if (b <= a) return 0;
  let s = 0;
  for (let i = a; i < b; i++) s += values[i];
  return s / (b - a);
}

/** p in 0..1; linear interpolation between order statistics. */
export function percentile(values: ArrayLike<number>, p: number): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = Float64Array.from(values as ArrayLike<number>).sort();
  const pos = clamp01(p) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Centred moving average with a window of `radius` samples on each side. */
export function movingAverage(values: ArrayLike<number>, radius: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n);
  if (n === 0) return out;
  const r = Math.max(0, Math.floor(radius));
  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + values[i];
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - r);
    const b = Math.min(n, i + r + 1);
    out[i] = (prefix[b] - prefix[a]) / (b - a);
  }
  return out;
}

/** Linear interpolation of a uniformly sampled curve at time t (seconds). */
export function sampleCurve(values: ArrayLike<number>, hopSec: number, t: number): number {
  const n = values.length;
  if (n === 0) return 0;
  const x = t / hopSec;
  if (x <= 0) return values[0];
  if (x >= n - 1) return values[n - 1];
  const i = Math.floor(x);
  const f = x - i;
  return values[i] * (1 - f) + values[i + 1] * f;
}

// --- FFT -------------------------------------------------------------------

export function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
  return w;
}

/** In-place iterative radix-2 FFT. `re.length` must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) throw new Error(`fft: length ${n} is not a power of two`);

  // bit reversal
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = re[i];
      re[i] = re[j];
      re[j] = tmp;
      tmp = im[i];
      im[i] = im[j];
      im[j] = tmp;
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const tRe = re[b] * curRe - im[b] * curIm;
        const tIm = re[b] * curIm + im[b] * curRe;
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * Magnitude spectrum (bins 0..n/2 inclusive) of one windowed frame. The frame
 * is read from `samples[start .. start+n)`, zero-padded outside the signal.
 */
export function magnitudeSpectrum(
  samples: ArrayLike<number>,
  start: number,
  window: Float64Array,
  scratchRe: Float64Array,
  scratchIm: Float64Array,
): Float64Array {
  const n = window.length;
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    scratchRe[i] = idx >= 0 && idx < samples.length ? samples[idx] * window[i] : 0;
    scratchIm[i] = 0;
  }
  fft(scratchRe, scratchIm);
  const bins = (n >> 1) + 1;
  const mag = new Float64Array(bins);
  for (let i = 0; i < bins; i++) mag[i] = Math.hypot(scratchRe[i], scratchIm[i]);
  return mag;
}

// --- band energy envelope ---------------------------------------------------

export interface BandFrame {
  t: number;
  bass: number;
  mid: number;
  treble: number;
  total: number;
  /** Spectral centroid in Hz (raw, not normalised). */
  centroid: number;
}

export interface BandEnvelopeOptions {
  hopSec?: number;
  frameSize?: number;
  bassHz?: [number, number];
  midHz?: [number, number];
  trebleMinHz?: number;
  /** Percentile used as the "1.0" of each band. Default 0.99. */
  normPercentile?: number;
}

/**
 * Band amplitude envelope on a fixed hop. Each band (and total) is normalised
 * to 0..1 per track by its `normPercentile` value so quiet and loud tracks map
 * to the same range.
 */
export function computeBandEnvelope(
  samples: ArrayLike<number>,
  sampleRate: number,
  options: BandEnvelopeOptions = {},
): BandFrame[] {
  const hopSec = options.hopSec ?? 0.1;
  const frameSize = options.frameSize ?? 4096;
  const [bassLo, bassHi] = options.bassHz ?? [20, 250];
  const [midLo, midHi] = options.midHz ?? [250, 4000];
  const trebleLo = options.trebleMinHz ?? 4000;
  const normP = options.normPercentile ?? 0.99;

  const hop = Math.max(1, Math.round(hopSec * sampleRate));
  const frames = Math.max(1, Math.ceil(samples.length / hop));
  const window = hannWindow(frameSize);
  const re = new Float64Array(frameSize);
  const im = new Float64Array(frameSize);
  const binHz = sampleRate / frameSize;
  const binOf = (hz: number) => Math.min(frameSize >> 1, Math.max(0, Math.round(hz / binHz)));
  const bBass = [binOf(bassLo), binOf(bassHi)];
  const bMid = [binOf(midLo), binOf(midHi)];
  const bTreble = [binOf(trebleLo), (frameSize >> 1) + 1];

  const bass = new Float64Array(frames);
  const mid = new Float64Array(frames);
  const treble = new Float64Array(frames);
  const total = new Float64Array(frames);
  const centroid = new Float64Array(frames);

  const bandPower = (mag: Float64Array, lo: number, hi: number) => {
    let s = 0;
    for (let i = lo; i < hi; i++) s += mag[i] * mag[i];
    return s;
  };

  for (let f = 0; f < frames; f++) {
    const centre = f * hop;
    const mag = magnitudeSpectrum(samples, centre - (frameSize >> 1), window, re, im);
    bass[f] = Math.sqrt(bandPower(mag, bBass[0], bBass[1]));
    mid[f] = Math.sqrt(bandPower(mag, bMid[0], bMid[1]));
    treble[f] = Math.sqrt(bandPower(mag, bTreble[0], bTreble[1]));
    total[f] = Math.sqrt(bandPower(mag, 1, mag.length));
    let num = 0;
    let den = 0;
    for (let i = 1; i < mag.length; i++) {
      num += i * binHz * mag[i];
      den += mag[i];
    }
    centroid[f] = den > 0 ? num / den : 0;
  }

  const norm = (arr: Float64Array) => {
    const ref = percentile(arr, normP);
    const scale = ref > 0 ? 1 / ref : 0;
    for (let i = 0; i < arr.length; i++) arr[i] = clamp01(arr[i] * scale);
  };
  norm(bass);
  norm(mid);
  norm(treble);
  norm(total);

  const out: BandFrame[] = new Array(frames);
  for (let f = 0; f < frames; f++) {
    out[f] = { t: f * hopSec, bass: bass[f], mid: mid[f], treble: treble[f], total: total[f], centroid: centroid[f] };
  }
  return out;
}

// --- onset strength (spectral flux) ---------------------------------------

export interface OnsetCurve {
  hopSec: number;
  /** 0..1, local-mean subtracted and half-wave rectified. */
  values: Float32Array;
}

export interface OnsetOptions {
  frameSize?: number;
  hopSize?: number;
  /** Local mean window for adaptive thresholding, seconds. Default 0.4. */
  localMeanSec?: number;
  /** Percentile of the rectified flux that maps to 1.0. Default 0.98. */
  normPercentile?: number;
}

export function computeOnsetStrength(
  samples: ArrayLike<number>,
  sampleRate: number,
  options: OnsetOptions = {},
): OnsetCurve {
  const frameSize = options.frameSize ?? 2048;
  const hopSize = options.hopSize ?? 512;
  const hopSec = hopSize / sampleRate;
  const localMeanSec = options.localMeanSec ?? 0.4;
  const normPercentile = options.normPercentile ?? 0.98;

  const frames = Math.max(1, Math.ceil(samples.length / hopSize));
  const window = hannWindow(frameSize);
  const re = new Float64Array(frameSize);
  const im = new Float64Array(frameSize);
  const bins = (frameSize >> 1) + 1;
  let prev: Float64Array = new Float64Array(bins);
  const flux = new Float64Array(frames);

  for (let f = 0; f < frames; f++) {
    const mag = magnitudeSpectrum(samples, f * hopSize - (frameSize >> 1), window, re, im);
    // log compression keeps quiet transients visible
    for (let i = 0; i < bins; i++) mag[i] = Math.log1p(100 * mag[i]);
    let s = 0;
    for (let i = 1; i < bins; i++) {
      const d = mag[i] - prev[i];
      if (d > 0) s += d;
    }
    flux[f] = s;
    prev = mag;
  }

  const local = movingAverage(flux, Math.round(localMeanSec / hopSec));
  const values = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const v = flux[f] - local[f];
    values[f] = v > 0 ? v : 0;
  }
  // Normalise by a high percentile rather than the max so a few loud
  // transients do not push ordinary beats towards zero.
  const ref = percentile(values, normPercentile);
  if (ref > 0) for (let f = 0; f < frames; f++) values[f] = clamp01(values[f] / ref);
  return { hopSec, values };
}

// --- tempo -----------------------------------------------------------------

export interface TempoOptions {
  minBpm?: number;
  maxBpm?: number;
  /** Centre of the log-normal tempo prior. Default 120. */
  priorBpm?: number;
  /** Width of the prior in octaves. Default 0.6. */
  priorOctaves?: number;
}

export interface TempoEstimate {
  bpm: number;
  periodSec: number;
  /** Normalised autocorrelation at the chosen lag, 0..1. */
  confidence: number;
}

/** Tempo by autocorrelation of the onset curve with a weak log-normal prior and harmonic support. */
export function estimateTempo(onset: OnsetCurve, options: TempoOptions = {}): TempoEstimate {
  const minBpm = options.minBpm ?? 70;
  const maxBpm = options.maxBpm ?? 180;
  const priorBpm = options.priorBpm ?? 120;
  const priorOct = options.priorOctaves ?? 0.6;
  const { hopSec, values } = onset;
  const n = values.length;

  const m = mean(values);
  const x = new Float64Array(n);
  for (let i = 0; i < n; i++) x[i] = values[i] - m;

  const minLag = Math.max(1, Math.floor(60 / maxBpm / hopSec));
  const maxLag = Math.min(n - 2, Math.ceil(60 / minBpm / hopSec));
  const acfAt = (lag: number): number => {
    if (lag <= 0 || lag >= n) return 0;
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += x[i] * x[i + lag];
    return s / (n - lag);
  };
  const acf0 = acfAt(0) || mean(x.map((v) => v * v)) || 1;
  // Cache acf over [minLag, 2*maxLag] for harmonic lookups.
  const cacheMax = Math.min(n - 1, maxLag * 2 + 1);
  const acf = new Float64Array(cacheMax + 1);
  for (let lag = minLag; lag <= cacheMax; lag++) acf[lag] = acfAt(lag) / acf0;

  if (maxLag <= minLag) {
    return { bpm: priorBpm, periodSec: 60 / priorBpm, confidence: 0 };
  }

  let bestLag = minLag;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const bpm = 60 / (lag * hopSec);
    const oct = Math.log2(bpm / priorBpm);
    const prior = Math.exp(-0.5 * (oct / priorOct) * (oct / priorOct));
    const harmonic = 2 * lag <= cacheMax ? 0.5 * acf[2 * lag] : 0;
    const score = (acf[lag] + harmonic) * prior;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  // Parabolic interpolation for sub-hop lag precision.
  let lagRefined = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    const a = acf[bestLag - 1];
    const b = acf[bestLag];
    const c = acf[bestLag + 1];
    const denom = a - 2 * b + c;
    if (denom < 0) lagRefined = bestLag + (0.5 * (a - c)) / denom;
  }

  const periodSec = lagRefined * hopSec;
  return { bpm: 60 / periodSec, periodSec, confidence: clamp01(acf[bestLag]) };
}

// --- beat grid -------------------------------------------------------------

export interface BeatGrid {
  beats: number[];
  periodSec: number;
  phaseSec: number;
}

export interface BeatGridOptions {
  /** Half-width of the period search around the estimate, as a fraction. Default 0.015. */
  periodSearch?: number;
  /** Number of period candidates on each side of the estimate. Default 30. */
  periodSteps?: number;
  /** Least-squares refinement passes. Default 4. */
  refinePasses?: number;
}

/**
 * Fixed-tempo beat grid: a joint (period, phase) comb search around the tempo
 * estimate maximises the summed onset strength at grid points, then a weighted
 * least-squares fit of grid beats to nearby onset peaks refines both.
 */
export function buildBeatGrid(
  onset: OnsetCurve,
  periodSec: number,
  durationSec: number,
  options: BeatGridOptions = {},
): BeatGrid {
  const { hopSec, values } = onset;
  if (!(periodSec > 0) || !(durationSec > 0) || values.length === 0) {
    return { beats: [], periodSec, phaseSec: 0 };
  }
  const periodSearch = options.periodSearch ?? 0.015;
  const periodSteps = options.periodSteps ?? 30;
  const refinePasses = options.refinePasses ?? 4;

  // 1. comb search over (period, phase)
  let phase = 0;
  let period = periodSec;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let pi = -periodSteps; pi <= periodSteps; pi++) {
    const candPeriod = periodSec * (1 + (pi / periodSteps) * periodSearch);
    const steps = Math.max(1, Math.round(candPeriod / hopSec));
    for (let si = 0; si < steps; si++) {
      const candPhase = (si / steps) * candPeriod;
      let score = 0;
      for (let t = candPhase; t < durationSec; t += candPeriod) score += sampleCurve(values, hopSec, t);
      if (score > bestScore) {
        bestScore = score;
        phase = candPhase;
        period = candPeriod;
      }
    }
  }

  // 2. refine (phase, period) against local onset peaks
  const searchRadius = Math.max(1, Math.round((period * 0.15) / hopSec));
  for (let pass = 0; pass < refinePasses; pass++) {
    let sw = 0;
    let sk = 0;
    let st = 0;
    let skk = 0;
    let skt = 0;
    let matched = 0;
    const count = Math.floor((durationSec - phase) / period);
    for (let k = 0; k <= count; k++) {
      const g = phase + k * period;
      const centre = Math.round(g / hopSec);
      let peakIdx = -1;
      let peakVal = 0;
      for (let i = centre - searchRadius; i <= centre + searchRadius; i++) {
        if (i < 0 || i >= values.length) continue;
        if (values[i] > peakVal) {
          peakVal = values[i];
          peakIdx = i;
        }
      }
      if (peakIdx < 0 || peakVal < 0.2) continue;
      const w = peakVal;
      const tt = peakIdx * hopSec;
      sw += w;
      sk += w * k;
      st += w * tt;
      skk += w * k * k;
      skt += w * k * tt;
      matched++;
    }
    if (matched < 8) break;
    const denom = sw * skk - sk * sk;
    if (Math.abs(denom) < 1e-9) break;
    const newPeriod = (sw * skt - sk * st) / denom;
    const newPhase = (st - newPeriod * sk) / sw;
    if (!(newPeriod > 0) || Math.abs(newPeriod - periodSec) / periodSec > periodSearch * 2) break;
    const converged = Math.abs(newPeriod - period) < 1e-6 && Math.abs(newPhase - phase) < 1e-4;
    period = newPeriod;
    phase = newPhase;
    if (converged) break;
  }

  // normalise phase into [0, period)
  phase = ((phase % period) + period) % period;

  const beats: number[] = [];
  for (let t = phase; t <= durationSec; t += period) beats.push(t);
  return { beats, periodSec: period, phaseSec: phase };
}

/** Choose the beat offset (0..beatsPerBar-1) whose beats carry the most strength; return those beats. */
export function selectDownbeats(beats: number[], strengthAt: (t: number) => number, beatsPerBar = 4): number[] {
  if (beats.length === 0) return [];
  let bestOffset = 0;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let off = 0; off < beatsPerBar; off++) {
    let s = 0;
    for (let i = off; i < beats.length; i += beatsPerBar) s += strengthAt(beats[i]);
    if (s > bestScore) {
      bestScore = s;
      bestOffset = off;
    }
  }
  const out: number[] = [];
  for (let i = bestOffset; i < beats.length; i += beatsPerBar) out.push(beats[i]);
  return out;
}

// --- segmentation ----------------------------------------------------------

/**
 * Foote novelty: a Gaussian-tapered checkerboard kernel slid along the
 * diagonal of a self-similarity matrix built from Gaussian-of-distance
 * similarity between feature vectors. Returned curve is normalised to 0..1.
 */
export function computeNovelty(features: ArrayLike<number>[], kernelFrames: number): Float64Array {
  const n = features.length;
  const out = new Float64Array(n);
  if (n < 2) return out;
  const dims = features[0].length;
  const half = Math.max(1, Math.floor(kernelFrames / 2));

  // bandwidth: 2 x total variance
  const centre = new Float64Array(dims);
  for (const f of features) for (let d = 0; d < dims; d++) centre[d] += f[d] / n;
  let variance = 0;
  for (const f of features) for (let d = 0; d < dims; d++) variance += (f[d] - centre[d]) ** 2 / n;
  const sigma2 = Math.max(1e-9, 2 * variance);

  const sim = (i: number, j: number): number => {
    const a = features[Math.min(n - 1, Math.max(0, i))];
    const b = features[Math.min(n - 1, Math.max(0, j))];
    let d2 = 0;
    for (let d = 0; d < dims; d++) d2 += (a[d] - b[d]) ** 2;
    return Math.exp(-d2 / (2 * sigma2));
  };

  const taper = new Float64Array(2 * half);
  for (let i = 0; i < 2 * half; i++) {
    const x = (i - half + 0.5) / half;
    taper[i] = Math.exp(-4 * x * x);
  }

  let max = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let a = -half; a < half; a++) {
      const sa = a < 0 ? -1 : 1;
      const wa = taper[a + half];
      for (let b = -half; b < half; b++) {
        const sb = b < 0 ? -1 : 1;
        s += sa * sb * wa * taper[b + half] * sim(i + a, i + b);
      }
    }
    out[i] = s > 0 ? s : 0;
    if (out[i] > max) max = out[i];
  }
  if (max > 0) for (let i = 0; i < n; i++) out[i] /= max;
  return out;
}

export interface Boundary {
  t: number;
  /** Novelty peak height, 0..1. */
  strength: number;
}

export interface BoundaryOptions {
  minSectionSec?: number;
  /** Minimum novelty (relative to max) for a boundary. Default 0.2. */
  threshold?: number;
  durationSec?: number;
}

/** Greedy peak picking on a novelty curve with a minimum distance between boundaries. */
export function pickBoundaries(novelty: ArrayLike<number>, hopSec: number, options: BoundaryOptions = {}): Boundary[] {
  const n = novelty.length;
  const minSectionSec = options.minSectionSec ?? 8;
  const threshold = options.threshold ?? 0.2;
  const durationSec = options.durationSec ?? n * hopSec;
  const minDist = Math.max(1, Math.round(minSectionSec / hopSec));
  const localRadius = Math.max(1, Math.floor(minDist / 2));

  const candidates: Boundary[] = [];
  for (let i = 0; i < n; i++) {
    const v = novelty[i];
    if (v < threshold) continue;
    let isMax = true;
    for (let j = Math.max(0, i - localRadius); j <= Math.min(n - 1, i + localRadius); j++) {
      if (j !== i && novelty[j] > v) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;
    const t = i * hopSec;
    if (t < minSectionSec || t > durationSec - minSectionSec) continue;
    candidates.push({ t, strength: v });
  }

  candidates.sort((a, b) => b.strength - a.strength || a.t - b.t);
  const accepted: Boundary[] = [];
  for (const c of candidates) {
    if (accepted.every((a) => Math.abs(a.t - c.t) >= minSectionSec)) accepted.push(c);
  }
  accepted.sort((a, b) => a.t - b.t);
  return accepted;
}

// --- labelling -------------------------------------------------------------

export interface SectionStats {
  start: number;
  end: number;
  /** Mean total energy, 0..1. */
  energy: number;
  /** Energy at the end of the section minus energy at its start (quarter means). */
  slope: number;
  /** Onsets per second. */
  onsetDensity: number;
}

export interface LabelOptions {
  /** Fraction of the max section energy that counts as "high". Default 0.7. */
  highRatio?: number;
  /** Fraction of the max section energy that counts as "low". Default 0.5. */
  lowRatio?: number;
  /** Minimum energy rise from the previous section for a drop. Default 0.08. */
  minRise?: number;
  /** Minimum positive slope for a build. Default 0.03. */
  minBuildSlope?: number;
}

/**
 * Label sections by relative energy and shape. Ends are intro/outro; a
 * high-energy section after a rise (or a build) is a drop; the section before
 * a drop with rising energy is a build; a low-energy section after a drop is a
 * breakdown; everything else is a verse.
 */
export function labelSections(stats: SectionStats[], options: LabelOptions = {}): SectionLabel[] {
  const n = stats.length;
  if (n === 0) return [];
  if (n === 1) return ['verse'];
  const highRatio = options.highRatio ?? 0.7;
  const lowRatio = options.lowRatio ?? 0.5;
  const minRise = options.minRise ?? 0.08;
  const minBuildSlope = options.minBuildSlope ?? 0.03;

  const maxE = Math.max(...stats.map((s) => s.energy), 1e-9);
  const labels: SectionLabel[] = new Array(n).fill('verse');

  // pass 1: drops
  for (let i = 1; i < n - 1; i++) {
    const e = stats[i].energy;
    const prevE = stats[i - 1].energy;
    const high = e >= highRatio * maxE;
    const rose = e - prevE >= minRise * maxE;
    const prevWasDrop = labels[i - 1] === 'drop' && e >= (highRatio - 0.1) * maxE;
    if (high && (rose || prevWasDrop)) labels[i] = 'drop';
  }

  // pass 2: builds and breakdowns relative to drops
  for (let i = 1; i < n - 1; i++) {
    if (labels[i] === 'drop') continue;
    const nextIsDrop = i + 1 < n && labels[i + 1] === 'drop';
    const prevIsDrop = labels[i - 1] === 'drop';
    const low = stats[i].energy <= lowRatio * maxE;
    if (nextIsDrop && stats[i].slope >= minBuildSlope) labels[i] = 'build';
    else if (prevIsDrop && low) labels[i] = 'breakdown';
  }

  labels[0] = 'intro';
  labels[n - 1] = 'outro';
  return labels;
}

// --- fills -----------------------------------------------------------------

export interface FillOptions {
  /** Sliding window length, seconds (ideally one bar). Default 2. */
  windowSec?: number;
  /** Onset peak threshold on the 0..1 curve. Default 0.3. */
  peakThreshold?: number;
  /** Window count must exceed max(median * ratio, median + minExtra). Defaults 1.5 and 3. */
  ratio?: number;
  minExtra?: number;
  /** Max burst length as a multiple of windowSec. Default 1.5. */
  maxLenWindows?: number;
  /** Ignore the first seconds of the track. Default 4. */
  skipStartSec?: number;
  /** Keep at most this many fills (strongest). Default 12. */
  maxCount?: number;
}

export interface Fill {
  t: number;
  strength: number;
  lengthSec: number;
}

/** Count onset peaks above threshold (local maxima) per bin. */
export function onsetDensity(onset: OnsetCurve, binSec: number, peakThreshold: number): Float64Array {
  const { hopSec, values } = onset;
  const bins = Math.max(1, Math.ceil((values.length * hopSec) / binSec));
  const out = new Float64Array(bins);
  for (let i = 1; i < values.length - 1; i++) {
    const v = values[i];
    if (v < peakThreshold || v < values[i - 1] || v < values[i + 1]) continue;
    out[Math.min(bins - 1, Math.floor((i * hopSec) / binSec))] += 1 / binSec;
  }
  return out;
}

/** Onset peak times (local maxima above threshold), seconds. */
export function onsetPeaks(onset: OnsetCurve, peakThreshold: number): number[] {
  const { hopSec, values } = onset;
  const out: number[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    const v = values[i];
    if (v >= peakThreshold && v >= values[i - 1] && v > values[i + 1]) out.push(i * hopSec);
  }
  return out;
}

/**
 * Short onset-dense bursts relative to the track's typical density: count
 * onset peaks in sliding windows (hop = half a window), flag windows well
 * above the median count, merge neighbours, keep bursts no longer than
 * `maxLenWindows` windows.
 */
export function detectFills(onset: OnsetCurve, options: FillOptions = {}): Fill[] {
  const windowSec = options.windowSec ?? 2;
  const peakThreshold = options.peakThreshold ?? 0.3;
  const ratio = options.ratio ?? 1.5;
  const minExtra = options.minExtra ?? 3;
  const maxLenSec = (options.maxLenWindows ?? 1.5) * windowSec;
  const skipStartSec = options.skipStartSec ?? 4;
  const maxCount = options.maxCount ?? 12;

  const peaks = onsetPeaks(onset, peakThreshold);
  const durationSec = onset.values.length * onset.hopSec;
  const hop = windowSec / 2;
  const windows = Math.max(1, Math.floor((durationSec - windowSec) / hop) + 1);
  const counts = new Float64Array(windows);
  let lo = 0;
  let hi = 0;
  for (let w = 0; w < windows; w++) {
    const start = w * hop;
    const end = start + windowSec;
    while (lo < peaks.length && peaks[lo] < start) lo++;
    while (hi < peaks.length && peaks[hi] < end) hi++;
    counts[w] = hi - lo;
  }
  const median = percentile(counts, 0.5);
  const limit = Math.max(median * ratio, median + minExtra);

  const fills: Fill[] = [];
  let runStart = -1;
  let runPeak = 0;
  const flush = (endWindow: number) => {
    if (runStart < 0) return;
    const t = runStart * hop;
    const lengthSec = (endWindow - 1) * hop + windowSec - t;
    if (lengthSec <= maxLenSec && t >= skipStartSec) {
      fills.push({ t, strength: clamp01((runPeak - limit) / Math.max(1, limit)), lengthSec });
    }
    runStart = -1;
    runPeak = 0;
  };
  for (let w = 0; w < windows; w++) {
    if (counts[w] > limit) {
      if (runStart < 0) runStart = w;
      runPeak = Math.max(runPeak, counts[w]);
    } else {
      flush(w);
    }
  }
  flush(windows);

  fills.sort((a, b) => b.strength - a.strength || a.t - b.t);
  return fills.slice(0, maxCount).sort((a, b) => a.t - b.t);
}
