import { createPRNG } from '../prng';

export type VolumetricShape =
  | 'sphereVolume'
  | 'shell'
  | 'torusVolume'
  | 'noiseLattice'
  | 'spiralField'
  | 'crystalCluster'
  | 'geode'
  | 'supershape'
  | 'cliffordTorus'
  | 'gyroid';

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
  'crystalCluster',
  'geode',
  'supershape',
  'cliffordTorus',
  'gyroid',
];

export const PARAMETRIC_SHAPES: readonly VolumetricShape[] = [
  'supershape',
  'cliffordTorus',
  'gyroid',
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
    case 'crystalCluster':
      fillCrystalCluster(rng, positions, pointCount);
      break;
    case 'geode':
      fillGeode(rng, positions, pointCount);
      break;
    case 'supershape':
      fillSupershape(rng, positions, pointCount);
      break;
    case 'cliffordTorus':
      fillCliffordTorus(rng, positions, pointCount);
      break;
    case 'gyroid':
      fillGyroid(rng, positions, pointCount);
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

function fillCrystalCluster(rng: () => number, out: Float32Array, count: number): void {
  const numClusters = 5 + Math.floor(rng() * 4); // 5-8 clusters
  const totalSpread = 2.5;

  // Generate cluster centers
  const centers: { x: number; y: number; z: number; radius: number }[] = [];
  for (let c = 0; c < numClusters; c++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const r = totalSpread * Math.cbrt(rng());
    centers.push({
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta),
      z: r * Math.cos(phi),
      radius: 0.3 + rng() * 0.5,
    });
  }

  for (let i = 0; i < count; i++) {
    const cluster = centers[i % numClusters];
    // Tight angular arrangement around cluster center
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const r = cluster.radius * Math.cbrt(rng());
    out[i * 3] = cluster.x + r * Math.sin(phi) * Math.cos(theta);
    out[i * 3 + 1] = cluster.y + r * Math.sin(phi) * Math.sin(theta);
    out[i * 3 + 2] = cluster.z + r * Math.cos(phi);
  }
}

function fillSupershape(rng: () => number, out: Float32Array, count: number): void {
  const m = 3 + rng() * 5; // m ∈ [3,8]
  const n1 = 0.5 + rng() * 1.5; // n1 ∈ [0.5,2]
  const n2 = 0.5 + rng() * 1.5;
  const n3 = 0.5 + rng() * 1.5;
  const radius = 2.0;

  function superRadius(angle: number): number {
    const a = 1, b = 1;
    const t1 = Math.abs(Math.cos(m * angle / 4) / a);
    const t2 = Math.abs(Math.sin(m * angle / 4) / b);
    const r = Math.pow(Math.pow(t1, n2) + Math.pow(t2, n3), -1 / n1);
    return r;
  }

  for (let i = 0; i < count; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const r1 = superRadius(theta);
    const r2 = superRadius(phi);
    const r = radius * r1 * r2;
    out[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    out[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    out[i * 3 + 2] = r * Math.cos(phi);
  }
}

function fillCliffordTorus(rng: () => number, out: Float32Array, count: number): void {
  const R = 1.5;
  const r = 0.6;
  for (let i = 0; i < count; i++) {
    const u = rng() * Math.PI * 2;
    const v = rng() * Math.PI * 2;
    out[i * 3] = (R + r * Math.cos(v)) * Math.cos(u);
    out[i * 3 + 1] = (R + r * Math.cos(v)) * Math.sin(u);
    out[i * 3 + 2] = r * Math.sin(v);
  }
}

function fillGyroid(rng: () => number, out: Float32Array, count: number): void {
  const scale = 2.0 / Math.PI; // maps [-pi,pi] to ~[-2,2]
  const threshold = 0.15;
  const maxIterations = count * 20; // cap rejection sampling
  let accepted = 0;
  let iterations = 0;

  // Store last accepted point for fallback
  let lastX = 0, lastY = 0, lastZ = 0;

  while (accepted < count && iterations < maxIterations) {
    iterations++;
    const x = (rng() * 2 - 1) * Math.PI;
    const y = (rng() * 2 - 1) * Math.PI;
    const z = (rng() * 2 - 1) * Math.PI;
    const f = Math.cos(x) * Math.sin(y) + Math.cos(y) * Math.sin(z) + Math.cos(z) * Math.sin(x);

    if (Math.abs(f) < threshold) {
      // Newton step along gradient to project onto surface
      const gx = -Math.sin(x) * Math.sin(y) + Math.cos(z) * Math.cos(x);
      const gy = Math.cos(x) * Math.cos(y) - Math.sin(y) * Math.sin(z);
      const gz = Math.cos(y) * Math.cos(z) - Math.sin(z) * Math.sin(x);
      const gradLen2 = gx * gx + gy * gy + gz * gz;

      let px = x, py = y, pz = z;
      if (gradLen2 > 1e-8) {
        const step = f / gradLen2;
        px -= gx * step;
        py -= gy * step;
        pz -= gz * step;
      }

      lastX = px * scale;
      lastY = py * scale;
      lastZ = pz * scale;
      out[accepted * 3] = lastX;
      out[accepted * 3 + 1] = lastY;
      out[accepted * 3 + 2] = lastZ;
      accepted++;
    }
  }

  // Fill remaining with last accepted point (fallback)
  while (accepted < count) {
    out[accepted * 3] = lastX + (rng() - 0.5) * 0.01;
    out[accepted * 3 + 1] = lastY + (rng() - 0.5) * 0.01;
    out[accepted * 3 + 2] = lastZ + (rng() - 0.5) * 0.01;
    accepted++;
  }
}

function fillGeode(rng: () => number, out: Float32Array, count: number): void {
  const shellRadius = 2.0;
  const shellThickness = 0.15;
  const innerFraction = 0.3;
  const shellCount = Math.max(1, Math.round(count * (1 - innerFraction)));
  const innerCount = count - shellCount;

  // Outer faceted shell
  for (let i = 0; i < shellCount; i++) {
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const r = shellRadius + (rng() - 0.5) * shellThickness * 2;
    out[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    out[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    out[i * 3 + 2] = r * Math.cos(phi);
  }

  // Interior scatter
  for (let i = 0; i < innerCount; i++) {
    const idx = shellCount + i;
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const r = 0.3 + rng() * 1.2; // 0.3-1.5 radius
    out[idx * 3] = r * Math.sin(phi) * Math.cos(theta);
    out[idx * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    out[idx * 3 + 2] = r * Math.cos(phi);
  }
}
