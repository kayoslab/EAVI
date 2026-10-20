// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { frame, target, type Gpu } from 'vgpu';
import { init } from 'vgpu/node';
import { createTargets } from '../../src/render/targets';
import { createCamera } from '../../src/render/camera';
import { createHealthGate } from '../../src/render/healthGate';
import { createFrameEncoder } from '../../src/render/loop';
import { createStaticDirector } from '../../src/director/director';
import { createPostStack } from '../../src/post/stack';
import { PRESETS } from '../../src/post/presets';
import { RECIPES, instantiateRecipe, selectRecipe, availableRecipes } from '../../src/director/recipe';
import type { BrowserSignals } from '../../src/input/signals';

const signals: BrowserSignals = {
  language: 'en', timezone: 'UTC', screenWidth: 1280, screenHeight: 720, devicePixelRatio: 1,
  hardwareConcurrency: 8, prefersColorScheme: null, prefersReducedMotion: null, touchCapable: false, deviceMemory: 8,
};
const W = 256;
const H = 144;

let gpu: Gpu | null = null;
let available = true;
try {
  gpu = await init({ requiredLimits: { maxStorageBuffersInVertexStage: 1 } });
} catch (err) {
  available = false;
  console.warn('[recipes.headless] no Node WebGPU adapter, skipping:', (err as Error).message);
}
afterAll(() => gpu?.dispose());

describe('recipe catalogue', () => {
  it('selects deterministically and respects tier gates', () => {
    expect(selectRecipe('a', 'high').id).toBe(selectRecipe('a', 'high').id);
    for (const r of availableRecipes('low')) expect(r.minTier ?? 'low').toBe('low');
    expect(availableRecipes('high').length).toBe(RECIPES.length);
  });
});

describe.skipIf(!available)('every recipe renders headless with zero GPU errors', () => {
  for (const recipe of RECIPES) {
    it(`recipe ${recipe.id}`, async () => {
      const g = gpu!;
      const output = target(g, { size: [W, H], label: `recipe-${recipe.id}` });
      const targets = createTargets(g, [W, H]);
      const seed = `recipe-${recipe.id}`;
      const camera = createCamera(seed, { distance: recipe.cameraDistance, pitch: recipe.cameraPitch ?? 0.2 });
      camera.setViewport(W, H);
      const layers = instantiateRecipe(g, recipe, { seed, tier: 'medium', dpr: 1 });
      const post = createPostStack(g, targets, { bloom: true, warp: true, preset: PRESETS.phosphor });
      const health = createHealthGate(g);
      expect(await health.compileAll([...layers.map((l) => () => l.compile(targets.scene)), () => post.compile(output)])).toBe(true);
      const encode = createFrameEncoder({
        gpu: g, output, targets, camera, director: createStaticDirector(layers, recipe.id), post, health,
        seed, signals, geo: { country: null, region: null }, tier: 'medium',
      });
      for (const t of [0, 16, 33, 3400, 3416, 3433, 3450]) frame(g, (f) => encode(f, t));
      await g.settled();
      expect(await health.settle()).toBe(true);
      const px = await output.color.read({ mipLevel: 0, region: 'all' });
      let lit = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] + px[i + 1] + px[i + 2] > 30) lit++;
      const fraction = lit / (W * H);
      console.info(`[recipes.headless] ${recipe.id}: lit ${(fraction * 100).toFixed(1)}%`);
      expect(fraction).toBeGreaterThan(0.01);
      expect(fraction).toBeLessThan(0.98);
      const outDir = resolve(__dirname, '../../.artifacts');
      mkdirSync(outDir, { recursive: true });
      const png = new PNG({ width: W, height: H });
      png.data.set(px);
      writeFileSync(resolve(outDir, `recipe-${recipe.id}.png`), PNG.sync.write(png));
      for (const l of layers) l.dispose();
      post.dispose();
      targets.dispose();
      health.dispose();
    }, 60_000);
  }
});
