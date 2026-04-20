/**
 * Autonomous seeded camera motion.
 *
 * Three motion styles:
 * - default: Lissajous drift — incommensurate sine frequencies create organic,
 *   non-repeating horizontal paths. Y stays nearly fixed (no vertical bobbing).
 * - orbit: slow continuous circular path in the XZ plane around centered 3D objects.
 *   Camera stays at a fixed height — NO vertical bobbing.
 * - flythrough: continuous forward travel through elongated environments.
 *   Camera stays at a fixed height above the geometry floor.
 *
 * Bass energy gently modulates lateral sway amplitude.
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
  swayAmplitude: number;
  swayFrequency: number;
  swayPhase: number;
}

const BASE_X = 0;
const BASE_Z = 5;

const PRIME_PERIODS = [67000, 97000, 157000, 83000, 113000, 139000, 71000, 107000, 151000];

const harmonicCache = new Map<string, CameraHarmonics>();
let activeSeed: string | null = null;

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
    // Horizontal drift only — no Y harmonics (camera stays at fixed height)
    posX: makeLissajous(0.3, 0.6, 3),
    posZ: makeLissajous(0.15, 0.3, 3),
    // Look target horizontal drift
    lookX: makeLissajous(0.05, 0.12, 3),
    lookZ: makeLissajous(0.03, 0.06, 3),
    // Orbit: very slow (120-180s per revolution)
    orbitSpeed: (2 * Math.PI) / (120000 + rng() * 60000),
    // Flythrough sway (horizontal only)
    swayAmplitude: 0.3 + rng() * 0.5,
    swayFrequency: (2 * Math.PI) / (25000 + rng() * 20000),
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
}

export function updateCamera(
  camera: PerspectiveCamera,
  elapsedMs: number,
  bassEnergy: number,
  motionAmplitude: number,
  framing?: FramingConfig,
): void {
  if (!activeSeed) return;
  const h = harmonicCache.get(activeSeed);
  if (!h) return;

  const mode = framing?.cameraMode;
  const baseZ = framing?.targetDistance ?? BASE_Z;
  const lookOffX = framing?.lookOffset?.[0] ?? 0;
  const lookOffY = framing?.lookOffset?.[1] ?? 0;
  const lookOffZ = framing?.lookOffset?.[2] ?? 0;

  if (mode === 'orbit') {
    // --- Orbit: flat circle in XZ plane, fixed Y height ---
    const radius = framing?.orbitRadius ?? baseZ;
    const angle = elapsedMs * h.orbitSpeed * 0.001;
    // Slight eccentricity for cinematic feel
    const eccentricity = 0.9 + Math.sin(angle * 0.3) * 0.1;

    camera.position.set(
      Math.sin(angle) * radius * eccentricity,
      lookOffY,  // fixed height, no bobbing
      Math.cos(angle) * radius,
    );

    // Look at center
    const lx = evalAxis(h.lookX, elapsedMs) * motionAmplitude * 0.08;
    const ly = 0;
    const lz = evalAxis(h.lookZ, elapsedMs) * motionAmplitude * 0.06;
    camera.lookAt(lx, ly, lz);

  } else if (mode === 'flythrough') {
    // --- Flythrough: travel forward, fixed Y, horizontal sway only ---
    const speed = framing?.flythroughSpeed ?? 0.5;
    const driftScale = framing?.driftScale ?? [1, 1, 1];

    const meshStartZ = 5.0;
    const cycleLength = framing?.flythroughCycleLength ?? 80;
    const forwardProgress = (elapsedMs * 0.001 * speed) % cycleLength;
    const camZ = meshStartZ - forwardProgress;

    // Horizontal sway only — no vertical movement
    const sway = Math.sin(elapsedMs * h.swayFrequency + h.swayPhase)
      * h.swayAmplitude * motionAmplitude * driftScale[0]
      * (1 + bassEnergy * 0.1);

    camera.position.set(
      BASE_X + sway,
      lookOffY,  // fixed height from framing config, no bobbing
      camZ,
    );

    // Look straight ahead
    const lookAheadZ = camZ - 20;
    const lx = evalAxis(h.lookX, elapsedMs) * motionAmplitude * 0.15 + lookOffX;
    camera.lookAt(lx, lookOffY * 0.5, lookAheadZ);

  } else {
    // --- Default: Lissajous drift in XZ plane, fixed Y ---
    const driftScale = framing?.driftScale ?? [1, 1, 1];
    const bassScale = 1 + bassEnergy * 0.06;

    const offsetX = evalAxis(h.posX, elapsedMs) * motionAmplitude * bassScale;
    const offsetZ = evalAxis(h.posZ, elapsedMs) * motionAmplitude * bassScale;

    camera.position.set(
      BASE_X + offsetX * driftScale[0],
      lookOffY,  // fixed height, no bobbing
      baseZ + offsetZ * driftScale[2],
    );

    const lookX = evalAxis(h.lookX, elapsedMs) * motionAmplitude + lookOffX;
    const lookZ = evalAxis(h.lookZ, elapsedMs) * motionAmplitude + lookOffZ;
    camera.lookAt(lookX, lookOffY * 0.3, lookZ);
  }
}

/** Exposed for testing — clears the harmonic cache. */
export function _clearHarmonicCache(): void {
  harmonicCache.clear();
  activeSeed = null;
}
