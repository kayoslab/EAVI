import type { Scene } from 'three';
import { createPRNG } from './prng';
import type { VisualParams } from './mappings';
import type { FrameState, FramingConfig, GeometrySystem } from './types';
import type { Overlay } from './overlay';
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
  framing: FramingConfig;
  weight?: number;
}

export type RotationEntry = SingleRotationEntry | CompoundRotationEntry;

export type { CompoundRotationEntry };

export interface OverlayAttachment {
  overlay: Overlay;
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
  reinitActive(scene: Scene, seed: string, params: VisualParams): void;
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
        framing: { ...DEFAULT_FRAMING },
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

const DEFAULT_FRAMING: FramingConfig = {
  targetDistance: 5,
  lookOffset: [0, 0, 0],
  nearClip: 0.1,
  farClip: 100,
};

function lerpFraming(a: FramingConfig, b: FramingConfig, t: number): FramingConfig {
  const aDrift = a.driftScale ?? [1, 1, 1];
  const bDrift = b.driftScale ?? [1, 1, 1];
  return {
    targetDistance: a.targetDistance + (b.targetDistance - a.targetDistance) * t,
    lookOffset: [
      a.lookOffset[0] + (b.lookOffset[0] - a.lookOffset[0]) * t,
      a.lookOffset[1] + (b.lookOffset[1] - a.lookOffset[1]) * t,
      a.lookOffset[2] + (b.lookOffset[2] - a.lookOffset[2]) * t,
    ],
    nearClip: a.nearClip + (b.nearClip - a.nearClip) * t,
    farClip: a.farClip + (b.farClip - a.farClip) * t,
    driftScale: [
      aDrift[0] + (bDrift[0] - aDrift[0]) * t,
      aDrift[1] + (bDrift[1] - aDrift[1]) * t,
      aDrift[2] + (bDrift[2] - aDrift[2]) * t,
    ],
    // During transition, use the target mode's camera style (snaps at t>0.5)
    cameraMode: t > 0.5 ? b.cameraMode : a.cameraMode,
    orbitRadius: a.orbitRadius !== undefined && b.orbitRadius !== undefined
      ? a.orbitRadius + (b.orbitRadius - a.orbitRadius) * t
      : (t > 0.5 ? b.orbitRadius : a.orbitRadius),
    flythroughSpeed: a.flythroughSpeed !== undefined && b.flythroughSpeed !== undefined
      ? a.flythroughSpeed + (b.flythroughSpeed - a.flythroughSpeed) * t
      : (t > 0.5 ? b.flythroughSpeed : a.flythroughSpeed),
    flythroughCycleLength: a.flythroughCycleLength !== undefined && b.flythroughCycleLength !== undefined
      ? a.flythroughCycleLength + (b.flythroughCycleLength - a.flythroughCycleLength) * t
      : (t > 0.5 ? b.flythroughCycleLength : a.flythroughCycleLength),
    bloomStrength: (a.bloomStrength ?? 1.0) + ((b.bloomStrength ?? 1.0) - (a.bloomStrength ?? 1.0)) * t,
  };
}

function entryFraming(entry: RotationEntry): FramingConfig {
  return entry.framing ?? DEFAULT_FRAMING;
}

// Module-level active framing state, updated by the last createModeManager instance
let _activeFraming: FramingConfig = { ...DEFAULT_FRAMING };

export function getActiveFraming(): FramingConfig {
  return _activeFraming;
}

// Global opacity multiplier (used for intro fade)
let _globalOpacityScale = 1;

export function setGlobalOpacityScale(scale: number): void {
  _globalOpacityScale = scale;
}

function getWeight(entry: RotationEntry): number {
  return (entry as { weight?: number }).weight ?? 1;
}

/** Build a weighted pool: each entry index appears `weight` times. */
function buildWeightedPool(entries: RotationEntry[]): number[] {
  const pool: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    const w = getWeight(entries[i]);
    for (let j = 0; j < w; j++) {
      pool.push(i);
    }
  }
  return pool;
}

/** Weighted random selection using cumulative weights. */
function weightedRandomIndex(entries: RotationEntry[], rng: () => number): number {
  const totalWeight = entries.reduce((sum, e) => sum + getWeight(e), 0);
  const r = rng() * totalWeight;
  let cumulative = 0;
  for (let i = 0; i < entries.length; i++) {
    cumulative += getWeight(entries[i]);
    if (r < cumulative) return i;
  }
  return entries.length - 1;
}

export function createModeManager(modes: (ModeEntry | RotationEntry)[]): ModeManager {
  if (modes.length === 0) {
    throw new Error('ModeManager requires at least one mode');
  }

  const entries: RotationEntry[] = convertToRotationEntries(modes);
  const weightedPool = buildWeightedPool(entries);
  let poolIndex = 0;
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

  // Color coherence state
  let lastHue = -1;
  let hueBlendStart = -1;
  const HUE_BLEND_DURATION = 3000;

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
    activeIndex = weightedRandomIndex(entries, rng);
    // Shuffle the weighted pool deterministically (Fisher-Yates)
    for (let i = weightedPool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = weightedPool[i];
      weightedPool[i] = weightedPool[j];
      weightedPool[j] = tmp;
    }
    // Find activeIndex in pool to start cycling from there
    poolIndex = weightedPool.indexOf(activeIndex);
    if (poolIndex === -1) poolIndex = 0;
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

    reinitActive(scene: Scene, s: string, params: VisualParams): void {
      if (activeIndex < 0 || activeIndex >= entries.length) return;
      const entry = entries[activeIndex];
      // Cleanup current
      for (const sys of entrySystems(entry)) {
        sys.cleanup?.();
      }
      // Re-init
      for (const sys of entrySystems(entry)) {
        sys.init(scene, s, params);
      }
    },

    init(
      scene: Scene,
      s: string,
      params: VisualParams,
    ): void {
      seed = s;
      selectInitialMode(seed);
      initEntry(entries[activeIndex], scene, seed, params);
      _activeFraming = entryFraming(entries[activeIndex]);
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
      _activeFraming = entryFraming(entries[activeIndex]);
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
          lastHue = frame.params.paletteHue;
          hueBlendStart = frame.elapsed;
          isTransitioning = false;
          _activeFraming = entryFraming(entries[activeIndex]);
          // Rebuild overlay for newly active system
          initOverlay(scene, frame.params);
          drawEntry(entries[activeIndex], scene, frame);
          overlayAttachment?.overlay.draw(scene, frame);
          return;
        }

        // Interpolate framing between outgoing and incoming
        _activeFraming = lerpFraming(
          entryFraming(entries[outgoingIndex]),
          entryFraming(entries[activeIndex]),
          smoothstep(progress),
        );

        // V-shaped fade: outgoing fades to 0 by t=0.4, incoming fades in from t=0.6
        const outT = Math.min(1, progress / 0.4);
        const inT = Math.max(0, (progress - 0.6) / 0.4);
        const outOpacity = 1 - outT * outT * (3 - 2 * outT); // smoothstep
        const inOpacity = inT * inT * (3 - 2 * inT); // smoothstep
        setEntryOpacity(entries[outgoingIndex], outOpacity * _globalOpacityScale);
        setEntryOpacity(entries[activeIndex], inOpacity * _globalOpacityScale);
        overlayAttachment?.overlay.setOpacity(inOpacity * _globalOpacityScale);

        // Draw both entries
        drawEntry(entries[outgoingIndex], scene, frame);
        drawEntry(entries[activeIndex], scene, frame);
        overlayAttachment?.overlay.draw(scene, frame);
        return;
      }

      // Check for mode switch
      if (frame.elapsed >= nextSwitchAt) {
        const prevIndex = activeIndex;
        poolIndex = (poolIndex + 1) % weightedPool.length;
        activeIndex = weightedPool[poolIndex];
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

      _activeFraming = entryFraming(entries[activeIndex]);

      // Color coherence: smooth hue blending after transition completes
      if (hueBlendStart >= 0 && frame.elapsed - hueBlendStart < HUE_BLEND_DURATION) {
        const t = (frame.elapsed - hueBlendStart) / HUE_BLEND_DURATION;
        const blended = lastHue + (frame.params.paletteHue - lastHue) * (t * t * (3 - 2 * t));
        frame = { ...frame, params: { ...frame.params, paletteHue: ((blended % 360) + 360) % 360 } };
      }

      if (_globalOpacityScale < 1) {
        setEntryOpacity(entries[activeIndex], _globalOpacityScale);
        overlayAttachment?.overlay.setOpacity(_globalOpacityScale);
      }
      drawEntry(entries[activeIndex], scene, frame);
      overlayAttachment?.overlay.draw(scene, frame);
    },
  };
}
