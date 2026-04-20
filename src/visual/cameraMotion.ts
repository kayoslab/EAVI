/**
 * Autonomous seeded camera motion.
 *
 * Three motion styles:
 * - default: layered sine harmonics (gentle drift around base position)
 * - orbit: circular path around centered objects, revealing 3D form
 * - flythrough: continuous forward travel through elongated environments
 *
 * Bass energy modulates orbit radius / travel sway.
 * motionAmplitude scales all displacement (supports prefers-reduced-motion).
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
  posY: Harmonic[];
  posZ: Harmonic[];
  lookX: Harmonic[];
  lookY: Harmonic[];
  lookZ: Harmonic[];
  // Orbit-specific
  orbitSpeed: number;    // radians per second
  orbitTilt: number;     // vertical tilt amplitude
  orbitTiltSpeed: number;
  // Flythrough-specific
  swayAmplitude: number;
  swayFrequency: number;
  swayPhase: number;
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
    // Position harmonics: periods 60-240s, amplitudes 0.1-0.2 per harmonic (calm drift)
    posX: makeHarmonics(0.1, 0.2, 60000, 240000, 2),
    posY: makeHarmonics(0.1, 0.2, 60000, 240000, 2),
    posZ: makeHarmonics(0.1, 0.2, 60000, 200000, 3),
    // Look-target harmonics: periods 80-200s, amplitudes 0.05-0.15
    lookX: makeHarmonics(0.05, 0.15, 80000, 200000, 2),
    lookY: makeHarmonics(0.05, 0.15, 80000, 200000, 2),
    lookZ: makeHarmonics(0.03, 0.08, 100000, 200000, 2),
    // Orbit: slow rotation (40-80s full revolution), gentle vertical tilt
    orbitSpeed: (2 * Math.PI) / (40000 + rng() * 40000),
    orbitTilt: 0.3 + rng() * 0.4, // 0.3-0.7 units vertical range
    orbitTiltSpeed: (2 * Math.PI) / (25000 + rng() * 35000),
    // Flythrough: gentle lateral sway
    swayAmplitude: 1.0 + rng() * 1.5,
    swayFrequency: (2 * Math.PI) / (15000 + rng() * 20000),
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
    // --- Orbit mode: circle around centered objects ---
    const radius = (framing?.orbitRadius ?? baseZ) * (1 + bassEnergy * 0.08);
    const angle = elapsedMs * h.orbitSpeed * 0.001;
    const yDrift = Math.sin(elapsedMs * h.orbitTiltSpeed * 0.001) * h.orbitTilt * motionAmplitude;

    camera.position.set(
      Math.sin(angle) * radius * motionAmplitude + BASE_X,
      BASE_Y + yDrift + lookOffY * 0.3,
      Math.cos(angle) * radius * motionAmplitude + lookOffZ,
    );

    // Look at center with gentle harmonic drift
    const lx = evalAxis(h.lookX, elapsedMs) * motionAmplitude * 0.3 + lookOffX;
    const ly = evalAxis(h.lookY, elapsedMs) * motionAmplitude * 0.2 + lookOffY * 0.1;
    const lz = evalAxis(h.lookZ, elapsedMs) * motionAmplitude * 0.2;
    camera.lookAt(lx, ly, lz);

  } else if (mode === 'flythrough') {
    // --- Flythrough mode: travel forward through elongated environments ---
    const speed = framing?.flythroughSpeed ?? 0.5;
    const driftScale = framing?.driftScale ?? [1, 1, 1];

    // Continuous forward motion (wrapping via modulo to stay in geometry range)
    // The geometry extends from z=5 (near) to z=-155 (far, depth=160)
    // Camera travels forward slowly, cycling through the geometry
    const forwardProgress = (elapsedMs * 0.001 * speed) % 80; // cycle every 80 units
    const camZ = baseZ - forwardProgress;

    // Lateral sway: gentle sine for organic feel
    const sway = Math.sin(elapsedMs * h.swayFrequency + h.swayPhase)
      * h.swayAmplitude * motionAmplitude * driftScale[0];
    const vertSway = Math.sin(elapsedMs * h.swayFrequency * 0.7 + h.swayPhase + 1.5)
      * h.swayAmplitude * 0.3 * motionAmplitude * driftScale[1];

    // Bass adds a subtle push outward from center
    const bassPush = bassEnergy * 0.3 * motionAmplitude;

    camera.position.set(
      BASE_X + sway + bassPush * Math.sin(elapsedMs * 0.0003),
      BASE_Y + vertSway + lookOffY,
      camZ,
    );

    // Look ahead in the direction of travel, with gentle drift
    const lookAheadZ = camZ - 15; // look 15 units ahead
    const lx = evalAxis(h.lookX, elapsedMs) * motionAmplitude * 0.5 + lookOffX;
    const ly = evalAxis(h.lookY, elapsedMs) * motionAmplitude * 0.3 + lookOffY;
    camera.lookAt(lx, ly, lookAheadZ);

  } else {
    // --- Default mode: gentle harmonic drift (original behavior) ---
    const bassScale = 1 + bassEnergy * 0.05;
    const driftScale = framing?.driftScale ?? [1, 1, 1];

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
