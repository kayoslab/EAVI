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
import { getActiveFraming, setGlobalOpacityScale } from './modeManager';

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
  composer?: { render(): void } | null;
  errorCollector?: ShaderErrorCollector | null;
  bloomPass?: { strength: number } | null;
  background?: { update(bassEnergy: number): void } | null;
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
    mid: 0,
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

function computeMidAvg(freq: Uint8Array): number {
  const start = Math.floor(freq.length * 0.25);
  const end = Math.floor(freq.length * 0.75);
  let sum = 0;
  for (let i = start; i < end; i++) sum += freq[i];
  return sum / (end - start);
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
  let smoothMid = 0;
  let smoothDisturbance = 0;
  let cameraInitialized = false;
  let geometryValid = false;

  // Beat detection state
  let prevFrequency: Uint8Array | null = null;
  let fluxAvg = 0;
  let beatPulse = 0;

  // Auto quality downgrade state
  let fpsHistory: number[] = [];
  let qualityDowngraded = false;

  // Intro fade state
  let introStartTime = -1;
  let introComplete = false;
  const INTRO_DURATION = 3000; // 3 seconds

  const frame = (time: number) => {
    if (startTime < 0) startTime = time;
    const rawDelta = lastTime < 0 ? 16 : time - lastTime;
    lastTime = time;
    // Clamp delta to prevent animation blowout after tab switch
    const delta = Math.min(rawDelta, 100);
    const elapsed = time - startTime;

    // Auto quality downgrade: track FPS and reduce pixel ratio if sustained low
    if (delta > 0) {
      fpsHistory.push(1000 / delta);
      if (fpsHistory.length > 300) fpsHistory.shift(); // keep ~5s at 60fps
    }
    if (!qualityDowngraded && fpsHistory.length >= 180) { // at least 3 seconds of data
      const avgFps = fpsHistory.reduce((a, b) => a + b, 0) / fpsHistory.length;
      if (avgFps < 30) {
        const currentRatio = renderer.getPixelRatio();
        const newRatio = Math.max(0.5, currentRatio * 0.7);
        renderer.setPixelRatio(newRatio);
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        qualityDowngraded = true;
        console.log('[EAVI] Auto quality downgrade: pixel ratio', currentRatio.toFixed(2), '->', newRatio.toFixed(2));
      }
    }

    // Poll audio if available
    let rawBass = 0;
    let rawTreble = 0;
    let rawMid = 0;
    const pipeline = d.getAnalyserPipeline?.();
    if (pipeline) {
      pipeline.poll();
      rawBass = computeBassAvg(pipeline.frequency);
      rawTreble = computeTrebleAvg(pipeline.frequency);
      rawMid = computeMidAvg(pipeline.frequency);
    }

    // Beat detection: spectral flux
    if (pipeline && prevFrequency) {
      let flux = 0;
      for (let i = 0; i < pipeline.frequency.length; i++) {
        const diff = pipeline.frequency[i] - prevFrequency[i];
        if (diff > 0) flux += diff;
      }
      flux /= pipeline.frequency.length;
      fluxAvg = fluxAvg * 0.95 + flux * 0.05;
      if (flux > fluxAvg * 1.5 && flux > 5) {
        beatPulse = 1.0;
      }
    }
    if (pipeline) {
      if (!prevFrequency) prevFrequency = new Uint8Array(pipeline.frequency.length);
      prevFrequency.set(pipeline.frequency);
    }
    // Decay beat pulse
    beatPulse *= 0.92; // ~200ms decay at 60fps
    if (beatPulse < 0.01) beatPulse = 0;

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

    // EMA smoothing for mid-range
    smoothMid = smoothMid * 0.87 + rawMid * 0.13;
    const mid = smoothMid;

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
        mid,
        timeOfDay: now.getHours() + now.getMinutes() / 60,
      });
      params = evolveParams(params, elapsed, d.seed);

      // Session duration awareness: longer sessions drift warmer
      const sessionMinutes = elapsed / 60000;
      if (sessionMinutes > 5) {
        const driftRate = sessionMinutes > 10 ? 1.0 : 0.5; // degrees per minute
        const hueOffset = (sessionMinutes - 5) * driftRate;
        params.paletteHue = ((params.paletteHue + hueOffset) % 360 + 360) % 360;
      }
    } else {
      params = computeDefaultParams();
      params.trebleEnergy = 0;
    }

    // EMA smoothing for pointer disturbance to avoid instant drop on idle
    smoothDisturbance = smoothDisturbance * 0.92 + params.pointerDisturbance * 0.08;
    params.pointerDisturbance = smoothDisturbance;

    // Inject per-frame beat pulse (not a mapping input, computed from spectral flux)
    params.beatPulse = beatPulse;

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

    // Update background atmosphere with bass energy
    if (d.background) {
      d.background.update(bass / 255);
    }

    // Intro fade: start timing when geometry initializes, apply global opacity scale
    if (d.geometrySystem && geoInitialized && geometryValid) {
      if (introStartTime < 0) {
        introStartTime = elapsed;
      }
      if (!introComplete) {
        const t = Math.min(1, (elapsed - introStartTime) / INTRO_DURATION);
        const fade = t * t * (3 - 2 * t); // smoothstep
        setGlobalOpacityScale(fade);
        if (t >= 1) {
          introComplete = true;
          setGlobalOpacityScale(1);
        }
      }
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

    // Autonomous camera motion with per-mode framing
    if (cameraInitialized) {
      const framing = getActiveFraming();
      updateCamera(camera, elapsed, smoothBass, params.motionAmplitude, framing);

      // Update near/far planes from framing config
      if (camera.near !== framing.nearClip || camera.far !== framing.farClip) {
        camera.near = framing.nearClip;
        camera.far = framing.farClip;
        camera.updateProjectionMatrix();
      }
    }

    // Per-mode bloom strength
    if (d.bloomPass) {
      const framing = getActiveFraming();
      d.bloomPass.strength = framing.bloomStrength ?? d.bloomPass.strength;
    }

    // Render
    if (d.composer) {
      d.composer.render();
    } else {
      renderer.render(scene, camera);
    }

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
