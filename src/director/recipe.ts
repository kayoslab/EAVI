import type { Gpu } from 'vgpu';
import type { Layer } from '../layers/Layer';
import type { QualityTier } from '../visual/quality';
import { createPRNG } from '../visual/prng';
import type { PresetName } from '../post/presets';
import { createGridVoidLayer } from '../layers/environment/gridVoid';
import { createHyperTunnelLayer } from '../layers/environment/hyperTunnel';
import { createStarWarpLayer } from '../layers/environment/starWarp';
import { createTerrainLayer } from '../layers/environment/terrain';
import { createMengerLayer } from '../layers/subject/menger';
import { createWirePolyhedraLayer } from '../layers/subject/wirePolyhedra';
import { createAttractorLayer } from '../layers/particles/attractor';
import { createPolytope4DLayer } from '../layers/subject/polytope4d';
import { createVectorScopeLayer } from '../layers/subject/vectorScope';
import { createFractalFlameLayer } from '../layers/texture/fractalFlame';
import { createHarmonographLayer } from '../layers/subject/harmonograph';
import { createFractalTreeLayer } from '../layers/subject/fractalTree';
import { createCurlFieldLayer } from '../layers/particles/curlField';

export type LayerKind = 'gridvoid' | 'tunnel' | 'starwarp' | 'terrain' | 'terrain-dramatic' | 'menger' | 'wire' | 'attractor' | 'polytope' | 'scope' | 'flame' | 'harmonograph' | 'tree' | 'curl';

export interface Recipe {
  readonly id: string;
  readonly environment: LayerKind | null;
  readonly subject: LayerKind | null;
  readonly particles: LayerKind | null;
  readonly cameraDistance: number;
  /** Camera elevation in radians (default 0.2); landscapes are seen from higher up. */
  readonly cameraPitch?: number;
  readonly weight?: number;
  readonly minTier?: QualityTier;
  /** Post preset this recipe is designed for; omitted → seeded per session. */
  readonly post?: PresetName;
  /** Camera behaviour; omitted → seeded. */
  readonly rig?: 'orbit' | 'wander';
}

/** Phase 4 will grow this into the full catalogue with post presets, camera rigs and grammar. */
export const RECIPES: readonly Recipe[] = [
  { id: 'sponge-storm', environment: null, subject: 'menger', particles: 'attractor', cameraDistance: 4.4, weight: 2, post: 'vhs' },
  { id: 'grid-cathedral', environment: 'gridvoid', subject: 'wire', particles: null, cameraDistance: 4.0, weight: 2, post: 'phosphor', rig: 'wander' },
  { id: 'grid-sponge', environment: 'gridvoid', subject: 'menger', particles: null, cameraDistance: 4.6, post: 'amber' },
  { id: 'wire-storm', environment: null, subject: 'wire', particles: 'attractor', cameraDistance: 4.2, minTier: 'medium', post: 'crt' },
  { id: 'full-stack', environment: 'gridvoid', subject: 'wire', particles: 'attractor', cameraDistance: 4.4, minTier: 'high', post: 'vhs', rig: 'wander' },
  { id: 'hypercube', environment: 'gridvoid', subject: 'polytope', particles: null, cameraDistance: 4.2, weight: 2, post: 'acid' },
  { id: 'polytope-storm', environment: null, subject: 'polytope', particles: 'attractor', cameraDistance: 4.4, minTier: 'medium', post: 'crt' },
  { id: 'scope-grid', environment: 'gridvoid', subject: 'scope', particles: null, cameraDistance: 4.0, post: 'phosphor' },
  { id: 'scope-sponge', environment: null, subject: 'menger', particles: 'scope', cameraDistance: 4.6, minTier: 'medium', post: 'amber' },
  { id: 'tunnel-cube', environment: 'tunnel', subject: 'polytope', particles: null, cameraDistance: 4.2, weight: 2, minTier: 'medium', post: 'crt', rig: 'orbit' },
  { id: 'tunnel-wire', environment: 'tunnel', subject: 'wire', particles: 'attractor', cameraDistance: 4.2, minTier: 'high', post: 'vhs' },
  { id: 'tunnel-scope', environment: 'tunnel', subject: 'scope', particles: null, cameraDistance: 4.0, minTier: 'medium', post: 'phosphor' },
  { id: 'acid-flame', environment: 'tunnel', subject: 'flame', particles: null, cameraDistance: 4.4, weight: 2, minTier: 'medium', post: 'acid' },
  { id: 'flame-cube', environment: null, subject: 'polytope', particles: 'flame', cameraDistance: 4.4, minTier: 'medium', post: 'acid', rig: 'wander' },
  { id: 'flame-grid', environment: 'gridvoid', subject: 'flame', particles: 'attractor', cameraDistance: 4.2, minTier: 'high', post: 'clean' },
  { id: 'warp-cube', environment: 'starwarp', subject: 'polytope', particles: null, cameraDistance: 4.2, weight: 2, post: 'phosphor' },
  { id: 'warp-wire', environment: 'starwarp', subject: 'wire', particles: null, cameraDistance: 4.0, post: 'crt' },
  { id: 'warp-sponge', environment: 'starwarp', subject: 'menger', particles: 'scope', cameraDistance: 4.6, minTier: 'medium', post: 'vhs' },
  { id: 'harmonic-grid', environment: 'gridvoid', subject: 'harmonograph', particles: null, cameraDistance: 4.0, post: 'phosphor', rig: 'wander' },
  { id: 'harmonic-tunnel', environment: 'tunnel', subject: 'harmonograph', particles: 'curl', cameraDistance: 4.2, minTier: 'medium', post: 'acid' },
  { id: 'wire-forest', environment: 'gridvoid', subject: 'tree', particles: 'curl', cameraDistance: 4.4, minTier: 'medium', post: 'amber' },
  { id: 'forest-warp', environment: 'starwarp', subject: 'tree', particles: null, cameraDistance: 4.2, post: 'crt' },
  { id: 'curl-cube', environment: null, subject: 'polytope', particles: 'curl', cameraDistance: 4.2, post: 'vhs', rig: 'wander' },
  // Warm valleys: the landscape carries the frame on its own, on presets that keep its colours.
  { id: 'warm-valleys', environment: 'terrain-dramatic', subject: null, particles: null, cameraDistance: 5.2, cameraPitch: 0.5, weight: 3, post: 'clean', rig: 'orbit' },
  { id: 'valley-drift', environment: 'terrain', subject: null, particles: 'curl', cameraDistance: 4.8, cameraPitch: 0.45, weight: 2, post: 'vhs', rig: 'wander' },
  { id: 'valley-cube', environment: 'terrain-dramatic', subject: 'polytope', particles: null, cameraDistance: 5.0, cameraPitch: 0.4, post: 'clean', rig: 'wander' },
  { id: 'valley-scope', environment: 'terrain', subject: 'scope', particles: null, cameraDistance: 4.6, cameraPitch: 0.4, minTier: 'medium', post: 'vhs' },
];

const TIER_RANK: Record<QualityTier, number> = { low: 0, medium: 1, high: 2 };

export function availableRecipes(tier: QualityTier): Recipe[] {
  return RECIPES.filter((r) => TIER_RANK[tier] >= TIER_RANK[r.minTier ?? 'low']);
}

export function selectRecipe(seed: string, tier: QualityTier): Recipe {
  const pool = availableRecipes(tier);
  const rng = createPRNG(seed + ':recipe');
  const total = pool.reduce((n, r) => n + (r.weight ?? 1), 0);
  let pick = rng() * total;
  for (const r of pool) {
    pick -= r.weight ?? 1;
    if (pick < 0) return r;
  }
  return pool[pool.length - 1];
}

export interface RecipeContext {
  readonly seed: string;
  readonly tier: QualityTier;
  readonly dpr: number;
}

export function createLayer(gpu: Gpu, kind: LayerKind, ctx: RecipeContext): Layer {
  const { seed, tier } = ctx;
  switch (kind) {
    case 'gridvoid':
      return createGridVoidLayer(gpu, { seed, halfLines: tier === 'high' ? 28 : tier === 'medium' ? 20 : 12 });
    case 'terrain':
      return createTerrainLayer(gpu, { seed, tier, variant: 'gentle', dpr: ctx.dpr });
    case 'terrain-dramatic':
      return createTerrainLayer(gpu, { seed, tier, variant: 'dramatic', dpr: ctx.dpr });
    case 'starwarp':
      return createStarWarpLayer(gpu, { seed, count: tier === 'high' ? 120_000 : tier === 'medium' ? 60_000 : 20_000, thickness: 1.1 * Math.max(1, Math.min(2, ctx.dpr)) });
    case 'tunnel':
      return createHyperTunnelLayer(gpu, { seed });
    case 'menger':
      return createMengerLayer(gpu, { seed, iterations: tier === 'high' ? 4 : 3, scale: 1.1 });
    case 'wire':
      return createWirePolyhedraLayer(gpu, { seed, tier, thickness: 1.3 * Math.max(1, Math.min(2, ctx.dpr)) });
    case 'polytope':
      return createPolytope4DLayer(gpu, { seed, tier, thickness: 1.4 * Math.max(1, Math.min(2, ctx.dpr)) });
    case 'flame':
      return createFractalFlameLayer(gpu, {
        seed,
        width: tier === 'high' ? 640 : 448, height: tier === 'high' ? 360 : 252,
        points: tier === 'high' ? 98_304 : 49_152, steps: tier === 'high' ? 12 : 8,
      });
    case 'scope':
      return createVectorScopeLayer(gpu, { seed, samples: tier === 'low' ? 512 : 1024, thickness: 1.5 * Math.max(1, Math.min(2, ctx.dpr)) });
    case 'harmonograph':
      return createHarmonographLayer(gpu, { seed, segments: tier === 'low' ? 2048 : 4096, thickness: 1.5 * Math.max(1, Math.min(2, ctx.dpr)) });
    case 'tree':
      return createFractalTreeLayer(gpu, { seed, tier, thickness: 1.0 * Math.max(1, Math.min(2, ctx.dpr)) });
    case 'curl':
      return createCurlFieldLayer(gpu, { seed, count: tier === 'high' ? 200_000 : tier === 'medium' ? 80_000 : 30_000, pointSize: 1.3 * Math.max(1, Math.min(2, ctx.dpr)) });
    case 'attractor': {
      const count = tier === 'high' ? 400_000 : tier === 'medium' ? 150_000 : 50_000;
      return createAttractorLayer(gpu, { seed, count, pointSize: 1.3 * Math.max(1, Math.min(2, ctx.dpr)) });
    }
  }
}

/** Instantiate a recipe's layers in draw order: environment, subject, particles. */
export function instantiateRecipe(gpu: Gpu, recipe: Recipe, ctx: RecipeContext): Layer[] {
  const kinds = [recipe.environment, recipe.subject, recipe.particles].filter((k): k is LayerKind => k !== null);
  return kinds.map((kind) => createLayer(gpu, kind, ctx));
}
