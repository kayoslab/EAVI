// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createEventBus, type AudioEvent } from '../../../src/audio/structure/eventBus';
import { createLiveOnsetSource, type LiveFrame } from '../../../src/audio/structure/liveOnset';

const FPS = 60;

function run(frames: (t: number) => LiveFrame, seconds: number) {
  const bus = createEventBus<AudioEvent>();
  const beats: number[] = [];
  const drops: AudioEvent[] = [];
  bus.on('beat', (e) => beats.push(e.t));
  bus.on('drop', (e) => drops.push(e));
  const src = createLiveOnsetSource(bus);
  for (let i = 0; i < seconds * FPS; i++) {
    const t = i / FPS;
    src.push(frames(t), t);
  }
  return { beats, drops, src };
}

describe('liveOnset', () => {
  it('emits one beat per flux spike at 120 BPM', () => {
    const { beats } = run((t) => {
      const phase = t % 0.5;
      const spike = phase < 1 / FPS ? 0.9 : 0.02;
      return { bass: 0.3, mid: 0.3, treble: 0.3, flux: spike };
    }, 6);
    expect(beats.length).toBe(12);
    for (let i = 1; i < beats.length; i++) expect(beats[i] - beats[i - 1]).toBeCloseTo(0.5, 2);
  });

  it('does not emit beats on flat flux', () => {
    const { beats } = run(() => ({ bass: 0.5, mid: 0.5, treble: 0.5, flux: 0.1 }), 4);
    expect(beats).toHaveLength(0);
  });

  it('respects the refractory period on sustained flux', () => {
    const { beats } = run((t) => ({ bass: 0, mid: 0, treble: 0, flux: t > 1 && t < 1.2 ? 1 : 0 }), 3);
    expect(beats).toHaveLength(1);
  });

  it('emits a single drop when energy steps up after a quiet stretch', () => {
    const { drops } = run((t) => {
      const level = t < 8 ? 0.2 : 0.9;
      return { bass: level, mid: level, treble: level, flux: 0 };
    }, 16);
    expect(drops).toHaveLength(1);
    const d = drops[0];
    if (d.kind !== 'drop') throw new Error('expected drop');
    expect(d.t).toBeGreaterThanOrEqual(8);
    expect(d.t).toBeLessThan(8.6);
    expect(d.strength).toBeGreaterThan(0.5);
    expect(d.strength).toBeLessThanOrEqual(1);
  });

  it('does not emit a drop for a slow ramp or at startup', () => {
    const { drops } = run((t) => {
      const level = Math.min(0.9, 0.2 + t * 0.05);
      return { bass: level, mid: level, treble: level, flux: 0 };
    }, 14);
    expect(drops).toHaveLength(0);
  });

  it('reset clears beat indices and history', () => {
    const bus = createEventBus<AudioEvent>();
    const idx: number[] = [];
    bus.on('beat', (e) => idx.push(e.index));
    const src = createLiveOnsetSource(bus);
    src.push({ bass: 0, mid: 0, treble: 0, flux: 1 }, 0);
    src.reset();
    src.push({ bass: 0, mid: 0, treble: 0, flux: 1 }, 0);
    expect(idx).toEqual([0, 0]);
  });
});
