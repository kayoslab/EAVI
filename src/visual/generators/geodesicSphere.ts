import * as THREE from 'three';
import type { PolyhedronEdgeData } from './polyhedraEdges';
import { hashRandomFromPosition } from './subdivideEdges';

/**
 * Edge count for a geodesic sphere at a given subdivision level.
 * Three.js IcosahedronGeometry uses linear subdivision: 30 * (level+1)^2
 */
function geodesicEdgeCount(level: number): number {
  return 30 * (level + 1) * (level + 1);
}

/**
 * Returns the highest geodesic subdivision level where edge count <= maxEdges.
 * Capped at 4.
 */
export function maxGeodesicLevel(maxEdges: number): number {
  let level = 0;
  for (let l = 1; l <= 4; l++) {
    if (geodesicEdgeCount(l) <= maxEdges) {
      level = l;
    }
  }
  return level;
}

/**
 * Extract unique edges from non-indexed geometry by treating every 3 vertices as a triangle
 * and deduplicating edges by vertex position.
 */
function extractEdgesFromNonIndexed(posAttr: THREE.BufferAttribute): [number, number][] {
  const vertCount = posAttr.count;
  const faceCount = vertCount / 3;

  // Map each vertex to a canonical index based on position
  const posToIndex = new Map<string, number>();
  const canonicalIndices = new Int32Array(vertCount);
  let nextIdx = 0;

  for (let i = 0; i < vertCount; i++) {
    const key = `${Math.round(posAttr.getX(i) * 1e6)},${Math.round(posAttr.getY(i) * 1e6)},${Math.round(posAttr.getZ(i) * 1e6)}`;
    let idx = posToIndex.get(key);
    if (idx === undefined) {
      idx = nextIdx++;
      posToIndex.set(key, idx);
    }
    canonicalIndices[i] = idx;
  }

  // Extract unique edges
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];

  for (let f = 0; f < faceCount; f++) {
    const base = f * 3;
    const a = canonicalIndices[base];
    const b = canonicalIndices[base + 1];
    const c = canonicalIndices[base + 2];
    const pairs: [number, number][] = [
      [Math.min(a, b), Math.max(a, b)],
      [Math.min(b, c), Math.max(b, c)],
      [Math.min(a, c), Math.max(a, c)],
    ];
    for (const [lo, hi] of pairs) {
      const key = `${lo},${hi}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        // Store original vertex indices for position lookup
        edges.push([base + (canonicalIndices[base] === lo ? 0 : canonicalIndices[base + 1] === lo ? 1 : 2),
                     base + (canonicalIndices[base] === hi ? 0 : canonicalIndices[base + 1] === hi ? 1 : 2)]);
      }
    }
  }

  return edges;
}

export function generateGeodesicEdges(opts: {
  radius?: number;
  level: number;
  seed: string;
}): PolyhedronEdgeData {
  const radius = opts.radius ?? 0.3;
  const level = Math.max(0, Math.min(4, Math.round(opts.level)));

  const ico = new THREE.IcosahedronGeometry(radius, level);
  const posAttr = ico.getAttribute('position') as THREE.BufferAttribute;
  const edges = extractEdgesFromNonIndexed(posAttr);
  const edgeCount = edges.length;
  const vertCount = edgeCount * 2;

  const positions = new Float32Array(vertCount * 3);
  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = edges[e];
    const base = e * 6;
    positions[base] = posAttr.getX(a);
    positions[base + 1] = posAttr.getY(a);
    positions[base + 2] = posAttr.getZ(a);
    positions[base + 3] = posAttr.getX(b);
    positions[base + 4] = posAttr.getY(b);
    positions[base + 5] = posAttr.getZ(b);
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

  ico.dispose();

  return { positions, randoms, edgeCount };
}
