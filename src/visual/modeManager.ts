import type { Scene } from 'three';
import { createPRNG } from './prng';
import type { VisualParams } from './mappings';
import type { FrameState, GeometrySystem } from './types';
import type { ConstellationLines } from './systems/constellationLines';
import type { CompoundRotationEntry } from './compoundModes';

export interface ModeEntry {
  name: string;
  factory: () => GeometrySystem;
}

export interface SingleRotationEntry {
  kind: 'single';
  name: string;
  system: GeometrySystem;
  maxPoints: number;
}

export type RotationEntry = SingleRotationEntry | CompoundRotationEntry;

export type { CompoundRotationEntry };

export interface OverlayAttachment {
  overlay: ConstellationLines;
  getPositions: (system: GeometrySystem) => Float32Array | null;
}

export interface ModeManager extends GeometrySystem {
  readonly activeIndex: number;
  readonly transitioning: boolean;
  readonly activeEntryName: string;
  readonly isCompoundActive: boolean;
  readonly activeMaxPoints: number;
  initAllForValidation(scene: Scene, seed: string, params: VisualParams): void;
  cleanupInactive(): void;
  attachOverlay(attachment: OverlayAttachment): void;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function isModeEntry(item: ModeEntry | RotationEntry): item is ModeEntry {
  return 'factory' in item && !('kind' in item);
}

function convertToRotationEntries(items: (ModeEntry | RotationEntry)[]): RotationEntry[] {
  return items.map((item) => {
    if (isModeEntry(item)) {
      return {
        kind: 'single' as const,
        name: item.name,
        system: item.factory(),
        maxPoints: 0,
      };
    }
    return item;
  });
}

// Get all systems from an entry (1 for single, 2 for compound)
function entrySystems(entry: RotationEntry): GeometrySystem[] {
  if (entry.kind === 'single') return [entry.system];
  return [entry.layers[0].system, entry.layers[1].system];
}

// Get the primary system for overlay attachment
function entryPrimarySystem(entry: RotationEntry): GeometrySystem {
  if (entry.kind === 'single') return entry.system;
  return entry.layers[entry.primaryLayerIndex].system;
}

// Init all systems in an entry
function initEntry(entry: RotationEntry, scene: Scene, seed: string, params: VisualParams): void {
  for (const sys of entrySystems(entry)) {
    sys.init(scene, seed, params);
  }
}

// Cleanup all systems in an entry
function cleanupEntry(entry: RotationEntry): void {
  for (const sys of entrySystems(entry)) {
    sys.cleanup?.();
  }
}

// Set opacity on all systems in an entry
function setEntryOpacity(entry: RotationEntry, opacity: number): void {
  for (const sys of entrySystems(entry)) {
    sys.setOpacity?.(opacity);
  }
}

// Draw all systems in an entry
function drawEntry(entry: RotationEntry, scene: Scene, frame: FrameState): void {
  for (const sys of entrySystems(entry)) {
    sys.draw(scene, frame);
  }
}

export function createModeManager(modes: (ModeEntry | RotationEntry)[]): ModeManager {
  if (modes.length === 0) {
    throw new Error('ModeManager requires at least one mode');
  }

  const entries: RotationEntry[] = convertToRotationEntries(modes);
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

  // Overlay state
  let overlayAttachment: OverlayAttachment | null = null;

  function initOverlay(scene: Scene, params: VisualParams): void {
    if (!overlayAttachment) return;
    overlayAttachment.overlay.cleanup();
    const positions = overlayAttachment.getPositions(entryPrimarySystem(entries[activeIndex]));
    if (positions) {
      overlayAttachment.overlay.init(scene, positions, params);
    }
  }

  function selectInitialMode(seed: string): void {
    const rng = createPRNG(seed + ':mode');
    activeIndex = Math.floor(rng() * entries.length);
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

    get activeEntryName() {
      return entries[activeIndex].name;
    },

    get isCompoundActive() {
      return entries[activeIndex].kind === 'compound';
    },

    get activeMaxPoints() {
      return entries[activeIndex].maxPoints;
    },

    attachOverlay(attachment: OverlayAttachment): void {
      overlayAttachment = attachment;
    },

    init(
      scene: Scene,
      s: string,
      params: VisualParams,
    ): void {
      seed = s;
      selectInitialMode(seed);
      initEntry(entries[activeIndex], scene, seed, params);
      initOverlay(scene, params);
      initialized = true;
    },

    initAllForValidation(
      scene: Scene,
      s: string,
      params: VisualParams,
    ): void {
      seed = s;
      selectInitialMode(seed);
      for (let i = 0; i < entries.length; i++) {
        initEntry(entries[i], scene, seed, params);
        if (i !== activeIndex) {
          setEntryOpacity(entries[i], 0);
        }
      }
      initialized = true;
    },

    cleanupInactive(): void {
      for (let i = 0; i < entries.length; i++) {
        if (i !== activeIndex) {
          cleanupEntry(entries[i]);
        }
      }
    },

    draw(scene: Scene, frame: FrameState): void {
      if (!initialized) return;

      // Handle ongoing transition
      if (isTransitioning) {
        const progress = Math.min(1, (frame.elapsed - transitionStart) / transitionDuration);

        // Check if transition is complete
        if (progress >= 1) {
          cleanupEntry(entries[outgoingIndex]);
          setEntryOpacity(entries[outgoingIndex], 1);
          setEntryOpacity(entries[activeIndex], 1);
          isTransitioning = false;
          // Rebuild overlay for newly active system
          initOverlay(scene, frame.params);
          drawEntry(entries[activeIndex], scene, frame);
          overlayAttachment?.overlay.draw(scene, frame);
          return;
        }

        const eased = smoothstep(progress);

        // Set opacity on outgoing and incoming entries
        setEntryOpacity(entries[outgoingIndex], 1 - eased);
        setEntryOpacity(entries[activeIndex], eased);
        overlayAttachment?.overlay.setOpacity(eased);

        // Draw both entries
        drawEntry(entries[outgoingIndex], scene, frame);
        drawEntry(entries[activeIndex], scene, frame);
        overlayAttachment?.overlay.draw(scene, frame);
        return;
      }

      // Check for mode switch
      if (frame.elapsed >= nextSwitchAt) {
        const prevIndex = activeIndex;
        activeIndex = (activeIndex + 1) % entries.length;
        if (activeIndex !== prevIndex) {
          // Init incoming entry at opacity 0
          initEntry(entries[activeIndex], scene, seed, frame.params);
          setEntryOpacity(entries[activeIndex], 0);

          // Enter transition state
          isTransitioning = true;
          transitionStart = frame.elapsed;
          outgoingIndex = prevIndex;

          // Set initial opacity and draw both
          setEntryOpacity(entries[outgoingIndex], 1);
          drawEntry(entries[outgoingIndex], scene, frame);
          drawEntry(entries[activeIndex], scene, frame);
          overlayAttachment?.overlay.draw(scene, frame);

          nextSwitchAt = frame.elapsed + switchInterval;
          return;
        }
        nextSwitchAt = frame.elapsed + switchInterval;
      }

      drawEntry(entries[activeIndex], scene, frame);
      overlayAttachment?.overlay.draw(scene, frame);
    },
  };
}
