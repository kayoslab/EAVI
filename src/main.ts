import './style.css';
import { fetchGeoHint } from './input/geo';
import { readSignals } from './input/signals';
import { initSessionSeed } from './seed/sessionSeed';
import { initAudio } from './audio/player';
import { createMuteButton } from './ui/audioToggle';
import { createInfoButton, createInfoOverlay } from './ui/infoOverlay';
import { createDebugOverlay } from './ui/debugOverlay';
import { initScene, WebGLUnavailableError } from './visual/scene';
import { attachResizeHandler } from './visual/resize';
import { startLoop, type LoopDeps } from './visual/renderLoop';
import { initPointer } from './input/pointer';
import { addPlaceholder } from './visual/placeholder';
import { createParticleField } from './visual/systems/particleField';
import { createRibbonField } from './visual/systems/ribbonField';
import { createPointCloud } from './visual/systems/pointCloud';
import { createCrystalField } from './visual/systems/crystalField';
import { createMicroGeometry } from './visual/systems/microGeometry';
import { createWireframePolyhedra } from './visual/systems/wireframePolyhedra';
import { createModeManager } from './visual/modeManager';
import { computeQuality } from './visual/quality';
import { createConstellationLines } from './visual/systems/constellationLines';

// Quick pre-quality heuristic for antialias (renderer is created before quality resolves)
const quickTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const lowDPR = window.devicePixelRatio <= 1;

// Three.js scene bootstrap — render immediately so the dark scene is visible before async work
const app = document.getElementById('app')!;

let sceneResult: ReturnType<typeof initScene>;
try {
  sceneResult = initScene(app, {
    disableAntialias: quickTouch && lowDPR,
  });
} catch (err) {
  if (err instanceof WebGLUnavailableError) {
    const fallback = document.createElement('div');
    fallback.style.cssText =
      'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
      'background:#000;color:#ccc;font-family:system-ui,sans-serif;font-size:1.1rem;' +
      'text-align:center;padding:2rem;';
    fallback.textContent = 'This experience requires WebGL, which is not available in your browser.';
    app.appendChild(fallback);
    throw err; // stop execution — no render loop, audio, or pointer systems
  }
  throw err;
}

const { renderer, scene, camera, errorCollector } = sceneResult;
let cleanupResize = attachResizeHandler(renderer, camera);

// Add placeholder 3D object
const { mesh, ambient, directional } = addPlaceholder(scene);

// Shared deps object — mutated as async work resolves
const deps: LoopDeps = {
  placeholderMesh: mesh,
  placeholderAmbient: ambient,
  placeholderDirectional: directional,
  errorCollector,
};

// Debug overlay — enabled only via ?debug query param
const debugEnabled = new URLSearchParams(window.location.search).has('debug');
if (debugEnabled) {
  const debugOverlay = createDebugOverlay();
  document.body.appendChild(debugOverlay.element);
  deps.onDebugFrame = debugOverlay.update;
}

// Pointer tracking
const pointer = initPointer(renderer.domElement);
deps.getPointerState = () => pointer.getState();

// Start loop immediately with partial deps (renders placeholder + defaults)
startLoop(renderer, scene, camera, deps);

const geoPromise = fetchGeoHint();

geoPromise.then((geo) => {
  console.debug('[EAVI] geo hint:', geo);
  const signals = readSignals();
  const seed = initSessionSeed(signals, geo);
  console.debug('[EAVI] session seed:', seed);

  // Compute quality tier from device signals
  const quality = computeQuality(signals);
  console.debug('[EAVI] quality tier:', quality.tier);

  // Apply resolution scale to renderer and resize handler
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * quality.resolutionScale);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  cleanupResize();
  cleanupResize = attachResizeHandler(renderer, camera, quality.resolutionScale);

  // Create geometry systems with quality-driven config
  const particles = createParticleField({
    maxParticles: quality.maxParticles,
    enableSparkle: quality.enableSparkle,
  });
  const ribbon = createRibbonField({
    maxPoints: quality.maxRibbonPoints,
    enableSparkle: quality.enableSparkle,
    noiseOctaves: quality.noiseOctaves,
    enablePointerRepulsion: quality.enablePointerRepulsion,
    enableSlowModulation: quality.enableSlowModulation,
  });
  const pointCloud = createPointCloud({
    maxPoints: quality.maxPoints,
    enableSparkle: quality.enableSparkle,
    noiseOctaves: quality.noiseOctaves,
    enablePointerRepulsion: quality.enablePointerRepulsion,
    enableSlowModulation: quality.enableSlowModulation,
    useVoronoiShader: quality.enableVoronoiCells,
  });
  const crystal = createCrystalField({
    maxPoints: Math.round(quality.maxPoints * 0.8),
    enableSparkle: quality.enableSparkle,
    noiseOctaves: quality.noiseOctaves,
    enablePointerRepulsion: quality.enablePointerRepulsion,
    enableSlowModulation: quality.enableSlowModulation,
  });
  const microGeo = createMicroGeometry({
    maxInstances: quality.maxInstances,
    noiseOctaves: quality.noiseOctaves,
    enablePointerRepulsion: quality.enablePointerRepulsion,
    enableSlowModulation: quality.enableSlowModulation,
  });
  const wireframe = createWireframePolyhedra({
    maxPolyhedra: quality.maxPolyhedra,
    noiseOctaves: quality.noiseOctaves,
    enablePointerRepulsion: quality.enablePointerRepulsion,
    enableSlowModulation: quality.enableSlowModulation,
    enableElectricArc: quality.enableElectricArc,
    arcSubdivisions: quality.arcSubdivisions,
  });
  const modeManager = createModeManager([
    { name: 'particles', factory: () => particles },
    { name: 'ribbon', factory: () => ribbon },
    { name: 'pointcloud', factory: () => pointCloud },
    { name: 'crystal', factory: () => crystal },
    { name: 'microgeometry', factory: () => microGeo },
    { name: 'wirepolyhedra', factory: () => wireframe },
  ]);

  // Attach constellation line overlay for medium/high tier devices
  if (quality.enableConstellationLines) {
    const constellationOverlay = createConstellationLines({
      maxConnections: quality.maxConstellationSegments,
      enableElectricArc: quality.enableElectricArc,
      arcSubdivisions: quality.arcSubdivisions,
    });
    modeManager.attachOverlay({
      overlay: constellationOverlay,
      getPositions: (system) => {
        const s = system as { positions?: Float32Array | null };
        return s.positions ? Float32Array.from(s.positions) : null;
      },
    });
  }

  // Enrich loop deps — geometry will init on next frame
  deps.seed = seed;
  deps.signals = signals;
  deps.geo = geo;
  deps.quality = quality;
  deps.geometrySystem = modeManager;

  // Wire debug getters now that mode manager and quality are available
  const modes = [
    { name: 'particles', maxPoints: quality.maxParticles },
    { name: 'ribbon', maxPoints: quality.maxRibbonPoints },
    { name: 'pointcloud', maxPoints: quality.maxPoints },
    { name: 'crystal', maxPoints: Math.round(quality.maxPoints * 0.8) },
    { name: 'microgeometry', maxPoints: quality.maxInstances },
    { name: 'wirepolyhedra', maxPoints: quality.maxPolyhedra },
  ];
  deps.getModeName = () => modes[modeManager.activeIndex]?.name ?? 'unknown';
  deps.getPointCount = () => modes[modeManager.activeIndex]?.maxPoints ?? 0;
  deps.getShaderStatus = () => errorCollector.hasErrors() ? 'fail' : 'pass';
  deps.getQualityTier = () => quality.tier;
  deps.getOptionalAttrs = () => {
    const optNames = new Set<string>();
    const knownOptional = ['size'];
    scene.traverse((obj) => {
      const child = obj as unknown as { geometry?: import('three').BufferGeometry };
      if (child.geometry && (child.geometry as unknown as { isBufferGeometry?: boolean }).isBufferGeometry) {
        for (const attr of knownOptional) {
          if (child.geometry.getAttribute(attr)) optNames.add(attr);
        }
      }
    });
    return Array.from(optNames);
  };
});

// Info button + overlay — append immediately, no async dependency
document.body.appendChild(createInfoButton());
document.body.appendChild(createInfoOverlay());

// Start audio (non-blocking — visuals must not depend on this)
const audioPromise = initAudio();

audioPromise.then((player) => {
  console.debug('[EAVI] audio state:', player.state);
  document.body.appendChild(createMuteButton(player));
  deps.getAnalyserPipeline = () => player.getPipeline();
});
