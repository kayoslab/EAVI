/**
 * Autonomous seeded camera motion.
 *
 * Three motion styles:
 * - default: Lissajous drift — incommensurate sine frequencies create organic,
 *   non-repeating horizontal paths. Smooth and steady, never jerky.
 * - orbit: slow continuous circular path in the XZ plane around centered 3D objects.
 * - flythrough: continuous forward travel through elongated environments.
 *
 * Camera position is EMA-smoothed to prevent any jerkiness.
 * Audio does NOT affect camera position — only the visuals react to music.
 * motionAmplitude scales drift (supports prefers-reduced-motion).
 */

import type { PerspectiveCamera } from 'three';
import type { FramingConfig } from './types';
import { createPRNG } from './prng';

interface Harmonic {
  amplitude: number;
  frequency: number;
  phase: number;
}

interface CameraHarmonics {
  posX: Harmonic[];
  posZ: Harmonic[];
  lookX: Harmonic[];
  lookZ: Harmonic[];
  orbitSpeed: number;
  swayFrequency: number;
  swayPhase: number;
}

const BASE_X = 0;
const BASE_Z = 5;

// Prime-ish periods — long, incommensurate, so paths feel organic
const PRIME_PERIODS = [67000, 97000, 157000, 83000, 113000, 139000, 71000, 107000, 151000];

// EMA smoothing factor for camera position (higher = smoother, slower response)
const CAM_SMOOTH = 0.97;

const harmonicCache = new Map<string, CameraHarmonics>();
let activeSeed: string | null = null;

// Smoothed camera state (persists across frames)
let smoothX = 0;
let smoothY = 0;
let smoothZ = BASE_Z;
let smoothLookX = 0;
let smoothLookY = 0;
let smoothLookZ = 0;
let smoothInitialized = false;

function buildHarmonics(seed: string): CameraHarmonics {
  const cached = harmonicCache.get(seed);
  if (cached) return cached;

  const rng = createPRNG(seed + ':camera');

  function makeLissajous(ampMin: number, ampMax: number, count: number): Harmonic[] {
    const result: Harmonic[] = [];
    for (let i = 0; i < count; i++) {
      const basePeriod = PRIME_PERIODS[(Math.floor(rng() * PRIME_PERIODS.length)) % PRIME_PERIODS.length];
      const jitteredPeriod = basePeriod * (0.8 + rng() * 0.4);
      result.push({
        amplitude: ampMin + rng() * (ampMax - ampMin),
        frequency: (2 * Math.PI) / jitteredPeriod,
        phase: rng() * Math.PI * 2,
      });
    }
    return result;
  }

  const h: CameraHarmonics = {
    // Gentle horizontal drift — reduced amplitudes for smooth feel
    posX: makeLissajous(0.15, 0.3, 3),
    posZ: makeLissajous(0.08, 0.15, 3),
    // Look target drift — very subtle
    lookX: makeLissajous(0.03, 0.06, 3),
    lookZ: makeLissajous(0.02, 0.04, 3),
    // Orbit: very slow (150-240s per revolution)
    orbitSpeed: (2 * Math.PI) / (150000 + rng() * 90000),
    // Flythrough sway — gentle
    swayFrequency: (2 * Math.PI) / (30000 + rng() * 25000),
    swayPhase: rng() * Math.PI * 2,
  };

  harmonicCache.set(seed, h);
  return h;
}

function evalAxis(harmonics: Harmonic[], elapsedMs: number): number {
  let sum = 0;
  for (const h of harmonics) {
    sum += h.amplitude * Math.sin(elapsedMs * h.frequency + h.phase);
  }
  return sum;
}

export function initCameraMotion(seed: string): void {
  activeSeed = seed;
  buildHarmonics(seed);
  smoothInitialized = false;
}

export function updateCamera(
  camera: PerspectiveCamera,
  elapsedMs: number,
  _bassEnergy: number,
  motionAmplitude: number,
  framing?: FramingConfig,
): void {
  if (!activeSeed) return;
  const h = harmonicCache.get(activeSeed);
  if (!h) return;

  const mode = framing?.cameraMode;
  const baseZ = framing?.targetDistance ?? BASE_Z;
  const lookOffY = framing?.lookOffset?.[1] ?? 0;

  // Compute target camera position (no audio influence)
  let targetX: number;
  let targetY: number;
  let targetZ: number;
  let targetLookX: number;
  let targetLookY: number;
  let targetLookZ: number;

  if (mode === 'orbit') {
    const radius = framing?.orbitRadius ?? baseZ;
    const angle = elapsedMs * h.orbitSpeed * 0.001;
    const eccentricity = 0.92 + Math.sin(angle * 0.3) * 0.08;

    targetX = Math.sin(angle) * radius * eccentricity;
    targetY = lookOffY;
    targetZ = Math.cos(angle) * radius;

    targetLookX = evalAxis(h.lookX, elapsedMs) * motionAmplitude * 0.05;
    targetLookY = 0;
    targetLookZ = evalAxis(h.lookZ, elapsedMs) * motionAmplitude * 0.04;

  } else if (mode === 'flythrough') {
    const speed = framing?.flythroughSpeed ?? 0.5;
    const driftScale = framing?.driftScale ?? [1, 1, 1];
    const cycleLength = framing?.flythroughCycleLength ?? 80;

    const meshStartZ = 5.0;
    const forwardProgress = (elapsedMs * 0.001 * speed) % cycleLength;

    // Gentle horizontal sway — no audio influence
    const sway = Math.sin(elapsedMs * h.swayFrequency + h.swayPhase)
      * 0.4 * motionAmplitude * driftScale[0];

    targetX = BASE_X + sway;
    targetY = lookOffY;
    targetZ = meshStartZ - forwardProgress;

    const lookAheadZ = targetZ - 20;
    targetLookX = evalAxis(h.lookX, elapsedMs) * motionAmplitude * 0.08;
    targetLookY = lookOffY * 0.5;
    targetLookZ = lookAheadZ;

  } else {
    // Lissajous drift — smooth, organic, no audio
    const driftScale = framing?.driftScale ?? [1, 1, 1];

    const offsetX = evalAxis(h.posX, elapsedMs) * motionAmplitude;
    const offsetZ = evalAxis(h.posZ, elapsedMs) * motionAmplitude;

    targetX = BASE_X + offsetX * driftScale[0];
    targetY = lookOffY;
    targetZ = baseZ + offsetZ * driftScale[2];

    const lookOffX = framing?.lookOffset?.[0] ?? 0;
    const lookOffZ = framing?.lookOffset?.[2] ?? 0;
    targetLookX = evalAxis(h.lookX, elapsedMs) * motionAmplitude + lookOffX;
    targetLookY = lookOffY * 0.3;
    targetLookZ = evalAxis(h.lookZ, elapsedMs) * motionAmplitude + lookOffZ;
  }

  // EMA smooth the camera position for silky movement
  if (!smoothInitialized) {
    smoothX = targetX;
    smoothY = targetY;
    smoothZ = targetZ;
    smoothLookX = targetLookX;
    smoothLookY = targetLookY;
    smoothLookZ = targetLookZ;
    smoothInitialized = true;
  } else {
    smoothX = smoothX * CAM_SMOOTH + targetX * (1 - CAM_SMOOTH);
    smoothY = smoothY * CAM_SMOOTH + targetY * (1 - CAM_SMOOTH);
    smoothZ = smoothZ * CAM_SMOOTH + targetZ * (1 - CAM_SMOOTH);
    smoothLookX = smoothLookX * CAM_SMOOTH + targetLookX * (1 - CAM_SMOOTH);
    smoothLookY = smoothLookY * CAM_SMOOTH + targetLookY * (1 - CAM_SMOOTH);
    smoothLookZ = smoothLookZ * CAM_SMOOTH + targetLookZ * (1 - CAM_SMOOTH);
  }

  camera.position.set(smoothX, smoothY, smoothZ);
  camera.lookAt(smoothLookX, smoothLookY, smoothLookZ);
}

/** Exposed for testing — clears the harmonic cache. */
export function _clearHarmonicCache(): void {
  harmonicCache.clear();
  activeSeed = null;
  smoothInitialized = false;
}
