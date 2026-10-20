// Feeds the structural event bus from playback: build-time timeline when the
// track has analysis, live onset detection otherwise. Owned by main, ticked by the loop.

import type { PlaybackInfo } from '../player';
import { createEventBus, type AudioEvent, type EventBus } from './eventBus';
import { createTimeline, type Timeline } from './timeline';
import { createLiveOnsetSource, type LiveFrame, type LiveOnsetSource } from './liveOnset';
import { loadTrackAnalysis } from './loader';

export interface TrackSync {
  readonly bus: EventBus<AudioEvent>;
  /** Current source for diagnostics. */
  readonly mode: 'none' | 'timeline' | 'live';
  readonly trackPath: string | null;
  /** Switch to a track: loads its analysis (async) and emits trackStart on the first tick. */
  setTrack(trackPath: string): void;
  /** Call once per frame with the player's playback position and the live bands. */
  tick(playback: PlaybackInfo | null, live: LiveFrame): void;
  dispose(): void;
}

export function createTrackSync(options?: { lookaheadSec?: number }): TrackSync {
  const bus = createEventBus<AudioEvent>();
  const live: LiveOnsetSource = createLiveOnsetSource(bus);
  let timeline: Timeline | null = null;
  let mode: 'none' | 'timeline' | 'live' = 'none';
  let trackPath: string | null = null;
  let pendingStart: string | null = null;
  let generation = 0;

  return {
    bus,
    get mode() {
      return mode;
    },
    get trackPath() {
      return trackPath;
    },
    setTrack(path) {
      const gen = ++generation;
      trackPath = path;
      timeline = null;
      live.reset();
      mode = 'live';
      pendingStart = path;
      loadTrackAnalysis(path).then((analysis) => {
        if (gen !== generation) return;
        if (analysis) {
          timeline = createTimeline(analysis, bus, { lookaheadSec: options?.lookaheadSec ?? 2 });
          mode = 'timeline';
          console.debug('[EAVI] track analysis loaded:', path, `bpm ${analysis.bpm}`, `${analysis.sections.length} sections`);
        } else {
          console.debug('[EAVI] no analysis for track, live onset fallback:', path);
        }
      });
    },
    tick(playback, frame) {
      if (pendingStart) {
        bus.emit({ kind: 'trackStart', trackPath: pendingStart });
        pendingStart = null;
      }
      if (!playback) return;
      if (timeline && playback.trackPath === trackPath) {
        timeline.tick(playback.currentTime);
      } else if (mode === 'live') {
        live.push(frame, playback.currentTime);
      }
    },
    dispose() {
      generation++;
      bus.clear();
    },
  };
}
