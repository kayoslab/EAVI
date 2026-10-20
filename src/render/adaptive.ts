import type { PostStack } from '../post/stack';

export interface AdaptiveQualityOptions {
  readonly post: PostStack;
  /** Called when the controller wants a lower device pixel ratio cap; return the new cap or null if none left. */
  readonly lowerDpr: () => number | null;
  readonly minFps?: number;
  readonly sustainSec?: number;
  readonly cooldownSec?: number;
  readonly log?: (message: string) => void;
}

export interface AdaptiveQuality {
  /** Feed one frame's instantaneous fps; the controller acts on sustained lows. */
  tick(fps: number, nowSec: number): void;
  readonly step: number;
}

/**
 * Frame-health watchdog. On sustained low fps it degrades in order: warp pass → bloom → DPR cap,
 * one step per cooldown. The canvas always stays full-screen; only GPU cost changes. Never upgrades back.
 */
export function createAdaptiveQuality(options: AdaptiveQualityOptions): AdaptiveQuality {
  const minFps = options.minFps ?? 30;
  const sustain = options.sustainSec ?? 3;
  const cooldown = options.cooldownSec ?? 6;
  let lowSince = -1;
  let lastAction = -Infinity;
  let step = 0;
  const log = options.log ?? ((m: string) => console.log(m));

  function degrade(nowSec: number): void {
    lastAction = nowSec;
    lowSince = -1;
    if (step === 0 && options.post.warpEnabled) {
      options.post.setStageEnabled('warp', false);
      step = 1;
      log('[EAVI adaptive] warp pass disabled');
      return;
    }
    if (step <= 1 && options.post.bloomEnabled) {
      options.post.setStageEnabled('bloom', false);
      step = 2;
      log('[EAVI adaptive] bloom disabled');
      return;
    }
    const next = options.lowerDpr();
    step = 3;
    if (next !== null) log(`[EAVI adaptive] pixel ratio cap -> ${next.toFixed(2)}`);
  }

  return {
    get step() {
      return step;
    },
    tick(fps, nowSec) {
      if (nowSec - lastAction < cooldown) return;
      if (fps >= minFps) {
        lowSince = -1;
        return;
      }
      if (lowSince < 0) lowSince = nowSec;
      if (nowSec - lowSince >= sustain) degrade(nowSec);
    },
  };
}
