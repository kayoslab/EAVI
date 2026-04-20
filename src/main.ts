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
import { createFlowRibbonField } from './visual/systems/flowRibbonField';
import { createModeManager } from './visual/modeManager';
import type { RotationEntry, SingleRotationEntry } from './visual/modeManager';
import { computeQuality } from './visual/quality';
import { createConstellationLines } from './visual/systems/constellationLines';
import { createBezierCurveWeb } from './visual/systems/bezierCurveWeb';
import { createTerrainHeightfield } from './visual/systems/terrainHeightfield';
import { createTerrainWireframe } from './visual/systems/terrainWireframe';
import { buildCompoundEntries, type SystemRegistry } from './visual/compoundModes';
import { initComposer } from './visual/composer';

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

  // Init bloom postprocessing (null on low tier)
  const composerResult = initComposer(renderer, scene, camera, quality);
  if (composerResult) {
    deps.composer = composerResult.composer;
  }

  // Apply resolution scale to renderer and resize handler
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * quality.resolutionScale);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  cleanupResize();
  cleanupResize = attachResizeHandler(renderer, camera, quality.resolutionScale, composerResult?.composer ?? null);

  // Create geometry systems with quality-driven config
  const particles = createParticleField({
    maxParticles: quality.maxParticles,
    enableSparkle: quality.enableSparkle,
    dofStrength: quality.dofStrength,
  });
  const ribbon = createRibbonField({
    maxPoints: quality.maxRibbonPoints,
    enableSparkle: quality.enableSparkle,
    noiseOctaves: quality.noiseOctaves,
    enablePointerRepulsion: quality.enablePointerRepulsion,
    enableSlowModulation: quality.enableSlowModulation,
    dofStrength: quality.dofStrength,
  });
  const pointCloud = createPointCloud({
    maxPoints: quality.maxPoints,
    enableSparkle: quality.enableSparkle,
    noiseOctaves: quality.noiseOctaves,
    enablePointerRepulsion: quality.enablePointerRepulsion,
    enableSlowModulation: quality.enableSlowModulation,
    useVoronoiShader: quality.enableVoronoiCells,
    dofStrength: quality.dofStrength,
  });
  const crystal = createCrystalField({
    maxPoints: Math.round(quality.maxPoints * 0.8),
    enableSparkle: quality.enableSparkle,
    noiseOctaves: quality.noiseOctaves,
    enablePointerRepulsion: quality.enablePointerRepulsion,
    enableSlowModulation: quality.enableSlowModulation,
    dofStrength: quality.dofStrength,
  });
  const flowRibbon = createFlowRibbonField({
    maxPoints: quality.maxFlowRibbonPoints,
    enableSparkle: quality.enableSparkle,
    noiseOctaves: quality.noiseOctaves,
    enablePointerRepulsion: quality.enablePointerRepulsion,
    enableSlowModulation: quality.enableSlowModulation,
    dofStrength: quality.dofStrength,
  });
  const terrain = createTerrainHeightfield({
    rows: quality.terrainRows,
    cols: quality.terrainCols,
    pointCount: quality.terrainPointCount,
    noiseOctaves: quality.noiseOctaves,
    dofStrength: quality.dofStrength,
  });
  const terrainDramatic = createTerrainHeightfield({
    rows: quality.terrainRows,
    cols: quality.terrainCols,
    noiseOctaves: quality.noiseOctaves,
    dofStrength: quality.dofStrength,
    heightScale: 8.0,
    gradientMode: 'terrain-dramatic',
  });
  const terrainWireframe = createTerrainWireframe({
    rows: Math.min(quality.terrainRows, 120),
    cols: Math.min(quality.terrainCols, 160),
    noiseOctaves: quality.noiseOctaves,
    dofStrength: quality.dofStrength,
  });
  // Build single-mode rotation entries
  // Flagship modes (terrain, pointcloud) get weight 2
  const singleEntries: SingleRotationEntry[] = [
    { kind: 'single', name: 'particles', system: particles, maxPoints: quality.maxParticles,
      framing: { targetDistance: 4.5, lookOffset: [0, 0, 0], nearClip: 0.1, farClip: 50 } },
    { kind: 'single', name: 'ribbon', system: ribbon, maxPoints: quality.maxRibbonPoints,
      framing: { targetDistance: 3.0, lookOffset: [0, 0, 0], nearClip: 0.1, farClip: 30 } },
    { kind: 'single', name: 'pointcloud', system: pointCloud, maxPoints: quality.maxPoints, weight: 2,
      framing: { targetDistance: 3.5, lookOffset: [0, 0, 0], nearClip: 0.1, farClip: 40 } },
    { kind: 'single', name: 'crystal', system: crystal, maxPoints: Math.round(quality.maxPoints * 0.8),
      framing: { targetDistance: 6.0, lookOffset: [0, 0, 0], nearClip: 0.1, farClip: 80 } },
    { kind: 'single', name: 'flowribbon', system: flowRibbon, maxPoints: quality.maxFlowRibbonPoints,
      framing: { targetDistance: 5.5, lookOffset: [0, 0, 0], nearClip: 0.1, farClip: 60 } },
    { kind: 'single', name: 'terrain', system: terrain, maxPoints: quality.terrainRows * quality.terrainCols, weight: 2,
      framing: { targetDistance: 8.0, lookOffset: [0, 0.5, -25], nearClip: 0.1, farClip: 200, driftScale: [4, 1, 1] } },
    { kind: 'single', name: 'terrain-dramatic', system: terrainDramatic, maxPoints: quality.terrainRows * quality.terrainCols, weight: 1,
      framing: { targetDistance: 10.0, lookOffset: [0, 1.0, -25], nearClip: 0.1, farClip: 200, driftScale: [4, 1, 1] } },
    { kind: 'single', name: 'terrain-wireframe', system: terrainWireframe, maxPoints: Math.min(quality.terrainRows, 120) * Math.min(quality.terrainCols, 160), weight: 1,
      framing: { targetDistance: 8.0, lookOffset: [0, 0.5, -25], nearClip: 0.1, farClip: 200, driftScale: [4, 1, 1] } },
  ];

  // Build compound mode entries (empty on low tier)
  const systemRegistry: SystemRegistry = {
    particles: (cfg) => createParticleField(cfg as Parameters<typeof createParticleField>[0]),
    ribbon: (cfg) => createRibbonField(cfg as Parameters<typeof createRibbonField>[0]),
    pointcloud: (cfg) => createPointCloud(cfg as Parameters<typeof createPointCloud>[0]),
    crystal: (cfg) => createCrystalField(cfg as Parameters<typeof createCrystalField>[0]),
    flowribbon: (cfg) => createFlowRibbonField(cfg as Parameters<typeof createFlowRibbonField>[0]),
    terrain: (cfg) => createTerrainHeightfield(cfg as Parameters<typeof createTerrainHeightfield>[0]),
    'terrain-dramatic': (cfg) => createTerrainHeightfield(cfg as Parameters<typeof createTerrainHeightfield>[0]),
    'terrain-wireframe': (cfg) => createTerrainWireframe(cfg as Parameters<typeof createTerrainWireframe>[0]),
  };
  const compoundEntries = buildCompoundEntries(quality, systemRegistry);

  // Interleave compound entries among singles
  const allEntries: RotationEntry[] = [...singleEntries, ...compoundEntries];
  const modeManager = createModeManager(allEntries);

  // Attach overlay for medium/high tier devices:
  // Bezier web replaces constellation lines with organic curved connections
  if (quality.enableBezierWeb) {
    const bezierOverlay = createBezierCurveWeb({
      maxConnections: quality.maxBezierConnections,
      segments: quality.bezierSegments,
    });
    modeManager.attachOverlay({
      overlay: bezierOverlay,
      getPositions: (system) => {
        const s = system as { positions?: Float32Array | null };
        return s.positions ? Float32Array.from(s.positions) : null;
      },
    });
  } else if (quality.enableConstellationLines) {
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
  deps.getModeName = () => modeManager.activeEntryName;
  deps.getPointCount = () => modeManager.activeMaxPoints;
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
