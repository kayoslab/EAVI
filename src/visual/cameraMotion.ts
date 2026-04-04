/**
 * Autonomous seeded camera motion using layered sine harmonics.
 *
 * Camera drifts smoothly in 3D space around a base position (0, 0, 5),
 * revealing parallax across depth layers of the point cloud.
 * Pointer input has NO effect on camera — motion is fully autonomous.
 *
 * Bass energy modulates orbit radius (macro motion).
 * motionAmplitude scales all displacement (supports prefers-reduced-motion).
 */

import type { PerspectiveCamera } from 'three';
import { createPRNG } from './prng';

interface Harmonic {
  amplitude: number;
  frequency: number;
  phase: number;
}

interface CameraHarmonics {
  posX: Harmonic[];
  posY: Harmonic[];
  posZ: Harmonic[];
  lookX: Harmonic[];
  lookY: Harmonic[];
  lookZ: Harmonic[];
}

const BASE_X = 0;
const BASE_Y = 0;
const BASE_Z = 5;

const harmonicCache = new Map<string, CameraHarmonics>();
let activeSeed: string | null = null;

function buildHarmonics(seed: string): CameraHarmonics {
  const cached = harmonicCache.get(seed);
  if (cached) return cached;

  const rng = createPRNG(seed + ':camera');

  function makeHarmonics(
    ampMin: number,
    ampMax: number,
    periodMinMs: number,
    periodMaxMs: number,
    count: number,
  ): Harmonic[] {
    const result: Harmonic[] = [];
    for (let i = 0; i < count; i++) {
      result.push({
        amplitude: ampMin + rng() * (ampMax - ampMin),
        frequency:
          (2 * Math.PI) / (periodMinMs + rng() * (periodMaxMs - periodMinMs)),
        phase: rng() * Math.PI * 2,
      });
    }
    return result;
  }

  const h: CameraHarmonics = {
    // Position harmonics: periods 30-120s, amplitudes 0.3-0.5 per harmonic
    posX: makeHarmonics(0.3, 0.5, 30000, 120000, 3),
    posY: makeHarmonics(0.3, 0.5, 30000, 120000, 3),
    posZ: makeHarmonics(0.2, 0.4, 40000, 120000, 3),
    // Look-target harmonics: periods 40-100s, amplitudes 0.1-0.3
    lookX: makeHarmonics(0.1, 0.3, 40000, 100000, 2),
    lookY: makeHarmonics(0.1, 0.3, 40000, 100000, 2),
    lookZ: makeHarmonics(0.05, 0.15, 50000, 100000, 2),
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
}

export function updateCamera(
  camera: PerspectiveCamera,
  elapsedMs: number,
  bassEnergy: number,
  motionAmplitude: number,
): void {
  if (!activeSeed) return;
  const h = harmonicCache.get(activeSeed);
  if (!h) return;

  const bassScale = 1 + bassEnergy * 0.15;

  const offsetX =
    evalAxis(h.posX, elapsedMs) * motionAmplitude * bassScale;
  const offsetY =
    evalAxis(h.posY, elapsedMs) * motionAmplitude * bassScale;
  const offsetZ =
    evalAxis(h.posZ, elapsedMs) * motionAmplitude * bassScale;

  camera.position.set(
    BASE_X + offsetX,
    BASE_Y + offsetY,
    BASE_Z + offsetZ,
  );

  const lookX = evalAxis(h.lookX, elapsedMs) * motionAmplitude;
  const lookY = evalAxis(h.lookY, elapsedMs) * motionAmplitude;
  const lookZ = evalAxis(h.lookZ, elapsedMs) * motionAmplitude;

  camera.lookAt(lookX, lookY, lookZ);
}

/** Exposed for testing — clears the harmonic cache. */
export function _clearHarmonicCache(): void {
  harmonicCache.clear();
  activeSeed = null;
}
