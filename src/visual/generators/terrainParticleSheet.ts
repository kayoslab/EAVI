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
    rows: _rows,
    cols: _cols,
    pointCount,
    seed,
    width = 40,
    depth = 30,
    heightScale = 8.0,
    octaves = 3,
  } = opts;
  void _rows;
  void _cols;

  const rng = createPRNG(seed + '-terrain-fbm');

  // Pre-generate per-octave coefficients for FBM (same approach as old generator)
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
    let frequency = 0.06; // low base frequency for broad rolling hills
    for (let o = 0; o < octaves; o++) {
      const p = octaveParams[o];
      value +=
        amplitude *
        Math.sin(frequency * x * p.p1 + frequency * z * p.p2 + p.offset) *
        Math.cos(frequency * x * p.p3 + frequency * z * p.p4 + p.offset);
      frequency *= 2.2;
      amplitude *= 0.45;
    }
    return value;
  }

  // Use a separate PRNG stream for point placement (so FBM coefficients stay deterministic)
  const placeRng = createPRNG(seed + '-terrain-place');

  const positions = new Float32Array(pointCount * 3);
  const randoms = new Float32Array(pointCount * 3);

  const halfW = width / 2;
  const halfD = depth / 2;

  for (let i = 0; i < pointCount; i++) {
    // Random position across the full grid extent with jitter
    const x = placeRng() * width - halfW;
    const z = placeRng() * depth - halfD;
    const y = fbm(x, z) * heightScale;

    const base = i * 3;
    positions[base] = x;
    positions[base + 1] = y;
    positions[base + 2] = z;

    const r = hashRandomFromPosition(x, y, z);
    randoms[base] = Math.min(r[0], 0.9999999);
    randoms[base + 1] = Math.min(r[1], 0.9999999);
    randoms[base + 2] = Math.min(r[2], 0.9999999);
  }

  return { positions, randoms, pointCount };
}
