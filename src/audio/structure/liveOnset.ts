// src/audio/structure/liveOnset.ts
// Fallback event source for tracks without build-time analysis. Fed once per
// frame with normalised band energies and spectral flux; emits `beat` on
// rising-edge flux peaks and `drop` when the short-term energy jumps far above
// the rolling 4 s average. Deliberately simple.

import type { AudioEvent, EventBus } from './eventBus.ts';

export interface LiveFrame {
  bass: number;
  mid: number;
  treble: number;
  /** Spectral flux / onset strength, 0..1. */
  flux: number;
}

export interface LiveOnsetOptions {
  /** Minimum absolute flux for a beat. Default 0.15. */
  minFlux?: number;
  /** Beat when flux exceeds this multiple of the recent flux mean. Default 1.6. */
  fluxRatio?: number;
  /** Window for the recent flux mean, seconds. Default 1. */
  fluxWindowSec?: number;
  /** Minimum gap between beats, seconds (0.25 s = 240 BPM). Default 0.25. */
  beatRefractorySec?: number;
  /** Rolling long-term energy window, seconds. Default 4. */
  longWindowSec?: number;
  /** Short-term energy window, seconds. Default 0.3. */
  shortWindowSec?: number;
  /** Energy step (short - long) that counts as a drop. Default 0.3. */
  dropStep?: number;
  /** Minimum gap between drops, seconds. Default 8. */
  dropRefractorySec?: number;
}

export interface LiveOnsetSource {
  /** Push one frame at playback time `tSec` (monotonic within a track). */
  push(frame: LiveFrame, tSec: number): void;
  reset(): void;
}

interface Sample {
  t: number;
  v: number;
}

/** Rolling time window of samples with an O(1) mean. */
function createWindow(spanSec: number) {
  const items: Sample[] = [];
  let head = 0;
  let sum = 0;
  return {
    push(t: number, v: number) {
      items.push({ t, v });
      sum += v;
      while (head < items.length && items[head].t < t - spanSec) {
        sum -= items[head].v;
        head++;
      }
      if (head > 256 && head * 2 > items.length) {
        items.splice(0, head);
        head = 0;
      }
    },
    mean(): number {
      const n = items.length - head;
      return n > 0 ? sum / n : 0;
    },
    span(): number {
      const n = items.length - head;
      return n > 1 ? items[items.length - 1].t - items[head].t : 0;
    },
    clear() {
      items.length = 0;
      head = 0;
      sum = 0;
    },
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function createLiveOnsetSource(bus: EventBus<AudioEvent>, options: LiveOnsetOptions = {}): LiveOnsetSource {
  const minFlux = options.minFlux ?? 0.15;
  const fluxRatio = options.fluxRatio ?? 1.6;
  const beatRefractorySec = options.beatRefractorySec ?? 0.25;
  const longWindowSec = options.longWindowSec ?? 4;
  const shortWindowSec = options.shortWindowSec ?? 0.3;
  const dropStep = options.dropStep ?? 0.3;
  const dropRefractorySec = options.dropRefractorySec ?? 8;

  const fluxWindow = createWindow(options.fluxWindowSec ?? 1);
  const longEnergy = createWindow(longWindowSec);
  const shortEnergy = createWindow(shortWindowSec);

  let lastT = Number.NEGATIVE_INFINITY;
  let prevAboveThreshold = false;
  let lastBeatT = Number.NEGATIVE_INFINITY;
  let beatIndex = 0;
  let lastDropT = Number.NEGATIVE_INFINITY;

  function reset(): void {
    fluxWindow.clear();
    longEnergy.clear();
    shortEnergy.clear();
    lastT = Number.NEGATIVE_INFINITY;
    prevAboveThreshold = false;
    lastBeatT = Number.NEGATIVE_INFINITY;
    beatIndex = 0;
    lastDropT = Number.NEGATIVE_INFINITY;
  }

  return {
    reset,

    push(frame, t) {
      if (!Number.isFinite(t)) return;
      if (t < lastT - 0.5) reset(); // seek backwards / new track
      lastT = t;

      // --- beats from flux rising edges ---
      const flux = clamp01(frame.flux);
      const threshold = Math.max(minFlux, fluxWindow.mean() * fluxRatio);
      fluxWindow.push(t, flux);
      const above = flux >= threshold;
      if (above && !prevAboveThreshold && t - lastBeatT >= beatRefractorySec) {
        lastBeatT = t;
        bus.emit({ kind: 'beat', t, index: beatIndex++ });
      }
      prevAboveThreshold = above;

      // --- drops from energy steps ---
      const energy = clamp01(0.5 * frame.bass + 0.3 * frame.mid + 0.2 * frame.treble);
      longEnergy.push(t, energy);
      shortEnergy.push(t, energy);
      if (longEnergy.span() >= longWindowSec * 0.5 && t - lastDropT >= dropRefractorySec) {
        const step = shortEnergy.mean() - longEnergy.mean();
        if (step >= dropStep) {
          lastDropT = t;
          bus.emit({ kind: 'drop', t, strength: clamp01(step / (dropStep * 2)) });
        }
      }
    },
  };
}
