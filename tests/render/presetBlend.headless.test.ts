// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest';
import { type Gpu } from 'vgpu';
import { init } from 'vgpu/node';
import { createTargets } from '../../src/render/targets';
import { createPostStack } from '../../src/post/stack';
import { PRESETS } from '../../src/post/presets';
import { ZERO_SOURCES } from '../../src/post/modulators';

let gpu: Gpu | null = null;
let available = true;
try {
  gpu = await init();
} catch (err) {
  available = false;
  console.warn('[presetBlend] no Node WebGPU adapter, skipping:', (err as Error).message);
}
afterAll(() => gpu?.dispose());

describe.skipIf(!available)('post preset blending', () => {
  it('glides parameters from one preset to the next instead of snapping', () => {
    const g = gpu!;
    const targets = createTargets(g, [64, 36]);
    const post = createPostStack(g, targets, { preset: PRESETS.clean });
    const frame = (t: number) => post.applyFrame({ sources: ZERO_SOURCES, timeSec: t, frameIndex: Math.round(t * 60), reducedMotion: false });
    frame(0);
    expect(post.effective.kaleidoSegments).toBe(0);
    post.setPreset(PRESETS.acid, 8);
    frame(0.016);
    expect(post.effective.kaleidoSegments).toBeLessThanOrEqual(1);
    const seen: number[] = [];
    let maxStep = 0;
    let prev = post.effective.feedbackDamp;
    for (let t = 0.1; t <= 8.5; t += 0.1) {
      frame(t);
      seen.push(post.effective.kaleidoSegments);
      maxStep = Math.max(maxStep, Math.abs(post.effective.feedbackDamp - prev));
      prev = post.effective.feedbackDamp;
    }
    expect(post.effective.kaleidoSegments).toBe(PRESETS.acid.params.kaleidoSegments);
    expect(new Set(seen).size).toBeGreaterThan(3); // folded in step by step
    expect(maxStep).toBeLessThan(0.02); // continuous parameters never jump
    expect(post.presetName).toBe('acid');
    post.dispose();
    targets.dispose();
  });
});
