import type { Gpu, Target } from 'vgpu';
import type { Layer } from '../layers/Layer';
import type { QualityTier } from '../visual/quality';
import type { PostParams } from '../post/params';
import type { AudioEvent, EventBus } from '../audio/structure/eventBus';
import { createPRNG } from '../visual/prng';
import { createLayer, selectRecipe, type LayerKind, type Recipe, type RecipeContext } from './recipe';
import { PRESETS, type PostPreset } from '../post/presets';

export interface ActiveLayer {
  readonly layer: Layer;
  readonly kind: LayerKind;
  readonly slot: 'environment' | 'subject' | 'particles';
  /** 0..1 multiplier applied on top of the global opacity. */
  readonly opacity: number;
}

export interface DirectorState {
  readonly layers: readonly ActiveLayer[];
  readonly recipeId: string;
  readonly saturationMul: number;
  readonly motionMul: number;
  readonly build: number;
  readonly drop: number;
  /** Timeline-driven beat pulse 0..1 (the loop merges it with the live flux pulse). */
  readonly beatPulse: number;
  readonly postOffsets: Partial<PostParams>;
  readonly postTransient: Partial<PostParams> | null;
  readonly cameraRig: CameraRig;
}

export type CameraRig = 'orbit' | 'wander';
/** All transitions are slow and luminance-neutral: the scene melts, folds or drifts into the next. */
export type TransitionKind = 'melt' | 'fold' | 'drift';

export interface DirectorCamera {
  turn(yawDelta: number, seconds: number, pitchDelta?: number): void;
  setPitch?(pitch: number): void;
  impulseDistance(multiplier: number, seconds: number): void;
}

export interface DirectorOptions {
  readonly gpu: Gpu;
  readonly seed: string;
  readonly tier: QualityTier;
  readonly dpr: number;
  readonly bus: EventBus<AudioEvent>;
  readonly scene: Target;
  readonly camera: DirectorCamera;
  readonly initialRecipe?: Recipe;
  /** Post stack hook so a recipe can bring its own preset. */
  readonly post?: { setPreset(preset: PostPreset, blendSec?: number): void };
  /** Injectable for tests. */
  readonly layerFactory?: (gpu: Gpu, kind: LayerKind, ctx: RecipeContext) => Layer | Layer[];
  readonly onError?: (err: unknown) => void;
}

export interface Director {
  readonly state: DirectorState;
  readonly recipe: Recipe;
  /** Instantiate and compile the initial recipe. */
  start(): Promise<void>;
  update(timeSec: number, deltaSec: number): DirectorState;
  dispose(): void;
}

interface Slot {
  kind: LayerKind;
  slot: ActiveLayer['slot'];
  layer: Layer;
  opacity: number;
  target: number;
  /** Fade rate per second. */
  rate: number;
  retireWhenDark: boolean;
}

interface Standby {
  slot: ActiveLayer['slot'];
  kind: LayerKind;
  layers: Layer[];
  ready: boolean;
}

interface Transition {
  kind: TransitionKind;
  start: number;
  duration: number;
  swapped: boolean;
  swap: () => void;
}

const TAU = Math.PI * 2;
/** Seconds a recipe change takes to cross-dissolve layers and blend the post preset. */
const RECIPE_FADE_SEC = 14;
/** Minimum seconds between section-driven subject changes. */
const SECTION_COOLDOWN_SEC = 50;

/**
 * The Director owns the active recipe, reacts to structural audio events, and emits a
 * per-frame state the loop applies. Every reaction is luminance-neutral: cuts, geometry,
 * camera, folds, feedback, colour — never brightness.
 */
export function createDirector(options: DirectorOptions): Director {
  const { gpu, bus, scene, camera } = options;
  const factory = options.layerFactory ?? createLayer;
  const rng = createPRNG(options.seed + ':director');
  let variant = 0;
  let recipe: Recipe = options.initialRecipe ?? selectRecipe(options.seed, options.tier);
  let slots: Slot[] = [];
  let standby: Standby | null = null;
  let pendingRecipe: { recipe: Recipe; layers: Slot[]; ready: boolean } | null = null;
  let transition: Transition | null = null;
  let now = 0;
  let cameraRig: CameraRig = recipe.rig ?? (rng() < 0.5 ? 'wander' : 'orbit');

  // Envelopes and modes.
  let build = 0;
  let building = false;
  let drop = 0;
  let beatPulse = 0;
  let breakdown = false;
  let anticipating = 0; // seconds remaining
  let saturationMul = 1;
  let motionMul = 1;
  let kaleidoOffset = 0;
  let kaleidoTarget = 0;
  let barCount = 0;
  let lastSubjectChange = -1e9;

  const ctx = (seedSuffix: string): RecipeContext => ({
    seed: `${options.seed}:${seedSuffix}`, tier: options.tier, dpr: options.dpr,
  });

  function makeSlots(kind: LayerKind, slot: ActiveLayer['slot'], seedSuffix: string, opacity: number): Slot[] {
    const made = factory(gpu, kind, ctx(seedSuffix));
    const layers = Array.isArray(made) ? made : [made];
    return layers.map((layer) => ({ kind, slot, layer, opacity, target: 1, rate: 1, retireWhenDark: false }));
  }

  function recipeSlots(r: Recipe, seedSuffix: string, opacity: number): Slot[] {
    const out: Slot[] = [];
    if (r.environment) out.push(...makeSlots(r.environment, 'environment', `${seedSuffix}:env`, opacity));
    if (r.subject) out.push(...makeSlots(r.subject, 'subject', `${seedSuffix}:subj`, opacity));
    if (r.particles) out.push(...makeSlots(r.particles, 'particles', `${seedSuffix}:part`, opacity));
    return out;
  }

  async function compileSlots(list: Slot[]): Promise<boolean> {
    try {
      await Promise.all(list.map((s) => s.layer.compile(scene)));
      return true;
    } catch (err) {
      options.onError?.(err);
      for (const s of list) s.layer.dispose();
      return false;
    }
  }

  /** Prepare a fresh subject variant in the background so cuts are instant. */
  function prepareStandby(): void {
    if (standby || !recipe.subject) return;
    variant++;
    const kind = recipe.subject;
    const made = factory(gpu, kind, ctx(`v${variant}:subj`));
    const layers = Array.isArray(made) ? made : [made];
    const entry: Standby = { slot: 'subject', kind, layers, ready: false };
    standby = entry;
    Promise.all(layers.map((l) => l.compile(scene))).then(() => {
      entry.ready = true;
    }).catch((err) => {
      options.onError?.(err);
      for (const l of layers) l.dispose();
      if (standby === entry) standby = null;
    });
  }

  function swapSubject(crossfadeSec: number): void {
    if (!standby || !standby.ready) return;
    const fade = Math.max(5, crossfadeSec);
    const incoming: Slot[] = standby.layers.map((layer) => ({
      kind: standby!.kind, slot: 'subject', layer,
      opacity: 0, target: 1, rate: 1 / fade, retireWhenDark: false,
    }));
    standby = null;
    for (const s of slots) {
      if (s.slot === 'subject') {
        s.target = 0;
        s.rate = 1 / fade;
        s.retireWhenDark = true;
      }
    }
    // Keep draw order: environment, subject(s), particles.
    const idx = slots.findIndex((s) => s.slot === 'particles');
    if (idx < 0) slots.push(...incoming);
    else slots.splice(idx, 0, ...incoming);
    prepareStandby();
  }

  function startTransition(kind: TransitionKind, swap: () => void): void {
    if (transition) return; // one slow change at a time
    const durations: Record<TransitionKind, number> = { melt: 8, fold: 9, drift: 8 };
    if (kind === 'drift') camera.impulseDistance(0.9, 10);
    transition = { kind, start: now, duration: durations[kind], swapped: false, swap };
  }

  function pickTransition(pool: TransitionKind[]): TransitionKind {
    return pool[Math.floor(rng() * pool.length) % pool.length];
  }

  function changeRecipe(next: Recipe, seedSuffix: string): void {
    if (pendingRecipe) return;
    const layers = recipeSlots(next, seedSuffix, 1);
    const entry = { recipe: next, layers, ready: false };
    pendingRecipe = entry;
    compileSlots(layers).then((ok) => {
      if (pendingRecipe !== entry) return;
      if (!ok) {
        pendingRecipe = null;
        return;
      }
      entry.ready = true;
      // A recipe change is a long cross-dissolve: old layers fade out while the new ones fade in,
      // and the post preset glides over the same window. Nothing is swapped in one frame.
      startTransition('drift', () => {
        if (standby) {
          for (const l of standby.layers) l.dispose();
          standby = null;
        }
        for (const s of slots) {
          s.target = 0;
          s.rate = 1 / RECIPE_FADE_SEC;
          s.retireWhenDark = true;
        }
        for (const s of entry.layers) {
          s.opacity = 0;
          s.target = 1;
          s.rate = 1 / RECIPE_FADE_SEC;
        }
        slots = [...slots, ...entry.layers];
        recipe = entry.recipe;
        pendingRecipe = null;
        cameraRig = recipe.rig ?? (rng() < 0.5 ? 'wander' : 'orbit');
        if (recipe.post) options.post?.setPreset(PRESETS[recipe.post], RECIPE_FADE_SEC);
        camera.setPitch?.(recipe.cameraPitch ?? 0.2);
        prepareStandby();
      });
    });
  }

  // --- Event grammar -------------------------------------------------------
  const unsubscribe: (() => void)[] = [];
  unsubscribe.push(bus.on('beat', () => {
    beatPulse = 1;
  }));
  unsubscribe.push(bus.on('bar', () => {
    barCount++;
    // One kaleidoscope segment per bar, reached smoothly before the next bar.
    kaleidoTarget += TAU / 6;
    if (cameraRig === 'wander' && barCount % 4 === 0) {
      camera.turn((rng() < 0.5 ? -1 : 1) * (0.3 + rng() * 0.7), 8, (rng() - 0.5) * 0.25);
    }
  }));
  unsubscribe.push(bus.on('build-start', () => {
    building = true;
    breakdown = false;
  }));
  unsubscribe.push(bus.on('drop:anticipate', (e) => {
    anticipating = Math.max(0.5, e.secondsUntil);
  }));
  unsubscribe.push(bus.on('drop', (e) => {
    drop = Math.max(drop, 0.6 + e.strength * 0.4);
    building = false;
    breakdown = false;
    anticipating = 0;
    kaleidoTarget += TAU / 3;
    // A drop is the biggest change, so it gets the slowest, deepest melt — but only when a new
    // subject is ready to come in; a transition with nothing to reveal just looks like a wobble.
    if (!standby?.ready) return;
    const kind = pickTransition(['melt', 'fold', 'melt']);
    startTransition(kind, () => swapSubject(6));
    lastSubjectChange = now;
  }));
  unsubscribe.push(bus.on('breakdown', () => {
    breakdown = true;
    building = false;
  }));
  unsubscribe.push(bus.on('section', (e) => {
    if (e.label === 'drop' || e.label === 'breakdown') return; // handled by their events
    if (e.index === 0) return;
    breakdown = false;
    // Sections come every 15–30 s; a change at every one keeps the scene in permanent flux.
    if (!standby?.ready || now - lastSubjectChange < SECTION_COOLDOWN_SEC) return;
    const kind = pickTransition(['drift', 'fold', 'melt']);
    startTransition(kind, () => swapSubject(8));
    lastSubjectChange = now;
  }));
  let tracksSeen = 0;
  unsubscribe.push(bus.on('trackStart', (e) => {
    tracksSeen++;
    // The first track plays on the session's initial recipe; later tracks bring a new one.
    if (tracksSeen === 1 || slots.length === 0) return;
    const next = selectRecipe(`${options.seed}:${e.trackPath}`, options.tier);
    changeRecipe(next, `track:${e.trackPath}`);
  }));

  let state: DirectorState = {
    layers: [], recipeId: recipe.id, saturationMul: 1, motionMul: 1, build: 0, drop: 0, beatPulse: 0,
    postOffsets: {}, postTransient: null, cameraRig,
  };

  return {
    get state() {
      return state;
    },
    get recipe() {
      return recipe;
    },
    async start() {
      slots = recipeSlots(recipe, 'v0', 1);
      const ok = await compileSlots(slots);
      if (!ok) {
        slots = [];
        throw new Error(`[EAVI director] initial recipe '${recipe.id}' failed to compile`);
      }
      prepareStandby();
    },
    update(timeSec, deltaSec) {
      now = timeSec;
      const dt = Math.max(0, Math.min(0.1, deltaSec));

      // Envelopes: slow in, slow out.
      if (building) build = Math.min(1, build + dt / 12);
      else build = Math.max(0, build - dt / 4);
      drop = drop * Math.exp(-dt / 2.5);
      if (drop < 0.005) drop = 0;
      beatPulse *= Math.exp(-dt / 0.12);
      if (beatPulse < 0.01) beatPulse = 0;
      if (anticipating > 0) anticipating = Math.max(0, anticipating - dt);
      // Kaleidoscope angle glides toward its target (one segment per bar at most).
      kaleidoOffset += (kaleidoTarget - kaleidoOffset) * Math.min(1, dt * 1.2);

      // Targets per mode, eased over seconds.
      const satTarget = breakdown ? 0.4 : 1;
      const motionTarget = breakdown ? 0.55 : anticipating > 0 ? 0.4 : 1 + build * 0.4;
      saturationMul += (satTarget - saturationMul) * Math.min(1, dt * 0.8);
      motionMul += (motionTarget - motionMul) * Math.min(1, dt * 0.7);
      for (const s of slots) {
        if (s.slot === 'particles' && !s.retireWhenDark) {
          s.target = breakdown ? 0 : anticipating > 0 ? 0.2 : 1;
          s.rate = 0.4;
        }
      }

      // Fades and retirement.
      for (const s of slots) {
        if (s.opacity !== s.target) {
          const step = s.rate * dt;
          s.opacity = s.opacity < s.target ? Math.min(s.target, s.opacity + step) : Math.max(s.target, s.opacity - step);
        }
      }
      const retired = slots.filter((s) => s.retireWhenDark && s.opacity <= 0.001);
      if (retired.length > 0) {
        for (const s of retired) s.layer.dispose();
        slots = slots.filter((s) => !retired.includes(s));
      }

      // Transition transients.
      let postTransient: Partial<PostParams> | null = null;
      if (transition) {
        const t = (now - transition.start) / Math.max(1e-3, transition.duration);
        if (!transition.swapped && t >= 0.35) {
          transition.swap();
          transition.swapped = true;
        }
        if (t >= 1) {
          transition = null;
        } else {
          const u = Math.max(0, Math.min(1, t));
          const bell = Math.sin(u * Math.PI);
          const smooth = bell * bell * (3 - 2 * bell);
          switch (transition.kind) {
            case 'melt':
              // Long trails and a gentle zoom: the old subject dissolves into the new one.
              postTransient = { feedbackDamp: 0.9 + 0.05 * smooth, feedbackZoom: 0.008 * smooth, feedbackRotate: 0.002 * smooth };
              break;
            case 'fold':
              // The kaleidoscope fold glides in and back out as a continuous mix.
              postTransient = { kaleidoMix: smooth };
              break;
            case 'drift':
              postTransient = { feedbackDamp: 0.88 + 0.05 * smooth };
              break;
          }
        }
      }

      state = {
        layers: slots.map((s) => ({ layer: s.layer, kind: s.kind, slot: s.slot, opacity: s.opacity })),
        recipeId: recipe.id,
        saturationMul,
        motionMul,
        build,
        drop,
        beatPulse,
        postOffsets: { kaleidoAngle: kaleidoOffset },
        postTransient,
        cameraRig,
      };
      return state;
    },
    dispose() {
      for (const u of unsubscribe) u();
      for (const s of slots) s.layer.dispose();
      slots = [];
      if (standby) for (const l of standby.layers) l.dispose();
      standby = null;
      if (pendingRecipe) for (const s of pendingRecipe.layers) s.layer.dispose();
      pendingRecipe = null;
    },
  };
}

/** A director that never changes: fixed layers at full opacity. Used by headless tests. */
export function createStaticDirector(layers: readonly Layer[], recipeId = 'static'): Director {
  const state: DirectorState = {
    layers: layers.map((layer, i) => ({ layer, kind: 'menger', slot: i === 0 ? 'subject' : 'particles', opacity: 1 })),
    recipeId, saturationMul: 1, motionMul: 1, build: 0, drop: 0, beatPulse: 0, postOffsets: {}, postTransient: null, cameraRig: 'orbit',
  };
  return {
    state,
    recipe: { id: recipeId, environment: null, subject: null, particles: null, cameraDistance: 4 },
    async start() {},
    update: () => state,
    dispose() {},
  };
}
