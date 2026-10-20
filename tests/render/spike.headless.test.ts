// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { frame, target, compute, type Gpu } from 'vgpu';
import { init } from 'vgpu/node';
import { prepareShader } from '@vgpu/wgsl/prepare';
import { createTargets } from '../../src/render/targets';
import { createCamera } from '../../src/render/camera';
import { createHealthGate } from '../../src/render/healthGate';
import { createFrameEncoder } from '../../src/render/loop';
import { createStaticDirector } from '../../src/director/director';
import { createPostStack } from '../../src/post/stack';
import { createAttractorLayer } from '../../src/layers/particles/attractor';
import { createMengerLayer } from '../../src/layers/subject/menger';
import { PRESETS } from '../../src/post/presets';
import type { Layer } from '../../src/layers/Layer';
import type { BrowserSignals } from '../../src/input/signals';

/**
 * Phase 1 exit gate, headless: the production pipeline (layers → scene → post → output) renders
 * through Dawn, compiles ahead with zero errors, and produces a non-black frame.
 * Skips cleanly when no Node WebGPU adapter is available on the machine.
 */

const signals: BrowserSignals = {
  language: 'en', timezone: 'UTC', screenWidth: 1280, screenHeight: 720, devicePixelRatio: 1,
  hardwareConcurrency: 8, prefersColorScheme: null, prefersReducedMotion: null, touchCapable: false, deviceMemory: 8,
};

const WIDTH = 320;
const HEIGHT = 180;

let gpu: Gpu | null = null;
let available = true;
try {
  gpu = await init({ requiredLimits: { maxStorageBuffersInVertexStage: 1 } });
} catch (err) {
  available = false;
  console.warn('[spike.headless] no Node WebGPU adapter, skipping:', (err as Error).message);
}

afterAll(() => {
  gpu?.dispose();
});

describe.skipIf(!available)('Phase 1 spike: headless render through vgpu/node', () => {
  it('compiles every pipeline ahead and renders a non-black frame with zero GPU errors', async () => {
    const g = gpu!;
    const output = target(g, { size: [WIDTH, HEIGHT], label: 'spike-output' });
    const targets = createTargets(g, [WIDTH, HEIGHT]);
    const seed = 'spike-seed-0001';
    const camera = createCamera(seed, { distance: 4.4 });
    camera.setViewport(WIDTH, HEIGHT);
    const layers: Layer[] = [
      createMengerLayer(g, { seed, iterations: 3 }),
      createAttractorLayer(g, { seed, count: 20_000, pointSize: 2 }),
    ];
    const post = createPostStack(g, targets, { bloom: true, warp: true, preset: PRESETS.crt });
    const health = createHealthGate(g);

    const compiled = await health.compileAll([
      ...layers.map((layer) => () => layer.compile(targets.scene)),
      () => post.compile(output),
    ]);
    expect(health.errors).toEqual([]);
    expect(compiled).toBe(true);

    const encode = createFrameEncoder({
      gpu: g, output, targets, camera, director: createStaticDirector(layers), post, health,
      seed, signals, geo: { country: null, region: null }, tier: 'test',
    });

    // Warm the simulation and run past the 3 s intro fade so the frame is at full opacity.
    const times = [0, 16, 33, 50, 66, 83, 100, 3400, 3416, 3433, 3450, 3466, 3483, 3500];
    for (const t of times) {
      frame(g, (f) => encode(f, t));
    }
    await g.settled();
    expect(await health.settle()).toBe(true);
    expect(health.errors).toEqual([]);

    const pixels = await output.color.read({ mipLevel: 0, region: 'all' });
    expect(pixels.length).toBe(WIDTH * HEIGHT * 4);
    let lit = 0;
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const v = pixels[i] + pixels[i + 1] + pixels[i + 2];
      sum += v;
      if (v > 30) lit++;
    }
    const litFraction = lit / (WIDTH * HEIGHT);
    console.info(`[spike.headless] lit pixels ${(litFraction * 100).toFixed(1)}%, mean ${(sum / (WIDTH * HEIGHT * 3)).toFixed(1)}`);
    expect(litFraction).toBeGreaterThan(0.02);
    expect(litFraction).toBeLessThan(0.98); // not a blown-out white frame either

    // Keep a PNG for human inspection (not asserted on).
    const outDir = resolve(__dirname, '../../.artifacts');
    mkdirSync(outDir, { recursive: true });
    const png = new PNG({ width: WIDTH, height: HEIGHT });
    png.data.set(pixels);
    writeFileSync(resolve(outDir, 'spike-headless.png'), PNG.sync.write(png));

    for (const layer of layers) layer.dispose();
    post.dispose();
    targets.dispose();
    health.dispose();
  }, 60_000);

  it('luminance limiter stops a sudden brightness jump and releases it over time', async () => {
    const g = gpu!;
    const w = 64;
    const h = 36;
    const output = target(g, { size: [w, h], label: 'limiter-output' });
    const targets = createTargets(g, [w, h]);
    const seed = 'limiter-seed';
    const camera = createCamera(seed, { distance: 3.2 });
    camera.setViewport(w, h);
    const layers: Layer[] = [createMengerLayer(g, { seed, iterations: 2 })];
    const post = createPostStack(g, targets, { bloom: false, warp: false, preset: PRESETS.clean });
    post.setParams({ feedbackDamp: 0, grain: 0, vignette: 0, exposure: 0.4, limiterSlewUp: 0.01, agcRate: 0 });
    const health = createHealthGate(g);
    expect(await health.compileAll([...layers.map((l) => () => l.compile(targets.scene)), () => post.compile(output)])).toBe(true);
    const encode = createFrameEncoder({
      gpu: g, output, targets, camera, director: createStaticDirector(layers), post, health,
      seed, signals, geo: { country: null, region: null }, tier: 'test',
    });
    const meanOf = async () => {
      const px = await output.color.read({ mipLevel: 0, region: 'all' });
      let sum = 0;
      for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
      return sum / (px.length / 4) / 3 / 255;
    };
    // Settle well past the intro fade at low exposure.
    let t = 4000;
    for (let i = 0; i < 40; i++, t += 16) frame(g, (f) => encode(f, t));
    await g.settled();
    const before = await meanOf();

    // A 10× exposure jump would be a flash; the limiter must hold the very next frame close to the previous.
    post.setParams({ exposure: 4 });
    frame(g, (f) => encode(f, (t += 16)));
    await g.settled();
    const immediately = await meanOf();
    expect(immediately - before).toBeLessThan(0.05);

    // Over many frames the limiter releases and the frame does get brighter.
    for (let i = 0; i < 240; i++, t += 16) frame(g, (f) => encode(f, t));
    await g.settled();
    const later = await meanOf();
    expect(later).toBeGreaterThan(immediately + 0.05);
    expect(health.errors).toEqual([]);

    for (const layer of layers) layer.dispose();
    post.dispose();
    targets.dispose();
    health.dispose();
  }, 60_000);

  it('health gate fails on a pipeline the device rejects', async () => {
    const g = gpu!;
    const health = createHealthGate(g);
    // Syntactically valid WGSL that exceeds maxComputeInvocationsPerWorkgroup: Dawn rejects the pipeline.
    const tooBig = prepareShader(
      '@compute @workgroup_size(256, 256, 1) fn cs_main(@builtin(global_invocation_id) id: vec3u) {}',
      'too-big.wgsl',
    );
    const ok = await health.compileAll([() => compute(g, tooBig, { label: 'spike-too-big' }).compile()]);
    await g.settled();
    expect(ok).toBe(false);
    expect(health.status).toBe('fail');
    expect(health.errors.length).toBeGreaterThan(0);
    health.dispose();
  }, 30_000);
});
