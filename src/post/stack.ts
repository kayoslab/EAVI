import { effect, sampler, type Effect, type Frame, type Gpu, type Surface, type Target } from 'vgpu';
import type { RenderTargets } from '../render/targets';
import { NUMERIC_PARAM_KEYS, clampParam, type PostParams, type Ramp } from './params';
import { applyModulators, FORBIDDEN_MODULATION_TARGETS, ZERO_SOURCES, type ModSources } from './modulators';
import { PRESETS, type PostPreset } from './presets';
import feedbackShader from './wgsl/feedback.wgsl';
import brightShader from './wgsl/bright.wgsl';
import blurShader from './wgsl/blur.wgsl';
import compositeShader from './wgsl/composite.wgsl';
import warpShader from './wgsl/warp.wgsl';
import measureShader from './wgsl/measure.wgsl';
import finishShader from './wgsl/finish.wgsl';

export interface PostFrameInput {
  readonly sources: ModSources;
  readonly timeSec: number;
  readonly frameIndex: number;
  readonly reducedMotion: boolean;
}

export interface PostStack {
  /** Active preset name. */
  readonly presetName: string;
  /** Base (un-modulated) parameters; edited by the debug panel. */
  readonly params: PostParams;
  /** Parameters as last applied, after modulation and time-derived terms. */
  readonly effective: PostParams;
  readonly bloomEnabled: boolean;
  readonly warpEnabled: boolean;
  /** Runtime quality control: drop a stage (and its passes) without recompiling anything. */
  setStageEnabled(stage: 'bloom' | 'warp', enabled: boolean): void;
  /** Switch preset; with `blendSec` the parameters and ramp glide there over that many seconds. */
  setPreset(preset: PostPreset, blendSec?: number): void;
  setParams(next: Partial<PostParams>): void;
  setRamp(ramp: Ramp): void;
  /** Debug only: bypass the limiter to compare. Production never calls this. */
  setLimiterEnabled(enabled: boolean): void;
  /** Persistent additive offsets from the Director (e.g. kaleidoscope angle steps on bars). */
  setOffsets(offsets: Partial<PostParams>): void;
  /** One-frame additive deltas from a running transition; null clears. Added after modulators, then clamped. */
  setTransient(deltas: Partial<PostParams> | null): void;
  /** Intro fade 0-1; the only time-varying global brightness control. */
  setFade(fade: number): void;
  /** Resolve modulators + time terms and write uniforms for this frame. */
  applyFrame(input: PostFrameInput): void;
  compile(output: Surface | Target): Promise<void>;
  encode(frame: Frame, output: Surface | Target): void;
  /** Rebind after a target resize. */
  rebind(): void;
  dispose(): void;
}

const CLEAR = [0, 0, 0, 1] as const;

// Half-res tight halo, quarter-res wide glow.
const BLURS = [
  { direction: [1, 0], radius: 1.3 },
  { direction: [0, 1], radius: 1.3 },
  { direction: [1, 0], radius: 2.1 },
  { direction: [0, 1], radius: 2.1 },
] as const;

export interface PostStackOptions {
  readonly preset?: PostPreset;
  readonly bloom?: boolean;
  readonly warp?: boolean;
}

export function createPostStack(gpu: Gpu, targets: RenderTargets, options?: PostStackOptions): PostStack {
  let preset: PostPreset = options?.preset ?? PRESETS.clean;
  const params: PostParams = { ...preset.params };
  let ramp: Ramp = preset.ramp;
  let effective: PostParams = { ...params };
  const bloomAvailable = options?.bloom ?? true;
  const warpAvailable = options?.warp ?? true;
  let bloomEnabled = bloomAvailable;
  let warpEnabled = warpAvailable;
  let fade = 0;
  let limiterEnabled = 1;
  let offsets: Partial<PostParams> = {};
  let transient: Partial<PostParams> | null = null;
  let blend: { from: PostParams; fromRamp: Ramp; fromModulators: PostPreset['modulators']; start: number; seconds: number } | null = null;
  let lastTime = 0;

  const samp = sampler(gpu, {
    minFilter: 'linear', magFilter: 'linear',
    addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge',
  });

  const feedback: Effect = effect(gpu, feedbackShader, {
    label: 'eavi-post-feedback',
    set: {
      scene: targets.scene, history: targets.history.read, samp,
      params: { damp: params.feedbackDamp, zoom: params.feedbackZoom, rotate: params.feedbackRotate, pad0: 0 },
    },
  });

  const bright: Effect = effect(gpu, brightShader, {
    label: 'eavi-post-bright',
    set: { src: targets.history.write, samp, params: { threshold: params.bloomThreshold, knee: params.bloomKnee, pad0: 0, pad1: 0 } },
  });

  const blurs: Effect[] = BLURS.map((b, i) =>
    effect(gpu, blurShader, {
      label: `eavi-post-blur-${i}`,
      set: { src: targets.bloomNear[0], samp, params: { texelSize: [1, 1], direction: [b.direction[0], b.direction[1]], radius: b.radius, pad0: 0, pad1: 0, pad2: 0 } },
    }),
  );

  const composite: Effect = effect(gpu, compositeShader, {
    label: 'eavi-post-composite',
    set: {
      scene: targets.history.write, bloomNear: targets.bloomNear[0], bloomFar: targets.bloomFar[1], samp,
      params: { bloomNear: 0, bloomFar: 0, exposure: params.exposure, fade },
    },
  });

  const warp: Effect = effect(gpu, warpShader, {
    label: 'eavi-post-warp',
    set: {
      src: targets.composite, samp,
      params: { resolution: [1, 1], segments: 0, angle: 0, rgbShift: 0, barrel: 0, pixelSize: 0, kaleidoMix: 0 },
    },
  });

  const measure: Effect = effect(gpu, measureShader, {
    label: 'eavi-post-measure',
    set: {
      src: warpEnabled ? targets.warp : targets.composite, prev: targets.lumi.read, samp,
      params: { slewUp: params.limiterSlewUp, slewDown: params.limiterSlewDown, agcTarget: params.agcTarget, agcRate: params.agcRate },
    },
  });

  const rampVec = (r: Ramp) => ({
    ramp0: [r[0][0], r[0][1], r[0][2], 1], ramp1: [r[1][0], r[1][1], r[1][2], 1],
    ramp2: [r[2][0], r[2][1], r[2][2], 1], ramp3: [r[3][0], r[3][1], r[3][2], 1],
  });

  const finish: Effect = effect(gpu, finishShader, {
    label: 'eavi-post-finish',
    set: {
      src: warpEnabled ? targets.warp : targets.composite, lumi: targets.lumi.write, samp,
      params: {
        resolution: [1, 1], texel: [1, 1], ...rampVec(ramp), frame: 0,
        bleed: 0, scanlineIntensity: 0, scanlineCount: 480, vignette: 0, grain: 0, dither: 0,
        rampStrength: 0, hueShift: 0, limiterEnabled, pad0: 0, pad1: 0,
      },
    },
  });

  function rebind(): void {
    const { bloomNear, bloomFar, history, size } = targets;
    feedback.set({ scene: targets.scene, history: history.read });
    bright.set({ src: history.write });
    blurs[0].set({ src: bloomNear[0], params: { texelSize: bloomNear[0].texelSize } });
    blurs[1].set({ src: bloomNear[1], params: { texelSize: bloomNear[1].texelSize } });
    blurs[2].set({ src: bloomNear[0], params: { texelSize: bloomNear[0].texelSize } });
    blurs[3].set({ src: bloomFar[0], params: { texelSize: bloomFar[0].texelSize } });
    composite.set({ scene: history.write, bloomNear: bloomNear[0], bloomFar: bloomFar[1] });
    warp.set({ src: targets.composite, params: { resolution: [size[0], size[1]] } });
    const finishSrc = warpEnabled ? targets.warp : targets.composite;
    measure.set({ src: finishSrc, prev: targets.lumi.read });
    finish.set({ src: finishSrc, lumi: targets.lumi.write, params: { resolution: [size[0], size[1]], texel: finishSrc.texelSize } });
  }
  rebind();

  function writeUniforms(e: PostParams, frameIndex: number): void {
    feedback.set({ params: { damp: e.feedbackDamp, zoom: e.feedbackZoom, rotate: e.feedbackRotate } });
    if (bloomEnabled) bright.set({ params: { threshold: e.bloomThreshold, knee: e.bloomKnee } });
    composite.set({
      params: { bloomNear: bloomEnabled ? e.bloomNear : 0, bloomFar: bloomEnabled ? e.bloomFar : 0, exposure: e.exposure, fade },
    });
    if (warpEnabled) {
      warp.set({ params: { segments: e.kaleidoSegments, angle: e.kaleidoAngle, rgbShift: e.rgbShift, barrel: e.barrel, pixelSize: e.pixelSize, kaleidoMix: e.kaleidoMix } });
    }
    measure.set({ params: { slewUp: e.limiterSlewUp, slewDown: e.limiterSlewDown, agcTarget: e.agcTarget, agcRate: e.agcRate } });
    finish.set({
      params: {
        frame: frameIndex >>> 0, bleed: e.bleed, scanlineIntensity: e.scanlineIntensity, scanlineCount: e.scanlineCount,
        vignette: e.vignette, grain: e.grain, dither: e.dither, rampStrength: e.rampStrength, hueShift: e.hueShift,
        limiterEnabled,
      },
    });
  }

  return {
    get presetName() {
      return preset.name;
    },
    params,
    get effective() {
      return effective;
    },
    get bloomEnabled() {
      return bloomEnabled;
    },
    get warpEnabled() {
      return warpEnabled;
    },
    setStageEnabled(stage, enabled) {
      if (stage === 'bloom') bloomEnabled = enabled && bloomAvailable;
      else warpEnabled = enabled && warpAvailable;
      rebind();
    },
    setPreset(next, blendSec = 0) {
      if (blendSec > 0) {
        blend = { from: { ...effective, exposure: params.exposure, limiterSlewUp: params.limiterSlewUp, limiterSlewDown: params.limiterSlewDown, agcTarget: params.agcTarget, agcRate: params.agcRate }, fromRamp: ramp, fromModulators: preset.modulators, start: lastTime, seconds: blendSec };
      } else {
        blend = null;
      }
      preset = next;
      for (const key of NUMERIC_PARAM_KEYS) params[key] = next.params[key];
      ramp = next.ramp;
      if (!blend) finish.set({ params: rampVec(ramp) });
    },
    setParams(next) {
      for (const key of NUMERIC_PARAM_KEYS) {
        const v = next[key];
        if (typeof v === 'number' && Number.isFinite(v)) params[key] = v;
      }
    },
    setRamp(next) {
      ramp = next;
      finish.set({ params: rampVec(ramp) });
    },
    setLimiterEnabled(enabled) {
      limiterEnabled = enabled ? 1 : 0;
    },
    setOffsets(next) {
      offsets = next;
    },
    setTransient(next) {
      transient = next;
    },
    setFade(next) {
      fade = Math.max(0, Math.min(1, next));
    },
    applyFrame(input) {
      lastTime = input.timeSec;
      const base: PostParams = { ...params };
      let modulators = preset.modulators;
      if (blend) {
        const u = Math.max(0, Math.min(1, (input.timeSec - blend.start) / Math.max(0.01, blend.seconds)));
        const k = u * u * (3 - 2 * u);
        for (const key of NUMERIC_PARAM_KEYS) base[key] = blend.from[key] + (params[key] - blend.from[key]) * k;
        // The segment count is structural: take the target's at once and let kaleidoMix glide the fold in.
        base.kaleidoSegments = params.kaleidoSegments > 0 ? params.kaleidoSegments : blend.from.kaleidoSegments;
        const mixedRamp = blend.fromRamp.map((stop, i) => stop.map((c, j) => c + (ramp[i][j] - c) * k)) as unknown as Ramp;
        finish.set({ params: rampVec(mixedRamp) });
        if (k < 0.5) modulators = blend.fromModulators;
        if (u >= 1) {
          blend = null;
          finish.set({ params: rampVec(ramp) });
        }
      }
      const TAU = Math.PI * 2;
      for (const key of NUMERIC_PARAM_KEYS) {
        const o = offsets[key];
        if (typeof o !== 'number' || !Number.isFinite(o)) continue;
        // Angles are periodic: wrap instead of clamping so unbounded glides never pin at the range edge.
        if (key === 'kaleidoAngle' || key === 'hueShift') base[key] = (((base[key] + o) % TAU) + TAU) % TAU;
        else base[key] = clampParam(key, base[key] + o);
      }
      const e = applyModulators(base, input.sources ?? ZERO_SOURCES, modulators);
      if (transient) {
        for (const key of NUMERIC_PARAM_KEYS) {
          const v = transient[key];
          if (typeof v === 'number' && Number.isFinite(v) && !(FORBIDDEN_MODULATION_TARGETS as readonly string[]).includes(key)) e[key] = clampParam(key, e[key] + v);
        }
      }
      // Time-derived terms.
      e.kaleidoAngle = (e.kaleidoAngle + e.kaleidoSpin * input.timeSec) % (Math.PI * 2);
      e.hueShift = (e.hueShift + e.hueCycle * input.timeSec) % (Math.PI * 2);
      if (input.reducedMotion) {
        e.feedbackDamp = 0;
        e.feedbackRotate = 0;
        e.feedbackZoom = 0;
        e.kaleidoAngle = params.kaleidoAngle;
        e.hueShift = params.hueShift;
        e.barrel = params.barrel;
      }
      effective = e;
      writeUniforms(e, input.frameIndex);
    },
    async compile(output) {
      const finishSrc = warpEnabled ? targets.warp : targets.composite;
      const tasks: Promise<unknown>[] = [
        feedback.compile(targets.history.write),
        composite.compile(targets.composite),
        measure.compile(targets.lumi.write),
        finish.compile(output),
      ];
      if (warpAvailable) tasks.push(warp.compile(targets.warp));
      if (bloomAvailable) {
        tasks.push(
          bright.compile(targets.bloomNear[0]),
          blurs[0].compile(targets.bloomNear[1]),
          blurs[1].compile(targets.bloomNear[0]),
          blurs[2].compile(targets.bloomFar[0]),
          blurs[3].compile(targets.bloomFar[1]),
        );
      }
      void finishSrc;
      await Promise.all(tasks);
    },
    encode(frame, output) {
      const { bloomNear, bloomFar, history, lumi } = targets;
      // Ping-pong pairs swap every frame, so readers follow them.
      feedback.set({ history: history.read });
      bright.set({ src: history.write });
      composite.set({ scene: history.write });
      measure.set({ prev: lumi.read });
      finish.set({ lumi: lumi.write });

      frame.pass({ target: history.write, clear: CLEAR }, feedback);
      if (bloomEnabled) {
        frame.pass({ target: bloomNear[0], clear: CLEAR }, bright);
        frame.pass({ target: bloomNear[1], clear: CLEAR }, blurs[0]);
        frame.pass({ target: bloomNear[0], clear: CLEAR }, blurs[1]);
        frame.pass({ target: bloomFar[0], clear: CLEAR }, blurs[2]);
        frame.pass({ target: bloomFar[1], clear: CLEAR }, blurs[3]);
      }
      frame.pass({ target: targets.composite, clear: CLEAR }, composite);
      if (warpEnabled) frame.pass({ target: targets.warp, clear: CLEAR }, warp);
      frame.pass({ target: lumi.write, clear: CLEAR }, measure);
      frame.pass({ target: output, clear: CLEAR }, finish);
      history.swap();
      lumi.swap();
    },
    rebind,
    dispose() {
      feedback.dispose();
      bright.dispose();
      for (const b of blurs) b.dispose();
      composite.dispose();
      warp.dispose();
      measure.dispose();
      finish.dispose();
    },
  };
}
