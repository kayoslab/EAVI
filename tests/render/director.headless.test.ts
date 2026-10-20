// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { frame, target, type Gpu } from 'vgpu';
import { init } from 'vgpu/node';
import { createTargets } from '../../src/render/targets';
import { createCamera } from '../../src/render/camera';
import { createHealthGate } from '../../src/render/healthGate';
import { createFrameEncoder } from '../../src/render/loop';
import { createPostStack } from '../../src/post/stack';
import { PRESETS } from '../../src/post/presets';
import { createDirector } from '../../src/director/director';
import { createEventBus, type AudioEvent } from '../../src/audio/structure/eventBus';
import type { BrowserSignals } from '../../src/input/signals';

const signals: BrowserSignals = {
  language: 'en', timezone: 'UTC', screenWidth: 1280, screenHeight: 720, devicePixelRatio: 1,
  hardwareConcurrency: 8, prefersColorScheme: null, prefersReducedMotion: null, touchCapable: false, deviceMemory: 8,
};
const W = 192;
const H = 108;

let gpu: Gpu | null = null;
let available = true;
try {
  gpu = await init({ requiredLimits: { maxStorageBuffersInVertexStage: 1 } });
} catch (err) {
  available = false;
  console.warn('[director.headless] no Node WebGPU adapter, skipping:', (err as Error).message);
}
afterAll(() => gpu?.dispose());

describe.skipIf(!available)('director on a real device', () => {
  it('cuts, crossfades and changes recipes through live events with zero GPU errors', async () => {
    const g = gpu!;
    const output = target(g, { size: [W, H], label: 'director-output' });
    const targets = createTargets(g, [W, H]);
    const seed = 'director-headless';
    const camera = createCamera(seed, { distance: 4.2 });
    camera.setViewport(W, H);
    const bus = createEventBus<AudioEvent>();
    const health = createHealthGate(g);
    const director = createDirector({
      gpu: g, seed, tier: 'medium', dpr: 1, bus, scene: targets.scene, camera,
      initialRecipe: { id: 'headless', environment: 'gridvoid', subject: 'polytope', particles: 'attractor', cameraDistance: 4.2 },
      onError: (err) => { throw err; },
    });
    const post = createPostStack(g, targets, { bloom: true, warp: true, preset: PRESETS.acid });
    expect(await health.compileAll([() => director.start(), () => post.compile(output)])).toBe(true);
    const encode = createFrameEncoder({
      gpu: g, output, targets, camera, director, post, health,
      seed, signals, geo: { country: null, region: null }, tier: 'medium',
    });

    let t = 0;
    const run = (frames: number) => {
      for (let i = 0; i < frames; i++, t += 16) frame(g, (f) => encode(f, t));
    };
    const settle = async () => {
      await g.settled();
      await new Promise((r) => setTimeout(r, 0));
    };

    run(10);
    await settle();                       // standby subject compiled
    const first = director.state.layers.find((l) => l.slot === 'subject')!.layer;

    bus.emit({ kind: 'bar', t: 1, index: 1 });
    bus.emit({ kind: 'build-start', t: 1, strength: 1 });
    run(20);
    bus.emit({ kind: 'drop:anticipate', t: 2, strength: 1, secondsUntil: 2 });
    run(20);
    bus.emit({ kind: 'drop', t: 4, strength: 1 });
    run(900);                             // through the 8 s melt and the 6 s crossfade
    await settle();
    const second = director.state.layers.find((l) => l.slot === 'subject')!.layer;
    expect(second).not.toBe(first);

    bus.emit({ kind: 'section', t: 8, label: 'verse', index: 2 });
    run(1100);                            // slow transition and 8 s crossfade fully elapse
    await settle();

    bus.emit({ kind: 'breakdown', t: 12, strength: 1 });
    run(60);
    bus.emit({ kind: 'trackStart', trackPath: '/audio/first.mp3' });
    run(5);
    bus.emit({ kind: 'trackStart', trackPath: '/audio/next.mp3' });
    await settle();                       // new recipe compiled
    run(360);                             // melt + swap
    await settle();
    expect(director.state.recipeId).not.toBe('headless');

    expect(await health.settle()).toBe(true);
    expect(health.errors).toEqual([]);

    const px = await output.color.read({ mipLevel: 0, region: 'all' });
    let lit = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 30) lit++;
    expect(lit / (W * H)).toBeGreaterThan(0.01);

    director.dispose();
    post.dispose();
    targets.dispose();
    health.dispose();
  }, 90_000);
});
