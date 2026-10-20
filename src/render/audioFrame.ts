import type { AnalyserPipeline } from '../audio/analyser';

export interface AudioFrame {
  /** Smoothed band averages, 0-255. */
  readonly bass: number;
  readonly mid: number;
  readonly treble: number;
  /** Spectral-flux beat pulse 0-1, decays over ~200 ms. */
  readonly beat: number;
  /** Time-domain bytes for this frame, or null without an analyser. */
  readonly waveform: Uint8Array | null;
}

function bandAverage(freq: Uint8Array, from: number, to: number): number {
  const start = Math.floor(freq.length * from);
  const end = Math.max(start + 1, Math.floor(freq.length * to));
  let sum = 0;
  for (let i = start; i < end && i < freq.length; i++) sum += freq[i];
  return sum / Math.max(1, Math.min(end, freq.length) - start);
}

/**
 * Per-frame audio feature extraction: EMA-smoothed bass/mid/treble, spectral-flux onsets,
 * and a synthetic bass swell when the analyser is silent so visuals always move.
 */
export function createAudioAnalysis(): { update(pipeline: AnalyserPipeline | null, elapsedMs: number): AudioFrame } {
  let smoothBass = 0;
  let smoothMid = 0;
  let smoothTreble = 0;
  let prevFrequency: Uint8Array | null = null;
  let fluxAvg = 0;
  let beat = 0;

  return {
    update(pipeline, elapsedMs) {
      let rawBass = 0;
      let rawMid = 0;
      let rawTreble = 0;

      if (pipeline) {
        pipeline.poll();
        const f = pipeline.frequency;
        rawBass = bandAverage(f, 0, 0.25);
        rawMid = bandAverage(f, 0.25, 0.75);
        rawTreble = bandAverage(f, 0.75, 1);

        if (prevFrequency && prevFrequency.length === f.length) {
          let flux = 0;
          for (let i = 0; i < f.length; i++) {
            const diff = f[i] - prevFrequency[i];
            if (diff > 0) flux += diff;
          }
          flux /= Math.max(1, f.length);
          fluxAvg = fluxAvg * 0.95 + flux * 0.05;
          if (flux > fluxAvg * 1.5 && flux > 5) beat = 1;
        }
        if (!prevFrequency || prevFrequency.length !== f.length) prevFrequency = new Uint8Array(f.length);
        prevFrequency.set(f);
      }

      beat *= 0.92;
      if (beat < 0.01) beat = 0;

      // Synthetic bass swell while silent or muted-without-signal.
      if (rawBass < 5) rawBass = 30 + 25 * Math.sin(elapsedMs * 0.001);

      smoothBass = smoothBass * 0.88 + rawBass * 0.12;
      smoothMid = smoothMid * 0.87 + rawMid * 0.13;
      smoothTreble = smoothTreble * 0.85 + rawTreble * 0.15;

      return { bass: smoothBass, mid: smoothMid, treble: smoothTreble, beat, waveform: pipeline ? pipeline.timeDomain : null };
    },
  };
}
