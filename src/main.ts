import './style.css';
import { surface } from 'vgpu';
import { fetchGeoHint } from './input/geo';
import { readSignals } from './input/signals';
import { initPointer } from './input/pointer';
import { initSessionSeed } from './seed/sessionSeed';
import { computeQuality } from './visual/quality';
import { initAudio } from './audio/player';
import { createMuteButton } from './ui/audioToggle';
import { createInfoButton, createInfoOverlay } from './ui/infoOverlay';
import { createTrackDisplay } from './ui/trackDisplay';
import { generateTrackName } from './ui/trackNameGenerator';
import { createDebugOverlay } from './ui/debugOverlay';
import { createDebugPanel } from './ui/debugPanel';
import { presetForSeed } from './post/presets';
import { renderUnsupported } from './ui/unsupported';
import { createGpu, WebGPUUnavailableError } from './render/gpu';
import { createTargets } from './render/targets';
import { createCamera } from './render/camera';
import { createHealthGate } from './render/healthGate';
import { startLoop, type LoopDeps } from './render/loop';
import { createPostStack } from './post/stack';
import { selectRecipe } from './director/recipe';
import { createDirector } from './director/director';
import { createTrackSync } from './audio/structure/sync';
import { createAdaptiveQuality } from './render/adaptive';
import { PRESETS } from './post/presets';

const app = document.getElementById('app')!;

async function boot(): Promise<void> {
  // The info button and overlay carry the privacy statement and credits, so they mount on
  // every path, including the static page for browsers without WebGPU.
  document.body.appendChild(createInfoButton());
  document.body.appendChild(createInfoOverlay());

  // 1. GPU or static page. Nothing else starts without a device.
  let gpuContext;
  try {
    gpuContext = await createGpu();
  } catch (err) {
    const code = err instanceof WebGPUUnavailableError ? err.code : 'VGPU-INIT-FAILED';
    console.warn('[EAVI] WebGPU unavailable:', code, err);
    renderUnsupported(app, `webgpu: ${code.toLowerCase()}`);
    return;
  }
  const { gpu } = gpuContext;

  const signals = readSignals();
  const quality = computeQuality(signals);
  console.debug('[EAVI] quality tier:', quality.tier);

  const canvas = document.createElement('canvas');
  app.appendChild(canvas);
  let maxDpr = quality.tier === 'high' ? 2 : quality.tier === 'medium' ? 1.5 : 1;
  let canvasSurface = surface(gpu, canvas, { dpr: [1, maxDpr], label: 'eavi-canvas' });

  // 2. Session identity: coarse geo + device signals + time → seed.
  const geo = await fetchGeoHint();
  const seed = initSessionSeed(signals, geo);
  console.debug('[EAVI] session seed:', seed);

  // 3. Targets, camera, layers, post. Seeded recipe until the Director (Phase 4) takes over.
  const targets = createTargets(gpu, canvasSurface.size);
  const recipe = selectRecipe(seed, quality.tier);
  console.debug('[EAVI] recipe:', recipe.id);
  const camera = createCamera(seed, { distance: recipe.cameraDistance, pitch: recipe.cameraPitch ?? 0.2 });
  const sync = createTrackSync();
  const director = createDirector({
    gpu, seed, tier: quality.tier, dpr: canvasSurface.dpr, bus: sync.bus, scene: targets.scene, camera,
    initialRecipe: recipe,
    post: { setPreset: (p) => post.setPreset(p) },
    onError: (err) => console.error('[EAVI director] layer failed to compile', err),
  });
  const preset = recipe.post ? PRESETS[recipe.post] : presetForSeed(seed);
  console.debug('[EAVI] post preset:', preset.name);
  const post = createPostStack(gpu, targets, { preset, bloom: quality.enableBloom, warp: quality.tier !== 'low' });

  const attachSurface = (s: typeof canvasSurface) => s.onResize(({ width, height }) => {
    targets.resize([width, height]);
    post.rebind();
    camera.setViewport(width, height);
    for (const a of director.state.layers) a.layer.resize([width, height]);
  });
  let detachResize = attachSurface(canvasSurface);

  // 4. Health gate: compile every pipeline ahead; fail → static page, never a broken scene.
  const health = createHealthGate(gpu);
  const compiled = await health.compileAll([
    () => director.start(),
    () => post.compile(canvasSurface),
  ]);
  if (!compiled) {
    console.error('[EAVI] health gate failed', health.errors);
    director.dispose();
    post.dispose();
    targets.dispose();
    gpu.dispose();
    renderUnsupported(app, 'gpu: pipeline validation failed');
    return;
  }

  // 5. Input + UI.
  const pointer = initPointer(canvas);
  const trackDisplay = createTrackDisplay();

  const debugEnabled = new URLSearchParams(window.location.search).has('debug');
  const debugOverlay = debugEnabled ? createDebugOverlay() : null;
  if (debugOverlay) {
    document.body.appendChild(debugOverlay.element);
    document.body.appendChild(createDebugPanel(post).element);
  }

  // 6. Loop.
  const loopDeps: LoopDeps = {
    gpu, output: canvasSurface, targets, camera, director, post, health, sync,
    seed, signals, geo, tier: quality.tier,
    getPointerState: () => pointer.getState(),
    getAnalyserPipeline: () => null as ReturnType<Awaited<ReturnType<typeof initAudio>>['getPipeline']> | null,
    getPlayback: () => null as ReturnType<Awaited<ReturnType<typeof initAudio>>['getPlayback']> | null,
    ...(debugOverlay ? { onDebugFrame: debugOverlay.update } : {}),
  };
  const adaptive = createAdaptiveQuality({
    post,
    lowerDpr: () => {
      if (maxDpr <= 1) return null;
      maxDpr = Math.max(1, maxDpr * 0.7);
      // A canvas has one live surface: dispose, recreate with the lower cap, and point the loop at it.
      detachResize();
      canvasSurface.dispose();
      canvasSurface = surface(gpu, canvas, { dpr: [1, maxDpr], label: 'eavi-canvas' });
      detachResize = attachSurface(canvasSurface);
      loopDeps.output = canvasSurface;
      post.compile(canvasSurface).catch((err) => console.error('[EAVI adaptive] recompile failed', err));
      return maxDpr;
    },
  });
  loopDeps.onFrameHealth = (fps, t) => adaptive.tick(fps, t);
  const loop = startLoop(loopDeps);

  gpu.lost.then((info) => {
    console.error('[EAVI] GPU device lost:', info.reason, info.message);
    loop.stop();
    renderUnsupported(app, 'gpu: device lost');
  });

  // Settle the first frames, then re-check the gate once (async validation errors arrive late).
  health.settle().then((ok) => {
    if (!ok) console.error('[EAVI] health gate reported errors after first frames', health.errors);
  });

  // 7. Audio (non-blocking — visuals never wait for it).
  initAudio((trackPath) => {
    trackDisplay.show(generateTrackName(seed, trackPath));
    sync.setTrack(trackPath);
  }).then((player) => {
    console.debug('[EAVI] audio state:', player.state);
    document.body.appendChild(createMuteButton(player));
    loopDeps.getAnalyserPipeline = () => player.getPipeline();
    loopDeps.getPlayback = () => player.getPlayback();
  }).catch((err) => {
    console.warn('[EAVI] audio init failed; visuals continue', err);
  });
}

boot().catch((err) => {
  console.error('[EAVI] boot failed', err);
  renderUnsupported(app, 'boot failed');
});
