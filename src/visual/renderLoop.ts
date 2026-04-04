import type { WebGLRenderer, Scene, PerspectiveCamera, Mesh, AmbientLight, DirectionalLight } from 'three';
import type { VisualParams } from './mappings';
import { mapSignalsToVisuals } from './mappings';
import { evolveParams } from './evolution';
import type { BrowserSignals } from '../input/signals';
import type { GeoHint } from '../input/geo';
import type { PointerState } from '../input/pointer';
import type { AnalyserPipeline } from '../audio/analyser';
import type { GeometrySystem } from './types';
import type { QualityProfile } from './quality';
import type { ShaderErrorCollector } from './shaderErrorCollector';
import { runStartupHealthGate } from './healthGate';
import type { GeometrySystemInfo } from './types';
import { initCameraMotion, updateCamera } from './cameraMotion';

export interface LoopDeps {
  seed?: string | null;
  signals?: BrowserSignals | null;
  geo?: GeoHint | null;
  getPointerState?: (() => PointerState) | null;
  getAnalyserPipeline?: (() => AnalyserPipeline | null) | null;
  geometrySystem?: GeometrySystem | null;
  placeholderMesh?: Mesh | null;
  placeholderAmbient?: AmbientLight | null;
  placeholderDirectional?: DirectionalLight | null;
  quality?: QualityProfile | null;
  errorCollector?: ShaderErrorCollector | null;
  onDebugFrame?: ((data: { fps: number; modeName: string; pointCount: number; bass: number; treble: number; shaderStatus: 'pass' | 'fail' | 'pending'; optionalAttrs: string[]; qualityTier: string }) => void) | null;
  getModeName?: (() => string) | null;
  getPointCount?: (() => number) | null;
  getShaderStatus?: (() => 'pass' | 'fail' | 'pending') | null;
  getOptionalAttrs?: (() => string[]) | null;
  getQualityTier?: (() => string) | null;
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
  let cameraInitialized = false;
  let geometryValid = false;

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

    // Initialize camera motion on first frame with real seed
    if (d.seed && !cameraInitialized) {
      initCameraMotion(d.seed);
      cameraInitialized = true;
    }

    // Initialize geometry system on first frame with real deps
    if (d.geometrySystem && d.seed && !geoInitialized) {
      // US-052: Health gate — init all systems, then validate shaders + geometry
      const gs = d.geometrySystem as unknown as Record<string, unknown>;
      const useValidationPath =
        typeof gs.initAllForValidation === 'function' &&
        d.errorCollector &&
        typeof renderer.compile === 'function';

      try {
        if (useValidationPath) {
          (gs.initAllForValidation as (s: typeof scene, seed: string, p: typeof params) => void)(scene, d.seed, params);
        } else {
          d.geometrySystem.init(scene, d.seed, params);
        }
      } catch (err) {
        console.error('[EAVI health-gate] Geometry init failed:', err);
        geometryValid = false;
        geoInitialized = true;
      }

      if (!geoInitialized) {
        if (useValidationPath && d.errorCollector) {
          // Collect scene geometries for validation
          const geoEntries: GeometrySystemInfo[] = [];
          scene.traverse((obj) => {
            const child = obj as unknown as { geometry?: import('three').BufferGeometry; name?: string; type?: string };
            if (child.geometry && (child.geometry as unknown as { isBufferGeometry?: boolean }).isBufferGeometry) {
              geoEntries.push({
                name: child.name || child.type || 'unknown',
                geometry: child.geometry,
                requiredAttrs: [{ name: 'position', itemSize: 3 }],
              });
            }
          });

          const gateResult = runStartupHealthGate(renderer, scene, camera, d.errorCollector, geoEntries);
          geometryValid = gateResult.passed;

          if (geometryValid) {
            (gs.cleanupInactive as () => void)();
          }
        } else {
          geometryValid = true;
        }
        geoInitialized = true;
      }

      // Remove placeholder mesh and its lights now that geometry systems are active
      if (d.placeholderMesh && geometryValid) {
        scene.remove(d.placeholderMesh);
        if (d.placeholderMesh.geometry) d.placeholderMesh.geometry.dispose();
        if (d.placeholderMesh.material) {
          const mat = d.placeholderMesh.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
        d.placeholderMesh = null;
      }
      if (d.placeholderAmbient && geometryValid) {
        scene.remove(d.placeholderAmbient);
        d.placeholderAmbient = null;
      }
      if (d.placeholderDirectional && geometryValid) {
        scene.remove(d.placeholderDirectional);
        d.placeholderDirectional = null;
      }
    }

    // Rotate placeholder mesh (only while it's still active)
    if (d.placeholderMesh) {
      d.placeholderMesh.rotation.y += delta * 0.0003;
      d.placeholderMesh.rotation.x += delta * 0.0001;
    }

    // Draw geometry — only if init succeeded
    if (d.geometrySystem && geoInitialized && geometryValid) {
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

    // Autonomous camera motion
    if (cameraInitialized) {
      updateCamera(camera, elapsed, smoothBass, params.motionAmplitude);
    }

    // Render
    renderer.render(scene, camera);

    // Debug instrumentation
    d.onDebugFrame?.({
      fps: delta > 0 ? 1000 / delta : 0,
      modeName: d.getModeName?.() ?? 'loading',
      pointCount: d.getPointCount?.() ?? 0,
      bass,
      treble,
      shaderStatus: d.getShaderStatus?.() ?? 'pending',
      optionalAttrs: d.getOptionalAttrs?.() ?? [],
      qualityTier: d.getQualityTier?.() ?? 'unknown',
    });

    requestAnimationFrame(frame);
  };

  requestAnimationFrame(frame);
}
