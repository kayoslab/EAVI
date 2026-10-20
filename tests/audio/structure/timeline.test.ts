// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createEventBus, type AudioEvent, type AudioEventKind } from '../../../src/audio/structure/eventBus';
import { createTimeline } from '../../../src/audio/structure/timeline';
import type { TrackAnalysis } from '../../../src/audio/structure/analysis';

function analysis(): TrackAnalysis {
  return {
    version: 1,
    trackPath: '/audio/t.mp3',
    duration: 12,
    bpm: 120,
    beats: Array.from({ length: 24 }, (_, i) => (i + 1) * 0.5), // 0.5 .. 12
    downbeats: [0.5, 2.5, 4.5, 6.5, 8.5, 10.5],
    energy: [],
    sections: [
      { start: 0, end: 4, label: 'intro', energy: 0.2 },
      { start: 4, end: 8, label: 'drop', energy: 0.9 },
      { start: 8, end: 12, label: 'outro', energy: 0.3 },
    ],
    events: [
      { t: 4, kind: 'section', strength: 0.8 },
      { t: 4, kind: 'drop', strength: 0.9 },
      { t: 8, kind: 'section', strength: 0.5 },
      { t: 8, kind: 'breakdown', strength: 0.4 },
      { t: 3.2, kind: 'fill', strength: 0.5 },
    ],
  };
}

function collect() {
  const bus = createEventBus<AudioEvent>();
  const log: AudioEvent[] = [];
  const kinds: AudioEventKind[] = ['beat', 'bar', 'section', 'build-start', 'drop:anticipate', 'drop', 'breakdown', 'fill'];
  for (const k of kinds) bus.on(k, (e) => log.push(e));
  return { bus, log };
}

const tOf = (e: AudioEvent): number => ('t' in e ? e.t : Number.NaN);

describe('timeline', () => {
  it('emits every scheduled item exactly once, in time order', () => {
    const { bus, log } = collect();
    const tl = createTimeline(analysis(), bus, { lookaheadSec: 1 });
    for (let i = 0; i <= 240; i++) tl.tick(i / 20);

    expect(log.filter((e) => e.kind === 'beat')).toHaveLength(24);
    expect(log.filter((e) => e.kind === 'bar')).toHaveLength(6);
    expect(log.filter((e) => e.kind === 'section')).toHaveLength(3);
    expect(log.filter((e) => e.kind === 'drop')).toHaveLength(1);
    expect(log.filter((e) => e.kind === 'drop:anticipate')).toHaveLength(1);
    expect(log.filter((e) => e.kind === 'breakdown')).toHaveLength(1);
    expect(log.filter((e) => e.kind === 'fill')).toHaveLength(1);

    for (let i = 1; i < log.length; i++) expect(tOf(log[i])).toBeGreaterThanOrEqual(tOf(log[i - 1]));

    // section fires before the beat/bar sharing its timestamp
    const atFour = log.filter((e) => tOf(e) === 4).map((e) => e.kind);
    expect(atFour[0]).toBe('section');
    expect(atFour).toContain('drop');
    expect(atFour).toContain('beat');
  });

  it('carries section labels and beat/bar indices', () => {
    const { bus, log } = collect();
    const tl = createTimeline(analysis(), bus);
    for (let i = 0; i <= 120; i++) tl.tick(i / 10);
    const sections = log.filter((e) => e.kind === 'section');
    expect(sections.map((e) => (e.kind === 'section' ? e.label : ''))).toEqual(['intro', 'drop', 'outro']);
    expect(sections.map((e) => (e.kind === 'section' ? e.index : -1))).toEqual([0, 1, 2]);
    const beats = log.filter((e) => e.kind === 'beat');
    expect(beats.map((e) => (e.kind === 'beat' ? e.index : -1))).toEqual(Array.from({ length: 24 }, (_, i) => i));
  });

  it('does not re-emit when ticked repeatedly at the same time', () => {
    const { bus, log } = collect();
    const tl = createTimeline(analysis(), bus);
    tl.tick(0.5);
    tl.tick(0.5);
    tl.tick(0.6);
    expect(log.filter((e) => e.kind === 'beat')).toHaveLength(1);
  });

  it('anticipates each drop lookaheadSec early with secondsUntil', () => {
    const { bus, log } = collect();
    const tl = createTimeline(analysis(), bus, { lookaheadSec: 2 });
    for (let i = 0; i <= 50; i++) tl.tick(i / 10);
    const ant = log.find((e) => e.kind === 'drop:anticipate');
    expect(ant).toBeDefined();
    if (ant?.kind !== 'drop:anticipate') throw new Error('unreachable');
    expect(ant.t).toBeCloseTo(2, 5);
    expect(ant.secondsUntil).toBeCloseTo(2, 5);
    expect(ant.strength).toBeCloseTo(0.9, 5);
    const drop = log.find((e) => e.kind === 'drop');
    expect(drop && tOf(drop)).toBe(4);
    expect(log.indexOf(ant)).toBeLessThan(log.indexOf(drop!));
  });

  it('clamps anticipation at 0 for drops earlier than the lookahead', () => {
    const { bus, log } = collect();
    const a = analysis();
    a.events = [{ t: 1, kind: 'drop', strength: 1 }];
    const tl = createTimeline(a, bus, { lookaheadSec: 2 });
    tl.tick(0);
    const ant = log.find((e) => e.kind === 'drop:anticipate');
    if (ant?.kind !== 'drop:anticipate') throw new Error('expected anticipate');
    expect(ant.t).toBe(0);
    expect(ant.secondsUntil).toBe(1);
  });

  it('resets its cursor on a backward seek and re-emits from there', () => {
    const { bus, log } = collect();
    const tl = createTimeline(analysis(), bus);
    for (let i = 0; i <= 30; i++) tl.tick(i / 10);
    const before = log.filter((e) => e.kind === 'beat').length;
    expect(before).toBe(6); // 0.5 .. 3.0
    tl.tick(0.8); // seek back
    tl.tick(1.0);
    tl.tick(1.5);
    const beats = log.filter((e) => e.kind === 'beat').map(tOf);
    expect(beats.slice(before)).toEqual([1.0, 1.5]);
  });

  it('ignores tiny backward jitter (< 0.5 s)', () => {
    const { bus, log } = collect();
    const tl = createTimeline(analysis(), bus);
    tl.tick(1.0);
    tl.tick(0.9);
    tl.tick(1.0);
    expect(log.filter((e) => e.kind === 'beat')).toHaveLength(2); // 0.5, 1.0 once each
  });

  it('skips items older than 1 s on a forward jump', () => {
    const { bus, log } = collect();
    const tl = createTimeline(analysis(), bus);
    tl.tick(0);
    tl.tick(10); // jump
    const beats = log.filter((e) => e.kind === 'beat').map(tOf);
    expect(beats).toEqual([9.0, 9.5, 10.0]);
    expect(log.some((e) => e.kind === 'drop')).toBe(false);
    // but subsequent ticks continue normally
    tl.tick(10.5);
    expect(log.filter((e) => e.kind === 'beat').map(tOf)).toEqual([9.0, 9.5, 10.0, 10.5]);
  });

  it('a late first tick does not fire a burst', () => {
    const { bus, log } = collect();
    const tl = createTimeline(analysis(), bus);
    tl.tick(6);
    expect(log.filter((e) => e.kind === 'beat').map(tOf)).toEqual([5.0, 5.5, 6.0]);
    expect(log.filter((e) => e.kind === 'section')).toHaveLength(0);
  });

  it('reset() re-arms from the next tick', () => {
    const { bus, log } = collect();
    const tl = createTimeline(analysis(), bus);
    tl.tick(2);
    tl.reset();
    tl.tick(0.5);
    expect(log.filter((e) => e.kind === 'beat').map(tOf).filter((t) => t === 0.5)).toHaveLength(1);
  });

  it('ignores non-finite times', () => {
    const { bus, log } = collect();
    const tl = createTimeline(analysis(), bus);
    tl.tick(Number.NaN);
    tl.tick(0.5);
    expect(log.filter((e) => e.kind === 'beat')).toHaveLength(1);
  });
});
