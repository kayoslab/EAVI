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
  readonly transitioning: boolean;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function createModeManager(modes: ModeEntry[]): ModeManager {
  if (modes.length === 0) {
    throw new Error('ModeManager requires at least one mode');
  }

  const systems: GeometrySystem[] = modes.map((m) => m.factory());
  let activeIndex = 0;
  let switchInterval = 120_000;
  let nextSwitchAt = 0;
  let seed = '';
  let initialized = false;

  // Transition state
  let isTransitioning = false;
  let transitionStart = 0;
  let transitionDuration = 3000;
  let outgoingIndex = -1;

  function selectInitialMode(seed: string): void {
    const rng = createPRNG(seed + ':mode');
    activeIndex = Math.floor(rng() * systems.length);
    // Seeded interval: 90-180 seconds (in ms)
    switchInterval = 90_000 + Math.floor(rng() * 90_000);
    nextSwitchAt = switchInterval;
    // Seeded transition duration: 2000-4000ms
    transitionDuration = 2000 + Math.floor(rng() * 2000);
  }

  return {
    get activeIndex() {
      return activeIndex;
    },

    get transitioning() {
      return isTransitioning;
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

      // Handle ongoing transition
      if (isTransitioning) {
        const progress = Math.min(1, (frame.elapsed - transitionStart) / transitionDuration);

        // Check if transition is complete
        if (progress >= 1) {
          systems[outgoingIndex].cleanup?.();
          systems[outgoingIndex].setOpacity?.(1);
          systems[activeIndex].setOpacity?.(1);
          isTransitioning = false;
          systems[activeIndex].draw(scene, frame);
          return;
        }

        const eased = smoothstep(progress);

        // Set opacity on both systems
        systems[outgoingIndex].setOpacity?.(1 - eased);
        systems[activeIndex].setOpacity?.(eased);

        // Draw both systems
        systems[outgoingIndex].draw(scene, frame);
        systems[activeIndex].draw(scene, frame);
        return;
      }

      // Check for mode switch
      if (frame.elapsed >= nextSwitchAt) {
        const prevIndex = activeIndex;
        activeIndex = (activeIndex + 1) % systems.length;
        if (activeIndex !== prevIndex) {
          // Init incoming system at opacity 0
          systems[activeIndex].init(scene, seed, frame.params);
          systems[activeIndex].setOpacity?.(0);

          // Enter transition state
          isTransitioning = true;
          transitionStart = frame.elapsed;
          outgoingIndex = prevIndex;

          // Set initial opacity and draw both
          systems[outgoingIndex].setOpacity?.(1);
          systems[outgoingIndex].draw(scene, frame);
          systems[activeIndex].draw(scene, frame);

          nextSwitchAt = frame.elapsed + switchInterval;
          return;
        }
        nextSwitchAt = frame.elapsed + switchInterval;
      }

      systems[activeIndex].draw(scene, frame);
    },
  };
}
