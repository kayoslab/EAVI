import { frameLoop, type Frame, type FrameLoopHandle, type Gpu, type Surface, type Target } from 'vgpu';
import type { RenderTargets } from './targets';
import type { Camera } from './camera';
import type { LayerFrame } from '../layers/Layer';
import type { PostStack } from '../post/stack';
import type { HealthGate } from './healthGate';
import type { BrowserSignals } from '../input/signals';
import type { GeoHint } from '../input/geo';
import type { PointerState } from '../input/pointer';
import type { AnalyserPipeline } from '../audio/analyser';
import type { PlaybackInfo } from '../audio/player';
import type { TrackSync } from '../audio/structure/sync';
import type { Director } from '../director/director';
import type { DebugFrameData } from '../ui/debugOverlay';
import { mapSignalsToVisuals, type VisualParams } from '../visual/mappings';
import { evolveParams } from '../visual/evolution';
import { createAudioAnalysis } from './audioFrame';
import type { ModSources } from '../post/modulators';

export interface LoopDeps {
  readonly gpu: Gpu;
  /** Final output: the canvas surface in the browser, an offscreen target in headless tests. May be swapped by quality control. */
  output: Surface | Target;
  readonly targets: RenderTargets;
  readonly camera: Camera;
  readonly director: Director;
  readonly post: PostStack;
  readonly health: HealthGate;
  readonly seed: string;
  readonly signals: BrowserSignals;
  readonly geo: GeoHint;
  readonly tier: string;
  readonly sync?: TrackSync | null;
  getPointerState?: () => PointerState;
  getAnalyserPipeline?: () => AnalyserPipeline | null;
  getPlayback?: () => PlaybackInfo | null;
  onDebugFrame?: (data: DebugFrameData) => void;
  /** Smoothed fps once per frame, for the adaptive-quality watchdog. */
  onFrameHealth?: (fps: number, timeSec: number) => void;
}

const defaultPointer: PointerState = { x: 0.5, y: 0.5, dx: 0, dy: 0, speed: 0, active: false };
const INTRO_MS = 3000;
const CLEAR = [0, 0, 0, 1] as const;

function smoothstep(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

export type FrameEncoder = (frame: Frame, nowMs: number) => void;

/**
 * Builds the per-frame body: audio → structure events → director → params → camera →
 * layers (compute + scene pass) → post → output. Timing is caller-supplied milliseconds so
 * the evolution curves keep their periods and tests stay deterministic.
 */
export function createFrameEncoder(deps: LoopDeps): FrameEncoder {
  const audio = createAudioAnalysis();
  let startTime = -1;
  let lastTime = -1;
  let smoothDisturbance = 0;
  let fpsAvg = 60;
  let frameIndex = 0;

  return (frame, now) => {
    frameIndex++;
    if (startTime < 0) startTime = now;
    const rawDelta = lastTime < 0 ? 16 : now - lastTime;
    lastTime = now;
    const deltaMs = Math.min(rawDelta, 100);
    const elapsedMs = now - startTime;
    fpsAvg = fpsAvg * 0.95 + (1000 / Math.max(1, rawDelta)) * 0.05;

    const audioFrame = audio.update(deps.getAnalyserPipeline?.() ?? null, elapsedMs);
    const pointer = deps.getPointerState?.() ?? defaultPointer;
    const date = new Date();

    let params: VisualParams = mapSignalsToVisuals({
      signals: deps.signals,
      geo: deps.geo,
      pointer,
      sessionSeed: deps.seed,
      bass: audioFrame.bass,
      treble: audioFrame.treble,
      mid: audioFrame.mid,
      timeOfDay: date.getHours() + date.getMinutes() / 60,
    });
    params = evolveParams(params, elapsedMs, deps.seed);

    // Structural events from the track timeline (or live onsets), then the Director.
    deps.sync?.tick(deps.getPlayback?.() ?? null, {
      bass: params.bassEnergy, mid: params.midEnergy, treble: params.trebleEnergy, flux: audioFrame.beat,
    });
    const timeSec = elapsedMs / 1000;
    const direction = deps.director.update(timeSec, deltaMs / 1000);

    // Sessions longer than five minutes drift warmer, faster after ten.
    const minutes = elapsedMs / 60000;
    if (minutes > 5) {
      const rate = minutes > 10 ? 1.0 : 0.5;
      params.paletteHue = (((params.paletteHue + (minutes - 5) * rate) % 360) + 360) % 360;
    }

    smoothDisturbance = smoothDisturbance * 0.92 + params.pointerDisturbance * 0.08;
    params.pointerDisturbance = smoothDisturbance;
    params.beatPulse = Math.max(audioFrame.beat, direction.beatPulse);
    params.paletteSaturation *= direction.saturationMul;
    params.motionAmplitude *= direction.motionMul;

    const opacity = smoothstep(elapsedMs / INTRO_MS);
    deps.post.setFade(opacity);
    deps.post.setOffsets(direction.postOffsets);
    deps.post.setTransient(direction.postTransient);

    const sources: ModSources = {
      bass: params.bassEnergy,
      mid: params.midEnergy,
      treble: params.trebleEnergy,
      beat: params.beatPulse,
      pointer: params.pointerDisturbance,
      cadence: params.cadence,
      timeOfDay: (date.getHours() + date.getMinutes() / 60) / 24,
      build: direction.build,
      drop: direction.drop,
    };
    deps.post.applyFrame({ sources, timeSec, frameIndex, reducedMotion: deps.signals.prefersReducedMotion === true });

    deps.camera.update(timeSec, params.motionAmplitude);

    const base: Omit<LayerFrame, 'opacity'> = {
      timeSec,
      deltaSec: deltaMs / 1000,
      params,
      camera: deps.camera.state,
      resolution: deps.targets.size,
      pointer: { x: pointer.x, y: pointer.y },
      waveform: audioFrame.waveform,
      build: direction.build,
      drop: direction.drop,
    };

    const active = direction.layers;
    for (const a of active) a.layer.update({ ...base, opacity: opacity * a.opacity });
    for (const a of active) a.layer.encodeCompute?.(frame);
    frame.pass({ target: deps.targets.scene, clear: CLEAR }, (pass) => {
      for (const a of active) {
        if (a.opacity > 0.001) a.layer.encodeDraw(pass);
      }
    });
    deps.post.encode(frame, deps.output);
    deps.onFrameHealth?.(fpsAvg, timeSec);

    deps.onDebugFrame?.({
      fps: fpsAvg,
      recipe: `${direction.recipeId} · ${deps.post.presetName} · ${deps.sync?.mode ?? 'no-sync'}`,
      tier: deps.tier,
      pointCount: active.reduce((n, a) => n + a.layer.pointCount, 0),
      bass: audioFrame.bass,
      treble: audioFrame.treble,
      beat: params.beatPulse,
      health: deps.health.status,
      errors: deps.health.errors.length,
      size: deps.targets.size,
    });
  };
}

/** Browser loop: drives the encoder from requestAnimationFrame with wall-clock time. */
export function startLoop(deps: LoopDeps): FrameLoopHandle {
  const encode = createFrameEncoder(deps);
  return frameLoop(deps.gpu, (frame) => encode(frame, performance.now()));
}
