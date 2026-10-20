// src/audio/structure/timeline.ts
// Replays a TrackAnalysis against playback time. Driven by currentTime, so it
// keeps working while muted. Each scheduled item is emitted exactly once as
// playback passes it; a backward jump (seek / restart) resets the cursor; a
// forward jump never fires items older than LATE_WINDOW_SEC so a late-joining
// tick does not emit a burst.

import type { TrackAnalysis } from './analysis.ts';
import type { AudioEvent, EventBus } from './eventBus.ts';

export interface TimelineOptions {
  /** Seconds before each drop at which `drop:anticipate` is emitted. Default 2. */
  lookaheadSec?: number;
}

export interface Timeline {
  /** Advance to the given playback position (seconds) and emit everything passed since the last tick. */
  tick(currentTimeSec: number): void;
  /** Forget the cursor so the next tick starts fresh from its position. */
  reset(): void;
  /** Number of scheduled items (for diagnostics). */
  readonly size: number;
}

/** Items older than this on a forward jump are skipped rather than emitted. */
export const LATE_WINDOW_SEC = 1;
/** A backward move larger than this is treated as a seek and resets the cursor. */
export const SEEK_BACK_THRESHOLD_SEC = 0.5;

interface Scheduled {
  t: number;
  /** Lower ranks fire first when times tie. */
  rank: number;
  event: AudioEvent;
}

const RANK: Record<AudioEvent['kind'], number> = {
  trackStart: 0,
  section: 1,
  'drop:anticipate': 2,
  'build-start': 3,
  breakdown: 4,
  drop: 5,
  bar: 6,
  beat: 7,
  fill: 8,
  trackEnd: 9,
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function buildSchedule(analysis: TrackAnalysis, lookaheadSec: number): Scheduled[] {
  const items: Scheduled[] = [];
  const push = (t: number, event: AudioEvent) => items.push({ t, rank: RANK[event.kind], event });

  analysis.beats.forEach((t, index) => push(t, { kind: 'beat', t, index }));
  analysis.downbeats.forEach((t, index) => push(t, { kind: 'bar', t, index }));
  analysis.sections.forEach((s, index) => push(s.start, { kind: 'section', t: s.start, label: s.label, index }));

  for (const ev of analysis.events) {
    const strength = clamp01(ev.strength);
    switch (ev.kind) {
      case 'drop': {
        const at = Math.max(0, ev.t - lookaheadSec);
        push(at, { kind: 'drop:anticipate', t: at, strength, secondsUntil: ev.t - at });
        push(ev.t, { kind: 'drop', t: ev.t, strength });
        break;
      }
      case 'build-start':
        push(ev.t, { kind: 'build-start', t: ev.t, strength });
        break;
      case 'breakdown':
        push(ev.t, { kind: 'breakdown', t: ev.t, strength });
        break;
      case 'fill':
        push(ev.t, { kind: 'fill', t: ev.t, strength });
        break;
      case 'section':
        // Section boundaries are emitted from `analysis.sections` (with label + index).
        break;
    }
  }

  items.sort((a, b) => a.t - b.t || a.rank - b.rank);
  return items;
}

export function createTimeline(
  analysis: TrackAnalysis,
  bus: EventBus<AudioEvent>,
  options: TimelineOptions = {},
): Timeline {
  const lookaheadSec = options.lookaheadSec ?? 2;
  const schedule = buildSchedule(analysis, lookaheadSec);

  let cursor = 0;
  let lastTime = Number.NEGATIVE_INFINITY;

  function seekCursor(now: number): void {
    // First index whose time is >= now (binary search; schedule is sorted by t).
    let lo = 0;
    let hi = schedule.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (schedule[mid].t < now) lo = mid + 1;
      else hi = mid;
    }
    cursor = lo;
  }

  return {
    get size() {
      return schedule.length;
    },

    reset() {
      cursor = 0;
      lastTime = Number.NEGATIVE_INFINITY;
    },

    tick(now) {
      if (!Number.isFinite(now)) return;

      if (now < lastTime - SEEK_BACK_THRESHOLD_SEC) {
        // Seek / restart: re-arm everything from the new position.
        seekCursor(now);
      }
      lastTime = now;

      const oldest = now - LATE_WINDOW_SEC;
      while (cursor < schedule.length && schedule[cursor].t <= now) {
        const item = schedule[cursor++];
        if (item.t < oldest) continue; // forward jump: too old, skip silently
        bus.emit(item.event);
      }
    },
  };
}
