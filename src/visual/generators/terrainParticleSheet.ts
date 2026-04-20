import { createPRNG } from '../prng';
import { hashRandomFromPosition } from './subdivideEdges';

export interface TerrainParticleSheetResult {
  positions: Float32Array;
  randoms: Float32Array;
  pointCount: number;
}

export function generateTerrainParticleSheet(opts: {
  rows: number;
  cols: number;
  pointCount: number;
  seed: string;
  width?: number;
  depth?: number;
  heightScale?: number;
  octaves?: number;
}): TerrainParticleSheetResult {
  const {
    rows,
    cols,
    seed,
    width = 120,
    depth = 160,
    heightScale = 5.0,
    octaves = 3,
  } = opts;

  const rng = createPRNG(seed + '-terrain-fbm');

  // Pre-generate per-octave coefficients for FBM
  const octaveParams: { p1: number; p2: number; p3: number; p4: number; offset: number }[] = [];
  for (let o = 0; o < octaves; o++) {
    octaveParams.push({
      p1: rng() * 3.0 + 1.0,
      p2: rng() * 3.0 + 1.0,
      p3: rng() * 3.0 + 1.0,
      p4: rng() * 3.0 + 1.0,
      offset: rng() * 100,
    });
  }

  function fbm(x: number, z: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 0.05; // base frequency for terrain features
    for (let o = 0; o < octaves; o++) {
      const p = octaveParams[o];
      value +=
        amplitude *
        Math.sin(frequency * x * p.p1 + frequency * z * p.p2 + p.offset) *
        Math.cos(frequency * x * p.p3 + frequency * z * p.p4 + p.offset);
      frequency *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  // Place points on a regular grid — this gives the structured look
  // where you can see rows and columns of points forming the landscape
  const actualRows = Math.max(10, rows);
  const actualCols = Math.max(10, cols);
  const pointCount = actualRows * actualCols;

  const positions = new Float32Array(pointCount * 3);
  const randoms = new Float32Array(pointCount * 3);

  const halfW = width / 2;

  for (let row = 0; row < actualRows; row++) {
    for (let col = 0; col < actualCols; col++) {
      const i = row * actualCols + col;
      // Grid position: x spans left-right, z spans forward into depth
      const x = (col / (actualCols - 1)) * width - halfW;
      const z = -(row / (actualRows - 1)) * depth; // negative z = into screen

      // Vary peak heights: low-frequency envelope creates regions of tall/short hills
      const envelope = 0.4 + 0.6 * Math.abs(Math.sin(x * 0.03 + z * 0.02) * Math.cos(x * 0.02 - z * 0.04));
      const y = fbm(x, z) * heightScale * envelope;

      const base = i * 3;
      positions[base] = x;
      positions[base + 1] = y;
      positions[base + 2] = z;

      const r = hashRandomFromPosition(x, y, z);
      randoms[base] = Math.min(r[0], 0.9999999);
      randoms[base + 1] = Math.min(r[1], 0.9999999);
      randoms[base + 2] = Math.min(r[2], 0.9999999);
    }
  }

  return { positions, randoms, pointCount };
}
