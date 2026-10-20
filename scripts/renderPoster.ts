// Headless poster render: one seeded recipe through the full pipeline via Dawn.
// Usage: node --import ./scripts/registerWgsl.ts scripts/renderPoster.ts [--seed s] [--recipe id] [--preset name] [--out path] [--size WxH]

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { PNG } from 'pngjs';
import { frame, target } from 'vgpu';
import { init } from 'vgpu/node';
import { createTargets } from '../src/render/targets.ts';
import { createCamera } from '../src/render/camera.ts';
import { createHealthGate } from '../src/render/healthGate.ts';
import { createFrameEncoder } from '../src/render/loop.ts';
import { createPostStack } from '../src/post/stack.ts';
import { PRESETS, type PresetName } from '../src/post/presets.ts';
import { RECIPES, selectRecipe, instantiateRecipe } from '../src/director/recipe.ts';
import { createStaticDirector } from '../src/director/director.ts';
import type { BrowserSignals } from '../src/input/signals.ts';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const seed = arg('seed', 'poster');
const recipeId = arg('recipe', '');
const presetName = arg('preset', '') as PresetName | '';
const out = resolve(process.cwd(), arg('out', '.artifacts/poster.png'));
const [W, H] = arg('size', '1536x1024').split('x').map((v) => Math.max(64, Number(v)));

const signals: BrowserSignals = {
  language: 'en', timezone: 'UTC', screenWidth: W, screenHeight: H, devicePixelRatio: 1,
  hardwareConcurrency: 8, prefersColorScheme: null, prefersReducedMotion: null, touchCapable: false, deviceMemory: 8,
};

const gpu = await init({ requiredLimits: { maxStorageBuffersInVertexStage: 1 } });
const recipe = recipeId ? RECIPES.find((r) => r.id === recipeId) ?? selectRecipe(seed, 'high') : selectRecipe(seed, 'high');
const preset = PRESETS[presetName || recipe.post || 'crt'];
const output = target(gpu, { size: [W, H], label: 'poster' });
const targets = createTargets(gpu, [W, H]);
const camera = createCamera(seed, { distance: recipe.cameraDistance, pitch: recipe.cameraPitch ?? 0.2 });
camera.setViewport(W, H);
const layers = instantiateRecipe(gpu, recipe, { seed, tier: 'high', dpr: 1 });
const post = createPostStack(gpu, targets, { bloom: true, warp: true, preset });
const health = createHealthGate(gpu);
if (!(await health.compileAll([...layers.map((l) => () => l.compile(targets.scene)), () => post.compile(output)]))) {
  console.error(health.errors);
  process.exit(1);
}
const encode = createFrameEncoder({
  gpu, output, targets, camera, director: createStaticDirector(layers, recipe.id), post, health,
  seed, signals, geo: { country: null, region: null }, tier: 'high',
});
// Run well past the intro fade so trails and the limiter have settled.
for (let t = 0; t < 9000; t += 16) frame(gpu, (f) => encode(f, t));
await gpu.settled();
const pixels = await output.color.read({ mipLevel: 0, region: 'all' });
const png = new PNG({ width: W, height: H });
png.data.set(pixels);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, PNG.sync.write(png));
console.log(JSON.stringify({ recipe: recipe.id, preset: preset.name, seed, out, errors: health.errors.length }));
for (const l of layers) l.dispose();
post.dispose();
targets.dispose();
gpu.dispose();
