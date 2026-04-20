/**
 * Autonomous seeded camera motion.
 *
 * Three motion styles:
 * - default: Lissajous drift — incommensurate sine frequencies create organic,
 *   non-repeating paths that wander without ever retracing the same route.
 * - orbit: slow continuous circular path around centered 3D objects.
 * - flythrough: continuous forward travel through elongated environments.
 *
 * Bass energy gently modulates vertical tilt and sway.
 * motionAmplitude scales drift/tilt (supports prefers-reduced-motion).
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
  // Lissajous drift (default mode) — 3 harmonics per axis with incommensurate periods
  posX: Harmonic[];
  posY: Harmonic[];
  posZ: Harmonic[];
  lookX: Harmonic[];
  lookY: Harmonic[];
  lookZ: Harmonic[];
  // Orbit
  orbitSpeed: number;
  orbitTilt: number;
  orbitTiltSpeed: number;
  // Flythrough sway
  swayAmplitude: number;
  swayFrequency: number;
  swayPhase: number;
  vertSwayPhase: number;
}

const BASE_X = 0;
const BASE_Y = 0;
const BASE_Z = 5;

// Prime-ish periods in ms — incommensurate so combined path never repeats
const PRIME_PERIODS = [67000, 97000, 157000, 83000, 113000, 139000, 71000, 107000, 151000];

const harmonicCache = new Map<string, CameraHarmonics>();
let activeSeed: string | null = null;

function buildHarmonics(seed: string): CameraHarmonics {
  const cached = harmonicCache.get(seed);
  if (cached) return cached;

  const rng = createPRNG(seed + ':camera');

  // Build incommensurate harmonics for Lissajous drift
  function makeLissajous(ampMin: number, ampMax: number, count: number): Harmonic[] {
    const result: Harmonic[] = [];
    for (let i = 0; i < count; i++) {
      // Pick from prime periods with seeded jitter to ensure non-repeating paths
      const basePeriod = PRIME_PERIODS[(Math.floor(rng() * PRIME_PERIODS.length)) % PRIME_PERIODS.length];
      const jitteredPeriod = basePeriod * (0.8 + rng() * 0.4); // ±20% jitter
      result.push({
        amplitude: ampMin + rng() * (ampMax - ampMin),
        frequency: (2 * Math.PI) / jitteredPeriod,
        phase: rng() * Math.PI * 2,
      });
    }
    return result;
  }

  function makeLookHarmonics(ampMin: number, ampMax: number, count: number): Harmonic[] {
    const result: Harmonic[] = [];
    for (let i = 0; i < count; i++) {
      const basePeriod = PRIME_PERIODS[(Math.floor(rng() * PRIME_PERIODS.length)) % PRIME_PERIODS.length];
      const jitteredPeriod = basePeriod * (0.9 + rng() * 0.2);
      result.push({
        amplitude: ampMin + rng() * (ampMax - ampMin),
        frequency: (2 * Math.PI) / jitteredPeriod,
        phase: rng() * Math.PI * 2,
      });
    }
    return result;
  }

  const h: CameraHarmonics = {
    // Lissajous position drift: 3 harmonics per axis, moderate amplitudes
    posX: makeLissajous(0.3, 0.6, 3),
    posY: makeLissajous(0.2, 0.4, 3),
    posZ: makeLissajous(0.15, 0.3, 3),
    // Look target drift: smaller, slower
    lookX: makeLookHarmonics(0.05, 0.12, 3),
    lookY: makeLookHarmonics(0.04, 0.1, 3),
    lookZ: makeLookHarmonics(0.03, 0.06, 3),
    // Orbit: very slow (120-180s per revolution)
    orbitSpeed: (2 * Math.PI) / (120000 + rng() * 60000),
    orbitTilt: 0.2 + rng() * 0.2,
    orbitTiltSpeed: (2 * Math.PI) / (50000 + rng() * 40000),
    // Flythrough: gentle sway
    swayAmplitude: 0.3 + rng() * 0.5,
    swayFrequency: (2 * Math.PI) / (25000 + rng() * 20000),
    swayPhase: rng() * Math.PI * 2,
    vertSwayPhase: rng() * Math.PI * 2,
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
    // --- Orbit mode: cinematic elliptical path around centered 3D objects ---
    const radius = framing?.orbitRadius ?? baseZ;
    const angle = elapsedMs * h.orbitSpeed * 0.001;
    // Slight eccentricity for cinematic feel (not a perfect circle)
    const eccentricity = 0.85 + Math.sin(angle * 0.3) * 0.15; // varies 0.7-1.0
    const yDrift = Math.sin(elapsedMs * h.orbitTiltSpeed * 0.001) * h.orbitTilt * motionAmplitude;
    const bassTilt = bassEnergy * 0.12 * motionAmplitude;

    camera.position.set(
      Math.sin(angle) * radius * eccentricity,
      BASE_Y + yDrift + bassTilt,
      Math.cos(angle) * radius,
    );

    // Look at center with very gentle drift — cinematic "breathing" look target
    const lx = evalAxis(h.lookX, elapsedMs) * motionAmplitude * 0.1;
    const ly = evalAxis(h.lookY, elapsedMs) * motionAmplitude * 0.08;
    const lz = evalAxis(h.lookZ, elapsedMs) * motionAmplitude * 0.08;
    camera.lookAt(lx, ly, lz);

  } else if (mode === 'flythrough') {
    // --- Flythrough mode: continuous forward travel ---
    const speed = framing?.flythroughSpeed ?? 0.5;
    const driftScale = framing?.driftScale ?? [1, 1, 1];

    // Continuous forward motion, cycling through geometry
    // Geometry meshes are positioned at world Z=5.0 (set by triMeshMode),
    // so always start camera at the mesh entrance regardless of targetDistance
    const meshStartZ = 5.0;
    const cycleLength = 80; // geometry wraps every 80 units
    const forwardProgress = (elapsedMs * 0.001 * speed) % cycleLength;
    const camZ = meshStartZ - forwardProgress;

    // Gentle lateral sway — organic, not jarring
    const sway = Math.sin(elapsedMs * h.swayFrequency + h.swayPhase)
      * h.swayAmplitude * motionAmplitude * driftScale[0];
    const vertSway = Math.sin(elapsedMs * h.swayFrequency * 0.6 + h.vertSwayPhase)
      * h.swayAmplitude * 0.25 * motionAmplitude * driftScale[1];

    // Bass: very subtle vertical bob
    const bassBob = bassEnergy * 0.1 * motionAmplitude;

    camera.position.set(
      BASE_X + sway,
      BASE_Y + vertSway + lookOffY + bassBob,
      camZ,
    );

    // Look ahead — shorter for enclosed spaces to avoid looking through walls
    const lookAheadZ = camZ - 20;
    const lx = evalAxis(h.lookX, elapsedMs) * motionAmplitude * 0.2 + lookOffX;
    const ly = evalAxis(h.lookY, elapsedMs) * motionAmplitude * 0.15 + lookOffY;
    camera.lookAt(lx, ly, lookAheadZ);

  } else {
    // --- Default: Lissajous drift — organic, non-repeating wandering ---
    const driftScale = framing?.driftScale ?? [1, 1, 1];
    // Bass gently increases drift amplitude
    const bassScale = 1 + bassEnergy * 0.08;

    const offsetX = evalAxis(h.posX, elapsedMs) * motionAmplitude * bassScale;
    const offsetY = evalAxis(h.posY, elapsedMs) * motionAmplitude * bassScale;
    const offsetZ = evalAxis(h.posZ, elapsedMs) * motionAmplitude * bassScale;

    camera.position.set(
      BASE_X + offsetX * driftScale[0],
      BASE_Y + offsetY * driftScale[1],
      baseZ + offsetZ * driftScale[2],
    );

    const lookX = evalAxis(h.lookX, elapsedMs) * motionAmplitude + lookOffX;
    const lookY = evalAxis(h.lookY, elapsedMs) * motionAmplitude + lookOffY;
    const lookZ = evalAxis(h.lookZ, elapsedMs) * motionAmplitude + lookOffZ;
    camera.lookAt(lookX, lookY, lookZ);
  }
}

/** Exposed for testing — clears the harmonic cache. */
export function _clearHarmonicCache(): void {
  harmonicCache.clear();
  activeSeed = null;
}
