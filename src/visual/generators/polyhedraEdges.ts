import * as THREE from 'three';
import { createPRNG } from '../prng';

export type PolyhedronShape = 'icosahedron' | 'octahedron' | 'dodecahedron' | 'tetrahedron';

const SHAPES: PolyhedronShape[] = ['icosahedron', 'octahedron', 'dodecahedron', 'tetrahedron'];

export interface PolyhedronEdgeData {
  positions: Float32Array;
  randoms: Float32Array;
  edgeCount: number;
}

function createBaseGeometry(shape: PolyhedronShape, radius: number): THREE.BufferGeometry {
  switch (shape) {
    case 'icosahedron': return new THREE.IcosahedronGeometry(radius, 0);
    case 'octahedron': return new THREE.OctahedronGeometry(radius, 0);
    case 'dodecahedron': return new THREE.DodecahedronGeometry(radius, 0);
    case 'tetrahedron': return new THREE.TetrahedronGeometry(radius, 0);
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
  const rng = createPRNG(opts.seed + ':edges');

  const base = createBaseGeometry(opts.shape, radius);
  const edges = new THREE.EdgesGeometry(base, 0);
  const posAttr = edges.getAttribute('position');
  const vertCount = posAttr.count;
  const edgeCount = vertCount / 2;

  const positions = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount * 3; i++) {
    positions[i] = (posAttr.array as Float32Array)[i];
  }

  const randoms = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount * 3; i++) {
    randoms[i] = rng();
  }

  base.dispose();
  edges.dispose();

  return { positions, randoms, edgeCount };
}
