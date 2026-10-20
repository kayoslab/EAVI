// scripts/lib/analyzeTrack.ts
// PCM -> TrackAnalysis. Pure (no I/O), so it can be tested with synthetic
// signals; scripts/analyzeTracks.ts only adds decoding and file writes.

import {
  TRACK_ANALYSIS_VERSION,
  type AnalysisEvent,
  type TrackAnalysis,
  type TrackSection,
} from '../../src/audio/structure/analysis.ts';
import {
  buildBeatGrid,
  clamp01,
  computeBandEnvelope,
  computeNovelty,
  computeOnsetStrength,
  detectFills,
  estimateTempo,
  labelSections,
  mean,
  movingAverage,
  onsetDensity,
  pickBoundaries,
  sampleCurve,
  selectDownbeats,
  type SectionStats,
} from '../../src/audio/structure/dsp.ts';

export interface AnalyzeOptions {
  hopSec?: number;
  minSectionSec?: number;
  noveltyKernelSec?: number;
  noveltyThreshold?: number;
}

const round = (v: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

export function analyzePcm(
  samples: Float32Array,
  sampleRate: number,
  trackPath: string,
  options: AnalyzeOptions = {},
): TrackAnalysis {
  const hopSec = options.hopSec ?? 0.1;
  const minSectionSec = options.minSectionSec ?? 8;
  const kernelSec = options.noveltyKernelSec ?? 8;
  const noveltyThreshold = options.noveltyThreshold ?? 0.25;

  const duration = samples.length / sampleRate;

  // --- envelope + onsets ---
  const env = computeBandEnvelope(samples, sampleRate, { hopSec });
  const onset = computeOnsetStrength(samples, sampleRate);
  const bassCurve = Float64Array.from(env, (f) => f.bass);
  const totalCurve = Float64Array.from(env, (f) => f.total);

  // --- tempo + beats ---
  const tempo = estimateTempo(onset);
  const grid = buildBeatGrid(onset, tempo.periodSec, duration);
  const bpm = grid.beats.length > 1 ? 60 / grid.periodSec : tempo.bpm;
  const onsetAt = (t: number) => sampleCurve(onset.values, onset.hopSec, t);
  const bassAt = (t: number) => sampleCurve(bassCurve, hopSec, t);
  const downbeats = selectDownbeats(grid.beats, (t) => onsetAt(t) + 0.5 * bassAt(t));

  // --- segmentation ---
  const density = onsetDensity(onset, hopSec, 0.25);
  const maxDensity = Math.max(1e-9, ...Array.from(density));
  const smoothRadius = Math.round(0.5 / hopSec);
  const smooth = (arr: ArrayLike<number>) => movingAverage(arr, smoothRadius);
  const sBass = smooth(bassCurve);
  const sMid = smooth(Float64Array.from(env, (f) => f.mid));
  const sTreble = smooth(Float64Array.from(env, (f) => f.treble));
  const sTotal = smooth(totalCurve);
  const sCentroid = smooth(Float64Array.from(env, (f) => clamp01(f.centroid / 8000)));
  const sDensity = smooth(Float64Array.from(env, (_, i) => (i < density.length ? density[i] / maxDensity : 0)));
  const features = env.map((_, i) => [sBass[i], sMid[i], sTreble[i], sTotal[i], sCentroid[i], sDensity[i]]);
  const novelty = computeNovelty(features, Math.round(kernelSec / hopSec));
  const boundaries = pickBoundaries(novelty, hopSec, { minSectionSec, threshold: noveltyThreshold, durationSec: duration });

  const starts = [0, ...boundaries.map((b) => b.t)];
  const stats: SectionStats[] = starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] : duration;
    const a = Math.round(start / hopSec);
    const b = Math.max(a + 1, Math.round(end / hopSec));
    const quarter = Math.max(1, Math.floor((b - a) / 4));
    const onsets = (() => {
      let s = 0;
      for (let k = a; k < b && k < density.length; k++) s += density[k];
      return s / Math.max(1, b - a);
    })();
    return {
      start,
      end,
      energy: mean(totalCurve, a, b),
      slope: mean(totalCurve, b - quarter, b) - mean(totalCurve, a, a + quarter),
      onsetDensity: onsets,
    };
  });
  const labels = labelSections(stats);
  const sections: TrackSection[] = stats.map((s, i) => ({
    start: round(s.start, 2),
    end: round(s.end, 2),
    label: labels[i],
    energy: round(s.energy, 3),
  }));

  // --- events ---
  const events: AnalysisEvent[] = [];
  boundaries.forEach((b) => events.push({ t: round(b.t, 2), kind: 'section', strength: round(clamp01(b.strength), 3) }));

  const snapToBeat = (t: number): number => {
    let best = t;
    let bestD = 0.2;
    for (const beat of grid.beats) {
      const d = Math.abs(beat - t);
      if (d < bestD) {
        bestD = d;
        best = beat;
      }
      if (beat > t + 0.2) break;
    }
    return best;
  };

  /** Largest local energy step (next 1 s minus previous 1 s) within +-2 s of t. */
  const refineStep = (t: number): { t: number; step: number } => {
    const win = Math.round(1 / hopSec);
    const radius = Math.round(2 / hopSec);
    const centre = Math.round(t / hopSec);
    let best = { t, step: Number.NEGATIVE_INFINITY };
    for (let i = centre - radius; i <= centre + radius; i++) {
      if (i - win < 0 || i + win > totalCurve.length) continue;
      const step = mean(totalCurve, i, i + win) - mean(totalCurve, i - win, i);
      if (step > best.step) best = { t: i * hopSec, step };
    }
    return best;
  };

  const dropTimes: number[] = [];
  for (let i = 1; i < stats.length; i++) {
    const label = labels[i];
    const prev = stats[i - 1];
    const cur = stats[i];
    if (label === 'drop') {
      const rise = cur.energy - prev.energy;
      if (rise < 0.05 && labels[i - 1] === 'drop') continue; // continuation of the same drop
      const refined = refineStep(cur.start);
      const t = snapToBeat(refined.t);
      const strength = clamp01(Math.max(rise, refined.step) / 0.5);
      dropTimes.push(t);
      events.push({ t: round(t, 3), kind: 'drop', strength: round(strength, 3) });
    } else if (label === 'build') {
      events.push({ t: round(cur.start, 2), kind: 'build-start', strength: round(clamp01(cur.slope / 0.3), 3) });
    } else if (label === 'breakdown') {
      events.push({ t: round(cur.start, 2), kind: 'breakdown', strength: round(clamp01((prev.energy - cur.energy) / 0.5), 3) });
    }
  }

  for (const fill of detectFills(onset)) {
    if (dropTimes.some((d) => Math.abs(d - fill.t) < 1)) continue;
    events.push({ t: round(fill.t, 2), kind: 'fill', strength: round(fill.strength, 3) });
  }

  events.sort((a, b) => a.t - b.t || a.kind.localeCompare(b.kind));

  return {
    version: TRACK_ANALYSIS_VERSION,
    trackPath,
    duration: round(duration, 3),
    bpm: round(bpm, 2),
    beats: grid.beats.map((t) => round(t, 3)),
    downbeats: downbeats.map((t) => round(t, 3)),
    energy: env.map((f) => ({
      t: round(f.t, 2),
      bass: round(f.bass, 3),
      mid: round(f.mid, 3),
      treble: round(f.treble, 3),
      total: round(f.total, 3),
    })),
    sections,
    events,
  };
}
