import type { Scene } from 'three';
import { createPRNG } from './prng';
import type { VisualParams } from './mappings';
import type { FrameState, GeometrySystem } from './types';

export interface ModeEntry {
  name: string;
  factory: () => GeometrySystem;
}

export interface ModeManager extends GeometrySystem {
  readonly activeIndex: number;
}

export function createModeManager(modes: ModeEntry[]): ModeManager {
  if (modes.length === 0) {
    throw new Error('ModeManager requires at least one mode');
  }

  const systems: GeometrySystem[] = modes.map((m) => m.factory());
  let activeIndex = 0;
  let switchInterval = 120_000; // default 120s, will be seeded
  let nextSwitchAt = 0;
  let seed = '';
  let initialized = false;

  function selectInitialMode(seed: string): void {
    const rng = createPRNG(seed + ':mode');
    activeIndex = Math.floor(rng() * systems.length);
    // Seeded interval: 90-180 seconds (in ms)
    switchInterval = 90_000 + Math.floor(rng() * 90_000);
    nextSwitchAt = switchInterval;
  }

  return {
    get activeIndex() {
      return activeIndex;
    },

    init(
      scene: Scene,
      s: string,
      params: VisualParams,
    ): void {
      seed = s;
      selectInitialMode(seed);
      systems[activeIndex].init(scene, seed, params);
      initialized = true;
    },

    draw(scene: Scene, frame: FrameState): void {
      if (!initialized) return;

      // Check for mode switch
      if (frame.elapsed >= nextSwitchAt) {
        const prevIndex = activeIndex;
        activeIndex = (activeIndex + 1) % systems.length;
        if (activeIndex !== prevIndex) {
          systems[prevIndex].cleanup?.();
          systems[activeIndex].init(scene, seed, frame.params);
        }
        nextSwitchAt = frame.elapsed + switchInterval;
      }

      systems[activeIndex].draw(scene, frame);
    },
  };
}
