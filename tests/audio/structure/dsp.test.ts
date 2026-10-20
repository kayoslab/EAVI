// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  buildBeatGrid,
  computeBandEnvelope,
  computeNovelty,
  computeOnsetStrength,
  detectFills,
  estimateTempo,
  fft,
  hannWindow,
  labelSections,
  magnitudeSpectrum,
  movingAverage,
  percentile,
  pickBoundaries,
  sampleCurve,
  selectDownbeats,
  type SectionStats,
} from '../../../src/audio/structure/dsp';

const SR = 44100;

/** Click track: short decaying noise bursts at `bpm`, with a quiet sustained tone underneath. */
function clickTrack(bpm: number, seconds: number, level = 1): Float32Array {
  const n = Math.round(seconds * SR);
  const out = new Float32Array(n);
  const period = 60 / bpm;
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const phase = t % period;
    const click = phase < 0.01 ? Math.exp(-phase * 600) * rnd() * 2 : 0;
    out[i] = level * (click + 0.05 * Math.sin(2 * Math.PI * 110 * t));
  }
  return out;
}

describe('fft', () => {
  it('peaks at the bin of a pure sine', () => {
    const n = 1024;
    const bin = 37;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * bin * i) / n);
    fft(re, im);
    let best = 0;
    for (let i = 1; i < n / 2; i++) if (Math.hypot(re[i], im[i]) > Math.hypot(re[best], im[best])) best = i;
    expect(best).toBe(bin);
    expect(Math.hypot(re[bin], im[bin])).toBeCloseTo(n / 2, 6);
  });

  it('rejects non power-of-two lengths', () => {
    expect(() => fft(new Float64Array(6), new Float64Array(6))).toThrow();
  });

  it('magnitudeSpectrum with a Hann window peaks at the right bin and zero-pads outside the signal', () => {
    const n = 2048;
    const bin = 100;
    const sig = new Float32Array(n);
    for (let i = 0; i < n; i++) sig[i] = Math.cos((2 * Math.PI * bin * i) / n);
    const mag = magnitudeSpectrum(sig, 0, hannWindow(n), new Float64Array(n), new Float64Array(n));
    expect(mag).toHaveLength(n / 2 + 1);
    let best = 0;
    for (let i = 0; i < mag.length; i++) if (mag[i] > mag[best]) best = i;
    expect(best).toBe(bin);
    const empty = magnitudeSpectrum(sig, n * 4, hannWindow(n), new Float64Array(n), new Float64Array(n));
    expect(Math.max(...empty)).toBe(0);
  });
});

describe('helpers', () => {
  it('percentile interpolates order statistics', () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([5], 0.9)).toBe(5);
    expect(percentile([], 0.5)).toBe(0);
  });

  it('movingAverage is centred and edge-aware', () => {
    const out = movingAverage([0, 0, 6, 0, 0], 1);
    expect(Array.from(out)).toEqual([0, 2, 2, 2, 0]);
  });

  it('sampleCurve interpolates linearly and clamps', () => {
    expect(sampleCurve([0, 1, 3], 0.5, 0.25)).toBe(0.5);
    expect(sampleCurve([0, 1, 3], 0.5, 9)).toBe(3);
    expect(sampleCurve([0, 1, 3], 0.5, -1)).toBe(0);
  });
});

describe('tempo and beats', () => {
  const signal = clickTrack(120, 20);
  const onset = computeOnsetStrength(signal, SR);

  it('onset curve is normalised to 0..1 with peaks at the clicks', () => {
    expect(Math.max(...onset.values)).toBeLessThanOrEqual(1);
    const near = (t: number) => {
      let m = 0;
      for (let k = -2; k <= 2; k++) m = Math.max(m, sampleCurve(onset.values, onset.hopSec, t + k * onset.hopSec));
      return m;
    };
    expect(near(2.0)).toBeGreaterThan(0.5);
    expect(near(2.25)).toBeLessThan(0.2);
  });

  it('estimates 120 BPM within 2 BPM from a click track', () => {
    const tempo = estimateTempo(onset);
    expect(Math.abs(tempo.bpm - 120)).toBeLessThan(2);
    expect(tempo.confidence).toBeGreaterThan(0.3);
  });

  it('builds a beat grid aligned to the clicks', () => {
    const grid = buildBeatGrid(onset, 0.5, 20);
    expect(Math.abs(60 / grid.periodSec - 120)).toBeLessThan(0.5);
    expect(grid.beats.length).toBeGreaterThanOrEqual(39);
    expect(grid.beats.length).toBeLessThanOrEqual(41);
    for (const b of grid.beats) {
      const nearest = Math.round(b / 0.5) * 0.5;
      expect(Math.abs(b - nearest)).toBeLessThan(0.02);
    }
  });

  it('returns an empty grid for degenerate input', () => {
    expect(buildBeatGrid(onset, 0, 20).beats).toEqual([]);
    expect(buildBeatGrid({ hopSec: 0.01, values: new Float32Array(0) }, 0.5, 20).beats).toEqual([]);
  });

  it('selectDownbeats picks the strongest beat offset', () => {
    const beats = Array.from({ length: 16 }, (_, i) => i * 0.5);
    const strengthAt = (t: number) => (Math.round(t / 0.5) % 4 === 2 ? 1 : 0.1);
    expect(selectDownbeats(beats, strengthAt)).toEqual([1, 3, 5, 7]);
    expect(selectDownbeats([], strengthAt)).toEqual([]);
  });
});

describe('band envelope', () => {
  it('separates bass from treble content', () => {
    const n = SR * 2;
    const bassSig = new Float32Array(n);
    const trebleSig = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      bassSig[i] = Math.sin((2 * Math.PI * 60 * i) / SR);
      trebleSig[i] = Math.sin((2 * Math.PI * 8000 * i) / SR);
    }
    const b = computeBandEnvelope(bassSig, SR);
    const t = computeBandEnvelope(trebleSig, SR);
    expect(b.length).toBe(20);
    expect(b[10].t).toBeCloseTo(1.0, 6);
    expect(b[10].bass).toBeGreaterThan(0.8);
    expect(b[10].treble).toBeLessThan(0.05);
    expect(t[10].treble).toBeGreaterThan(0.8);
    expect(t[10].bass).toBeLessThan(0.05);
    expect(t[10].centroid).toBeGreaterThan(b[10].centroid);
    for (const f of b) for (const k of ['bass', 'mid', 'treble', 'total'] as const) {
      expect(f[k]).toBeGreaterThanOrEqual(0);
      expect(f[k]).toBeLessThanOrEqual(1);
    }
  });
});

describe('segmentation', () => {
  it('finds one boundary near the step of a two-level envelope', () => {
    const hopSec = 0.1;
    const frames = 300; // 30 s
    const features: number[][] = [];
    for (let i = 0; i < frames; i++) {
      const level = i < 150 ? 0.2 : 0.8;
      const jitter = 0.02 * Math.sin(i * 1.7);
      features.push([level + jitter, level * 0.5 + jitter, 0.1]);
    }
    const novelty = computeNovelty(features, 80);
    expect(novelty.length).toBe(frames);
    const boundaries = pickBoundaries(novelty, hopSec, { minSectionSec: 8, durationSec: frames * hopSec });
    expect(boundaries).toHaveLength(1);
    expect(Math.abs(boundaries[0].t - 15)).toBeLessThan(1);
    expect(boundaries[0].strength).toBeGreaterThan(0.5);
  });

  it('finds no boundary in a flat envelope', () => {
    const features = Array.from({ length: 300 }, (_, i) => [0.5 + 0.01 * Math.sin(i), 0.3]);
    const novelty = computeNovelty(features, 80);
    const boundaries = pickBoundaries(novelty, 0.1, { minSectionSec: 8, threshold: 0.5 });
    expect(boundaries).toHaveLength(0);
  });

  it('enforces the minimum section length', () => {
    const novelty = new Float64Array(300).fill(0);
    novelty[100] = 1;
    novelty[130] = 0.9; // 3 s later: too close
    novelty[20] = 1; // inside the first 8 s: excluded
    const boundaries = pickBoundaries(novelty, 0.1, { minSectionSec: 8, durationSec: 30 });
    expect(boundaries.map((b) => b.t)).toEqual([10]);
  });
});

describe('labelling', () => {
  const stat = (energy: number, slope = 0): SectionStats => ({ start: 0, end: 1, energy, slope, onsetDensity: 0 });

  it('marks the high-energy section after a rise as drop, with build before and breakdown after', () => {
    const labels = labelSections([stat(0.2), stat(0.45, 0.2), stat(0.9), stat(0.3), stat(0.4)]);
    expect(labels).toEqual(['intro', 'build', 'drop', 'breakdown', 'outro']);
  });

  it('uses verse for unremarkable middle sections and keeps intro/outro at the ends', () => {
    expect(labelSections([stat(0.5), stat(0.5), stat(0.5)])).toEqual(['intro', 'verse', 'outro']);
    expect(labelSections([stat(0.5)])).toEqual(['verse']);
    expect(labelSections([])).toEqual([]);
  });

  it('treats a high section following a drop as a continuation', () => {
    const labels = labelSections([stat(0.2), stat(0.9), stat(0.85), stat(0.2)]);
    expect(labels).toEqual(['intro', 'drop', 'drop', 'outro']);
  });
});

describe('fills', () => {
  it('detects a short onset-dense burst', () => {
    const hopSec = 0.01;
    const values = new Float32Array(3000); // 30 s
    for (let t = 0; t < 30; t += 0.5) values[Math.round(t / hopSec)] = 0.6; // steady beat
    for (let t = 20; t < 21; t += 0.1) values[Math.round(t / hopSec)] = 0.8; // burst
    const fills = detectFills({ hopSec, values }, { windowSec: 2 });
    expect(fills.length).toBeGreaterThanOrEqual(1);
    expect(fills.some((f) => Math.abs(f.t - 20) <= 2)).toBe(true);
    for (const f of fills) {
      expect(f.strength).toBeGreaterThan(0);
      expect(f.strength).toBeLessThanOrEqual(1);
    }
  });

  it('reports no fills for a uniform beat', () => {
    const hopSec = 0.01;
    const values = new Float32Array(3000);
    for (let t = 0; t < 30; t += 0.5) values[Math.round(t / hopSec)] = 0.6;
    expect(detectFills({ hopSec, values }, { windowSec: 2 })).toHaveLength(0);
  });
});
