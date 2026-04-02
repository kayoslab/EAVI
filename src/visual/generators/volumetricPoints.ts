import { createPRNG } from '../prng';

export type VolumetricShape =
  | 'sphereVolume'
  | 'shell'
  | 'torusVolume'
  | 'noiseLattice'
  | 'spiralField';

export interface VolumetricConfig {
  shape: VolumetricShape;
  pointCount: number;
  seed: string;
}

export const VOLUMETRIC_SHAPES: readonly VolumetricShape[] = [
  'sphereVolume',
  'shell',
  'torusVolume',
  'noiseLattice',
  'spiralField',
];

export function generateVolumetricPoints(config: VolumetricConfig): Float32Array {
  const { shape, pointCount, seed } = config;
  if (pointCount <= 0) return new Float32Array(0);

  const rng = createPRNG(seed + ':vol:' + shape);
  const positions = new Float32Array(pointCount * 3);

  switch (shape) {
    case 'sphereVolume':
      fillSphereVolume(rng, positions, pointCount);
      break;
    case 'shell':
      fillShell(rng, positions, pointCount);
      break;
    case 'torusVolume':
      fillTorusVolume(rng, positions, pointCount);
      break;
    case 'noiseLattice':
      fillNoiseLattice(rng, positions, pointCount);
      break;
    case 'spiralField':
      fillSpiralField(rng, positions, pointCount);
      break;
  }

  return positions;
}

function fillSphereVolume(rng: () => number, out: Float32Array, count: number): void {
  const radius = 2.5;
  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    // Cube root for uniform volume distribution
    const r = radius * Math.cbrt(rng());
    out[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    out[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    out[i * 3 + 2] = r * Math.cos(phi);
  }
}

function fillShell(rng: () => number, out: Float32Array, count: number): void {
  const baseRadius = 2.0;
  const thickness = 0.3;
  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const r = baseRadius + (rng() - 0.5) * thickness * 2;
    out[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    out[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    out[i * 3 + 2] = r * Math.cos(phi);
  }
}

function fillTorusVolume(rng: () => number, out: Float32Array, count: number): void {
  const majorRadius = 1.8;
  const minorRadius = 0.8;
  for (let i = 0; i < count; i++) {
    const u = rng() * Math.PI * 2;
    const v = rng() * Math.PI * 2;
    // Square root for uniform disk distribution within the tube cross-section
    const r = minorRadius * Math.sqrt(rng());
    out[i * 3] = (majorRadius + r * Math.cos(v)) * Math.cos(u);
    out[i * 3 + 1] = (majorRadius + r * Math.cos(v)) * Math.sin(u);
    out[i * 3 + 2] = r * Math.sin(v);
  }
}

function fillNoiseLattice(rng: () => number, out: Float32Array, count: number): void {
  const gridSize = Math.max(2, Math.ceil(Math.cbrt(count)));
  const spacing = 4.0 / gridSize;
  const displacementScale = spacing * 0.6;

  for (let i = 0; i < count; i++) {
    const ix = i % gridSize;
    const iy = Math.floor(i / gridSize) % gridSize;
    const iz = Math.floor(i / (gridSize * gridSize)) % gridSize;

    const baseX = (ix - gridSize / 2) * spacing;
    const baseY = (iy - gridSize / 2) * spacing;
    const baseZ = (iz - gridSize / 2) * spacing;

    // Sine-based displacement for organic feel
    const dx = Math.sin(baseY * 2.0 + rng() * 3.0) * displacementScale;
    const dy = Math.sin(baseZ * 2.0 + rng() * 3.0) * displacementScale;
    const dz = Math.sin(baseX * 2.0 + rng() * 3.0) * displacementScale;

    out[i * 3] = baseX + dx;
    out[i * 3 + 1] = baseY + dy;
    out[i * 3 + 2] = baseZ + dz;
  }
}

function fillSpiralField(rng: () => number, out: Float32Array, count: number): void {
  const turns = 3 + rng() * 2;
  const maxRadius = 2.5;
  const heightSpread = 3.0;

  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const angle = t * turns * Math.PI * 2;
    const radius = t * maxRadius * (0.3 + 0.7 * rng());
    const height = (t - 0.5) * heightSpread + (rng() - 0.5) * 0.8;

    out[i * 3] = radius * Math.cos(angle) + (rng() - 0.5) * 0.3;
    out[i * 3 + 1] = height;
    out[i * 3 + 2] = radius * Math.sin(angle) + (rng() - 0.5) * 0.3;
  }
}
