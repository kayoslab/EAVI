import type { WebGLRenderer, Scene, PerspectiveCamera, Mesh } from 'three';
import type { VisualParams } from './mappings';
import { mapSignalsToVisuals } from './mappings';
import { evolveParams } from './evolution';
import type { BrowserSignals } from '../input/signals';
import type { GeoHint } from '../input/geo';
import type { PointerState } from '../input/pointer';
import type { AnalyserPipeline } from '../audio/analyser';
import type { GeometrySystem } from './types';
import type { QualityProfile } from './quality';

export interface LoopDeps {
  seed?: string | null;
  signals?: BrowserSignals | null;
  geo?: GeoHint | null;
  getPointerState?: (() => PointerState) | null;
  getAnalyserPipeline?: (() => AnalyserPipeline | null) | null;
  geometrySystem?: GeometrySystem | null;
  placeholderMesh?: Mesh | null;
  quality?: QualityProfile | null;
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
  deviceMemory: null,
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
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  deps?: LoopDeps,
): void {
  const d = deps ?? {};
  let lastTime = -1;
  let startTime = -1;
  let geoInitialized = false;
  let smoothTreble = 0;
  let smoothBass = 0;
  let smoothDisturbance = 0;

  const frame = (time: number) => {
    if (startTime < 0) startTime = time;
    const elapsed = time - startTime;
    const delta = lastTime < 0 ? 16 : time - lastTime;
    lastTime = time;

    // Poll audio if available
    let rawBass = 0;
    let rawTreble = 0;
    const pipeline = d.getAnalyserPipeline?.();
    if (pipeline) {
      pipeline.poll();
      rawBass = computeBassAvg(pipeline.frequency);
      rawTreble = computeTrebleAvg(pipeline.frequency);
    }

    // Synthetic bass fallback when audio is silent/muted
    if (rawBass < 5) {
      rawBass = 30 + 25 * Math.sin(elapsed * 0.001);
    }

    // EMA smoothing for bass (heavier than treble for weightier feel)
    smoothBass = smoothBass * 0.88 + rawBass * 0.12;
    const bass = smoothBass;

    // EMA smoothing for treble to avoid flicker
    smoothTreble = smoothTreble * 0.85 + rawTreble * 0.15;
    const treble = smoothTreble;

    // Compute visual params
    let params: VisualParams;
    let pointerX = 0.5;
    let pointerY = 0.5;
    if (d.signals && d.seed) {
      const pointer = d.getPointerState?.() ?? defaultPointer;
      pointerX = pointer.x;
      pointerY = pointer.y;
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
      params.trebleEnergy = 0;
    }

    // EMA smoothing for pointer disturbance to avoid instant drop on idle
    smoothDisturbance = smoothDisturbance * 0.92 + params.pointerDisturbance * 0.08;
    params.pointerDisturbance = smoothDisturbance;

    // Initialize geometry system on first frame with real deps
    if (d.geometrySystem && d.seed && !geoInitialized) {
      d.geometrySystem.init(scene, d.seed, params);
      geoInitialized = true;
    }

    // Rotate placeholder mesh
    if (d.placeholderMesh) {
      d.placeholderMesh.rotation.y += delta * 0.0003;
      d.placeholderMesh.rotation.x += delta * 0.0001;
    }

    // Draw geometry
    if (d.geometrySystem && geoInitialized) {
      d.geometrySystem.draw(scene, {
        time,
        delta,
        elapsed,
        params,
        width: renderer.domElement.width,
        height: renderer.domElement.height,
        pointerX,
        pointerY,
      });
    }

    // Render
    renderer.render(scene, camera);

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
