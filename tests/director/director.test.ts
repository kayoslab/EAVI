// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { createDirector } from '../../src/director/director';
import type { Layer } from '../../src/layers/Layer';
import type { Recipe, LayerKind } from '../../src/director/recipe';
import { createEventBus, type AudioEvent } from '../../src/audio/structure/eventBus';

function fakeLayer(name: string): Layer & { disposed: boolean } {
  const l = {
    name, pointCount: 1, disposed: false,
    compile: vi.fn(async () => {}),
    update: vi.fn(),
    encodeDraw: vi.fn(),
    resize: vi.fn(),
    dispose() { l.disposed = true; },
  };
  return l;
}

const recipe: Recipe = { id: 'test', environment: 'starwarp', subject: 'polytope', particles: 'attractor', cameraDistance: 4 };

function setup() {
  const bus = createEventBus<AudioEvent>();
  const created: Array<{ kind: LayerKind; layer: ReturnType<typeof fakeLayer> }> = [];
  const camera = { turn: vi.fn(), impulseDistance: vi.fn() };
  const director = createDirector({
    gpu: {} as never, seed: 'seed', tier: 'high', dpr: 1, bus, scene: {} as never, camera, initialRecipe: recipe,
    layerFactory: (_gpu, kind, ctx) => {
      const layer = fakeLayer(`${kind}:${ctx.seed}`);
      created.push({ kind, layer });
      return layer;
    },
  });
  return { bus, created, camera, director };
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe('director', () => {
  it('starts with the recipe layers in draw order and prepares a standby subject', async () => {
    const { director, created } = setup();
    await director.start();
    await flush();
    const state = director.update(0, 0.016);
    expect(state.layers.map((l) => l.slot)).toEqual(['environment', 'subject', 'particles']);
    expect(state.layers.every((l) => l.opacity === 1)).toBe(true);
    // 3 recipe layers + 1 standby subject
    expect(created.length).toBe(4);
  });

  it('drop melts to the standby subject and glides the kaleidoscope', async () => {
    const { director, bus, created } = setup();
    await director.start();
    await flush();
    director.update(1, 0.016);
    const before = director.state.layers.find((l) => l.slot === 'subject')!.layer;
    bus.emit({ kind: 'drop', t: 10, strength: 1 });
    let state = director.update(1.016, 0.016);
    // melt/fold take 4.5–5 s; the swap happens part-way and the old subject fades out over 3 s.
    for (let t = 1.03; t < 18; t += 0.016) state = director.update(t, 0.016);
    const subjects = state.layers.filter((l) => l.slot === 'subject');
    expect(subjects.length).toBe(1);
    expect(subjects[0].layer).not.toBe(before);
    expect((before as { disposed: boolean }).disposed).toBe(true);
    expect(state.postOffsets.kaleidoAngle).toBeGreaterThan(0);
    // a new standby was prepared after the swap
    await flush();
    expect(created.length).toBe(5);
  });

  it('build ramps up after build-start and resets on drop', async () => {
    const { director, bus } = setup();
    await director.start();
    bus.emit({ kind: 'build-start', t: 0, strength: 1 });
    let state = director.update(0, 0.016);
    for (let t = 0.016; t < 6; t += 0.1) state = director.update(t, 0.1);
    expect(state.build).toBeGreaterThan(0.3);
    expect(state.motionMul).toBeGreaterThan(1);
    bus.emit({ kind: 'drop', t: 6, strength: 1 });
    const atDrop = director.update(6.1, 0.1).build;
    for (let t = 6.2; t < 12; t += 0.1) state = director.update(t, 0.1);
    expect(state.build).toBeLessThan(atDrop);
    expect(state.build).toBe(0);
  });

  it('breakdown desaturates and fades particles out; anticipation dims particles and slows motion', async () => {
    const { director, bus } = setup();
    await director.start();
    bus.emit({ kind: 'breakdown', t: 0, strength: 1 });
    let state = director.update(0, 0.1);
    for (let t = 0.1; t < 8; t += 0.1) state = director.update(t, 0.1);
    expect(state.saturationMul).toBeLessThan(0.5);
    expect(state.layers.find((l) => l.slot === 'particles')!.opacity).toBe(0);
    bus.emit({ kind: 'section', t: 8, label: 'verse', index: 3 });
    bus.emit({ kind: 'drop:anticipate', t: 8, strength: 1, secondsUntil: 6 });
    for (let t = 8.1; t < 13; t += 0.1) state = director.update(t, 0.1);
    expect(state.motionMul).toBeLessThan(0.7);
    expect(state.layers.find((l) => l.slot === 'particles')!.opacity).toBeLessThanOrEqual(0.25);
  });

  it('bars glide the kaleidoscope and ease the camera on wander rigs; nothing jumps', async () => {
    const { director, bus, camera } = setup();
    await director.start();
    let prev = director.update(0, 0.016).postOffsets.kaleidoAngle ?? 0;
    let maxStep = 0;
    for (let i = 0; i < 8; i++) {
      bus.emit({ kind: 'bar', t: i, index: i });
      for (let k = 0; k < 60; k++) {
        const a = director.update(i + k * 0.016, 0.016).postOffsets.kaleidoAngle ?? 0;
        maxStep = Math.max(maxStep, Math.abs(a - prev));
        prev = a;
      }
    }
    expect(prev).toBeGreaterThan(0);
    expect(maxStep).toBeLessThan(0.05); // per-frame change stays small: a glide, not a jump
    const state = director.update(9, 0.016);
    if (state.cameraRig === 'wander') {
      expect(camera.turn).toHaveBeenCalled();
      for (const call of camera.turn.mock.calls) expect(call[1]).toBeGreaterThanOrEqual(4); // seconds
    } else {
      expect(camera.turn).not.toHaveBeenCalled();
    }
  });

  it('a new track prepares a new recipe and melts into it once compiled', async () => {
    const { director, bus, created } = setup();
    await director.start();
    await flush();
    bus.emit({ kind: 'trackStart', trackPath: '/audio/first.mp3' });
    await flush();
    const n = created.length;
    bus.emit({ kind: 'trackStart', trackPath: '/audio/next.mp3' });
    await flush();
    expect(created.length).toBeGreaterThan(n);
    let state = director.update(0, 0.016);
    for (let t = 0.016; t < 1; t += 0.016) state = director.update(t, 0.016);
    expect(state.postTransient).not.toBeNull();
    expect(state.postTransient!.feedbackDamp).toBeGreaterThan(0);
    for (let t = 1; t < 6; t += 0.016) state = director.update(t, 0.016);
    expect(state.recipeId).not.toBe('test');
  });

  it('a recipe change cross-dissolves: old and new layers overlap, nothing swaps in one frame', async () => {
    const { director, bus, created } = setup();
    await director.start();
    await flush();
    bus.emit({ kind: 'trackStart', trackPath: '/audio/first.mp3' });
    await flush();
    const oldLayers = director.update(0, 0.016).layers.map((l) => l.layer);
    bus.emit({ kind: 'trackStart', trackPath: '/audio/next.mp3' });
    await flush();
    let state = director.update(0.016, 0.016);
    let overlapSeen = false;
    let maxOpacityStep = 0;
    const lastOpacity = new Map<unknown, number>();
    for (let t = 0.032; t < 24; t += 0.016) {
      state = director.update(t, 0.016);
      const hasOld = state.layers.some((l) => oldLayers.includes(l.layer));
      const hasNew = state.layers.some((l) => !oldLayers.includes(l.layer));
      if (hasOld && hasNew) overlapSeen = true;
      for (const l of state.layers) {
        const prev = lastOpacity.get(l.layer);
        if (prev !== undefined) maxOpacityStep = Math.max(maxOpacityStep, Math.abs(l.opacity - prev));
        lastOpacity.set(l.layer, l.opacity);
      }
    }
    expect(overlapSeen).toBe(true);
    expect(maxOpacityStep).toBeLessThan(0.01);
    expect(state.layers.some((l) => oldLayers.includes(l.layer))).toBe(false);
    expect(state.layers.every((l) => l.opacity === 1)).toBe(true);
    expect(created.length).toBeGreaterThan(4);
  });

  it('never emits a brightness-changing transient', async () => {
    const { director, bus } = setup();
    await director.start();
    await flush();
    for (const kind of ['drop', 'section', 'section', 'drop'] as const) {
      if (kind === 'drop') bus.emit({ kind: 'drop', t: 0, strength: 1 });
      else bus.emit({ kind: 'section', t: 0, label: 'verse', index: 2 });
      for (let t = 0; t < 6; t += 0.016) {
        const s = director.update(t, 0.016);
        if (s.postTransient) {
          expect(s.postTransient).not.toHaveProperty('exposure');
          expect(s.postTransient).not.toHaveProperty('limiterSlewUp');
          expect(s.postTransient).not.toHaveProperty('pixelSize');
          expect(s.postTransient).not.toHaveProperty('rgbShift');
        }
      }
    }
  });
});
