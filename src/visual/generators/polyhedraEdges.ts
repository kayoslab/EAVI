import * as THREE from 'three';
import { createPRNG } from '../prng';
import type { QualityTier } from '../quality';
import { hashRandomFromPosition } from './subdivideEdges';

export type PolyhedronShape = 'icosahedron' | 'octahedron' | 'dodecahedron' | 'tetrahedron' | 'cube';

export type GenerationMode = 'plain' | 'geodesic' | 'nested' | 'dual';

const SHAPES: PolyhedronShape[] = ['icosahedron', 'octahedron', 'dodecahedron', 'tetrahedron'];

const GENERATION_MODES: GenerationMode[] = ['plain', 'geodesic', 'nested', 'dual'];

export interface PolyhedronEdgeData {
  positions: Float32Array;
  randoms: Float32Array;
  edgeCount: number;
}

export function selectGenerationMode(seed: string, tier: QualityTier): GenerationMode {
  if (tier === 'low') return 'plain';
  const rng = createPRNG(seed + ':genmode');
  const idx = Math.floor(rng() * GENERATION_MODES.length) % GENERATION_MODES.length;
  return GENERATION_MODES[idx];
}

export function createBaseGeometry(shape: PolyhedronShape, radius: number): THREE.BufferGeometry {
  switch (shape) {
    case 'icosahedron': return new THREE.IcosahedronGeometry(radius, 0);
    case 'octahedron': return new THREE.OctahedronGeometry(radius, 0);
    case 'dodecahedron': return new THREE.DodecahedronGeometry(radius, 0);
    case 'tetrahedron': return new THREE.TetrahedronGeometry(radius, 0);
    case 'cube': return new THREE.BoxGeometry(radius * 2, radius * 2, radius * 2);
  }
}

export function selectShape(seed: string): PolyhedronShape {
  const rng = createPRNG(seed);
  const idx = Math.floor(rng() * SHAPES.length) % SHAPES.length;
  return SHAPES[idx];
}

export function generatePolyhedronEdges(opts: {
  shape: PolyhedronShape;
  radius?: number;
  seed: string;
}): PolyhedronEdgeData {
  const radius = opts.radius ?? 0.3;

  const base = createBaseGeometry(opts.shape, radius);
  // Use threshold=1 to filter out internal triangulation edges
  // (BoxGeometry face diagonals, DodecahedronGeometry pentagon subdivisions)
  const edges = new THREE.EdgesGeometry(base, 1);
  const posAttr = edges.getAttribute('position');
  const vertCount = posAttr.count;
  const edgeCount = vertCount / 2;

  const positions = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount * 3; i++) {
    positions[i] = (posAttr.array as Float32Array)[i];
  }

  const randoms = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount; i++) {
    const [r0, r1, r2] = hashRandomFromPosition(
      positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
    );
    randoms[i * 3] = r0;
    randoms[i * 3 + 1] = r1;
    randoms[i * 3 + 2] = r2;
  }

  base.dispose();
  edges.dispose();

  return { positions, randoms, edgeCount };
}
