// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { analyzePcm } from '../../../scripts/lib/analyzeTrack';
import { formatAnalysisJson } from '../../../scripts/lib/formatJson';
import { validateTrackAnalysis } from '../../../src/audio/structure/analysis';

const SR = 44100;

/** 30 s click track at 120 BPM: quiet for 10 s, loud for 10 s, quiet for 10 s. */
function synthetic(): Float32Array {
  const n = SR * 30;
  const out = new Float32Array(n);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const level = t >= 10 && t < 20 ? 1 : 0.15;
    const phase = t % 0.5;
    const click = phase < 0.01 ? Math.exp(-phase * 600) * rnd() * 2 : 0;
    const pad = 0.08 * Math.sin(2 * Math.PI * 110 * t) + 0.04 * Math.sin(2 * Math.PI * 1500 * t);
    out[i] = level * (click + pad);
  }
  return out;
}

describe('analyzePcm', () => {
  const analysis = analyzePcm(synthetic(), SR, '/audio/synthetic.mp3');

  it('produces a valid document with the right duration and tempo', () => {
    expect(validateTrackAnalysis(JSON.parse(JSON.stringify(analysis)))).not.toBeNull();
    expect(analysis.trackPath).toBe('/audio/synthetic.mp3');
    expect(analysis.duration).toBeCloseTo(30, 2);
    expect(Math.abs(analysis.bpm - 120)).toBeLessThan(2);
    expect(analysis.energy).toHaveLength(300);
    expect(analysis.energy[10].t).toBe(1);
    expect(analysis.downbeats.length).toBeGreaterThan(10);
    expect(analysis.beats.length).toBeGreaterThan(55);
  });

  it('segments into intro / drop / outro around the level steps', () => {
    expect(analysis.sections.map((s) => s.label)).toEqual(['intro', 'drop', 'outro']);
    expect(Math.abs(analysis.sections[1].start - 10)).toBeLessThan(1.5);
    expect(Math.abs(analysis.sections[1].end - 20)).toBeLessThan(1.5);
    expect(analysis.sections[1].energy).toBeGreaterThan(analysis.sections[0].energy);
    for (let i = 1; i < analysis.sections.length; i++) {
      expect(analysis.sections[i].start).toBe(analysis.sections[i - 1].end);
    }
  });

  it('emits a drop event on a beat near the energy step and section events at boundaries', () => {
    const drops = analysis.events.filter((e) => e.kind === 'drop');
    expect(drops).toHaveLength(1);
    expect(Math.abs(drops[0].t - 10)).toBeLessThan(1);
    expect(drops[0].strength).toBeGreaterThan(0.5);
    expect(analysis.beats.some((b) => Math.abs(b - drops[0].t) < 1e-6)).toBe(true);
    expect(analysis.events.filter((e) => e.kind === 'section')).toHaveLength(2);
    for (let i = 1; i < analysis.events.length; i++) {
      expect(analysis.events[i].t).toBeGreaterThanOrEqual(analysis.events[i - 1].t);
    }
  });

  it('formats deterministic JSON that round-trips', () => {
    const a = formatAnalysisJson(analysis);
    const b = formatAnalysisJson(analyzePcm(synthetic(), SR, '/audio/synthetic.mp3'));
    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);
    expect(JSON.parse(a)).toEqual(analysis);
  });
});
