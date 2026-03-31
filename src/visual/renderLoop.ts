import type { VisualParams } from './mappings';
import { mapSignalsToVisuals } from './mappings';
import { evolveParams } from './evolution';
import type { BrowserSignals } from '../input/signals';
import type { GeoHint } from '../input/geo';
import type { PointerState } from '../input/pointer';
import type { AnalyserPipeline } from '../audio/analyser';
import type { GeometrySystem } from './types';

export interface LoopDeps {
  seed?: string | null;
  signals?: BrowserSignals | null;
  geo?: GeoHint | null;
  getPointerState?: (() => PointerState) | null;
  getAnalyserPipeline?: (() => AnalyserPipeline | null) | null;
  geometrySystem?: GeometrySystem | null;
}

const defaultPointer: PointerState = {
  x: 0.5,
  y: 0.5,
  dx: 0,
  dy: 0,
  speed: 0,
  active: false,
};

const defaultSignals: BrowserSignals = {
  language: 'en',
  timezone: 'UTC',
  screenWidth: 1024,
  screenHeight: 768,
  devicePixelRatio: 1,
  hardwareConcurrency: 4,
  prefersColorScheme: null,
  prefersReducedMotion: null,
  touchCapable: null,
};

const defaultGeo: GeoHint = { country: null, region: null };

function computeDefaultParams(): VisualParams {
  return mapSignalsToVisuals({
    signals: defaultSignals,
    geo: defaultGeo,
    pointer: defaultPointer,
    sessionSeed: 'default',
    bass: 0,
    treble: 0,
    timeOfDay: new Date().getHours() + new Date().getMinutes() / 60,
  });
}

function computeBassAvg(freq: Uint8Array): number {
  if (freq.length === 0) return 0;
  const bassEnd = Math.min(Math.floor(freq.length * 0.25), freq.length);
  let sum = 0;
  for (let i = 0; i < bassEnd; i++) sum += freq[i];
  return sum / bassEnd;
}

function computeTrebleAvg(freq: Uint8Array): number {
  if (freq.length === 0) return 0;
  const trebleStart = Math.floor(freq.length * 0.75);
  let sum = 0;
  const count = freq.length - trebleStart;
  if (count === 0) return 0;
  for (let i = trebleStart; i < freq.length; i++) sum += freq[i];
  return sum / count;
}

export function startLoop(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  deps?: LoopDeps,
): void {
  const d = deps ?? {};
  let lastTime = -1;
  let startTime = -1;
  let geoInitialized = false;
  let smoothTreble = 0;

  const frame = (time: number) => {
    if (startTime < 0) startTime = time;
    const elapsed = time - startTime;
    const delta = lastTime < 0 ? 16 : time - lastTime;
    lastTime = time;

    // Poll audio if available
    let bass = 0;
    let rawTreble = 0;
    const pipeline = d.getAnalyserPipeline?.();
    if (pipeline) {
      pipeline.poll();
      bass = computeBassAvg(pipeline.frequency);
      rawTreble = computeTrebleAvg(pipeline.frequency);
    }

    // EMA smoothing for treble to avoid flicker
    smoothTreble = smoothTreble * 0.85 + rawTreble * 0.15;
    const treble = smoothTreble;

    // Compute visual params
    let params: VisualParams;
    if (d.signals && d.seed) {
      const pointer = d.getPointerState?.() ?? defaultPointer;
      const now = new Date();
      params = mapSignalsToVisuals({
        signals: d.signals,
        geo: d.geo ?? defaultGeo,
        pointer,
        sessionSeed: d.seed,
        bass,
        treble,
        timeOfDay: now.getHours() + now.getMinutes() / 60,
      });
      params = evolveParams(params, elapsed, d.seed);
    } else {
      params = computeDefaultParams();
      params.bassEnergy = 0;
      params.trebleEnergy = 0;
    }

    // Initialize geometry system on first frame with real deps
    if (d.geometrySystem && d.seed && !geoInitialized) {
      d.geometrySystem.init(ctx, d.seed, params);
      geoInitialized = true;
    }

    // Clear
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw geometry
    if (d.geometrySystem && geoInitialized) {
      d.geometrySystem.draw(ctx, {
        time,
        delta,
        elapsed,
        params,
        width: canvas.width,
        height: canvas.height,
      });
    }

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
