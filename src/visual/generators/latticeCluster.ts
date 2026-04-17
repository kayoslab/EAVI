/**
 * Lattice-aligned faceted crystal cluster generator.
 * US-085: Places hexagonal bipyramid crystals on HCP or BCC lattice nodes.
 */

import { createPRNG } from '../prng';

export interface LatticeClusterConfig {
  nodeCount: number;
  pointsPerCrystal: number;
  latticeType: 'hex' | 'bcc';
  latticeSpacing: number;
  crystalHeight: number;
  crystalRadius: number;
  seed: string;
}

export interface LatticeClusterResult {
  positions: Float32Array;
  latticePositions: Float32Array;
  facetNormals: Float32Array;
}

/**
 * Generate lattice node positions on an HCP or BCC lattice within a bounding sphere.
 */
function generateLatticeNodes(
  count: number,
  spacing: number,
  latticeType: 'hex' | 'bcc',
  rng: () => number,
): Array<[number, number, number]> {
  const nodes: Array<[number, number, number]> = [];

  if (count === 1) {
    nodes.push([0, 0, 0]);
    return nodes;
  }

  // Generate candidate lattice positions, then pick closest N to origin
  const candidates: Array<[number, number, number]> = [];
  const gridSize = Math.ceil(Math.cbrt(count * 4)); // generous grid

  for (let ix = -gridSize; ix <= gridSize; ix++) {
    for (let iy = -gridSize; iy <= gridSize; iy++) {
      for (let iz = -gridSize; iz <= gridSize; iz++) {
        let x: number, y: number, z: number;

        if (latticeType === 'hex') {
          // Hexagonal close-packed
          x = ix * spacing + (iy % 2 === 0 ? 0 : spacing * 0.5);
          y = iy * spacing * 0.866; // sqrt(3)/2
          z = iz * spacing + (iy % 2 === 0 ? 0 : spacing * 0.289); // slight z offset for HCP
        } else {
          // BCC: body-centered cubic
          x = ix * spacing;
          y = iy * spacing;
          z = iz * spacing;
          candidates.push([x, y, z]);
          // Body center
          candidates.push([
            x + spacing * 0.5,
            y + spacing * 0.5,
            z + spacing * 0.5,
          ]);
          continue;
        }

        candidates.push([x, y, z]);
      }
    }
  }

  // Sort by distance from origin, pick closest N
  candidates.sort((a, b) => {
    const da = a[0] * a[0] + a[1] * a[1] + a[2] * a[2];
    const db = b[0] * b[0] + b[1] * b[1] + b[2] * b[2];
    return da - db;
  });

  // Add jitter (5-10% of spacing)
  for (let i = 0; i < Math.min(count, candidates.length); i++) {
    const [cx, cy, cz] = candidates[i];
    const jitter = spacing * 0.075;
    nodes.push([
      cx + (rng() - 0.5) * 2 * jitter,
      cy + (rng() - 0.5) * 2 * jitter,
      cz + (rng() - 0.5) * 2 * jitter,
    ]);
  }

  return nodes;
}

/**
 * Hexagonal bipyramid facet definitions.
 * 6 upper triangular facets + 6 lower = 12 total.
 * Each facet is defined by its outward normal.
 */
function getHexBipyramidFacets(
  height: number,
  radius: number,
): Array<{ normal: [number, number, number]; vertices: Array<[number, number, number]> }> {
  const facets: Array<{ normal: [number, number, number]; vertices: Array<[number, number, number]> }> = [];

  // 6 hex base vertices
  const baseVerts: Array<[number, number, number]> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    baseVerts.push([Math.cos(angle) * radius, 0, Math.sin(angle) * radius]);
  }

  const topApex: [number, number, number] = [0, height * 0.5, 0];
  const bottomApex: [number, number, number] = [0, -height * 0.5, 0];

  for (let i = 0; i < 6; i++) {
    const v0 = baseVerts[i];
    const v1 = baseVerts[(i + 1) % 6];

    // Upper facet: apex, v0, v1
    {
      const e1 = [v0[0] - topApex[0], v0[1] - topApex[1], v0[2] - topApex[2]];
      const e2 = [v1[0] - topApex[0], v1[1] - topApex[1], v1[2] - topApex[2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1];
      const ny = e1[2] * e2[0] - e1[0] * e2[2];
      const nz = e1[0] * e2[1] - e1[1] * e2[0];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      // Ensure normal points outward (y component should be positive for upper facets)
      const sign = ny / len > 0 ? 1 : -1;
      facets.push({
        normal: [(nx / len) * sign, (ny / len) * sign, (nz / len) * sign],
        vertices: [topApex, v0, v1],
      });
    }

    // Lower facet: bottom apex, v1, v0
    {
      const e1 = [v1[0] - bottomApex[0], v1[1] - bottomApex[1], v1[2] - bottomApex[2]];
      const e2 = [v0[0] - bottomApex[0], v0[1] - bottomApex[1], v0[2] - bottomApex[2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1];
      const ny = e1[2] * e2[0] - e1[0] * e2[2];
      const nz = e1[0] * e2[1] - e1[1] * e2[0];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const sign = ny / len < 0 ? 1 : -1;
      facets.push({
        normal: [(nx / len) * sign, (ny / len) * sign, (nz / len) * sign],
        vertices: [bottomApex, v1, v0],
      });
    }
  }

  return facets;
}

/**
 * Distribute points on the surface of a triangular facet with slight inward scatter.
 */
function sampleFacetPoint(
  v0: [number, number, number],
  v1: [number, number, number],
  v2: [number, number, number],
  rng: () => number,
): [number, number, number] {
  // Random barycentric coordinates
  let u = rng();
  let v = rng();
  if (u + v > 1) {
    u = 1 - u;
    v = 1 - v;
  }
  const w = 1 - u - v;

  // Surface point
  const x = v0[0] * w + v1[0] * u + v2[0] * v;
  const y = v0[1] * w + v1[1] * u + v2[1] * v;
  const z = v0[2] * w + v1[2] * u + v2[2] * v;

  // Slight inward scatter for volume (toward centroid)
  const cx = (v0[0] + v1[0] + v2[0]) / 3;
  const cy = (v0[1] + v1[1] + v2[1]) / 3;
  const cz = (v0[2] + v1[2] + v2[2]) / 3;
  const scatter = rng() * 0.15;

  return [
    x + (cx - x) * scatter,
    y + (cy - y) * scatter,
    z + (cz - z) * scatter,
  ];
}

/**
 * Apply a shared rotation quaternion to a point.
 */
function rotatePoint(
  p: [number, number, number],
  cosA: number,
  sinA: number,
  cosB: number,
  sinB: number,
): [number, number, number] {
  // Rotate around Y axis by angle A
  let x = p[0] * cosA - p[2] * sinA;
  let y = p[1];
  let z = p[0] * sinA + p[2] * cosA;

  // Rotate around X axis by angle B
  const y2 = y * cosB - z * sinB;
  const z2 = y * sinB + z * cosB;

  return [x, y2, z2];
}

export function generateLatticeCluster(config: LatticeClusterConfig): LatticeClusterResult {
  const { nodeCount, pointsPerCrystal, latticeType, latticeSpacing, crystalHeight, crystalRadius, seed } = config;
  const rng = createPRNG(seed);

  const totalPoints = nodeCount * pointsPerCrystal;
  const positions = new Float32Array(totalPoints * 3);
  const latticePositions = new Float32Array(totalPoints * 3);
  const facetNormals = new Float32Array(totalPoints * 3);

  // Generate lattice nodes
  const nodes = generateLatticeNodes(nodeCount, latticeSpacing, latticeType, rng);

  // Shared orientation: a single seeded rotation applied to all crystals
  const sharedAngleY = rng() * Math.PI * 2;
  const sharedAngleX = (rng() - 0.5) * 0.3; // slight tilt

  // Generate facets for the crystal shape
  const facets = getHexBipyramidFacets(crystalHeight, crystalRadius);

  let pointIdx = 0;

  for (let n = 0; n < nodeCount; n++) {
    const node = nodes[n];

    // Per-crystal small tilt (±5°)
    const tiltY = (rng() - 0.5) * 0.175; // ~5 degrees
    const tiltX = (rng() - 0.5) * 0.175;
    const cosTY = Math.cos(sharedAngleY + tiltY);
    const sinTY = Math.sin(sharedAngleY + tiltY);
    const cosTX = Math.cos(sharedAngleX + tiltX);
    const sinTX = Math.sin(sharedAngleX + tiltX);

    for (let p = 0; p < pointsPerCrystal; p++) {
      // Pick a random facet (weighted equally)
      const facetIdx = Math.floor(rng() * facets.length) % facets.length;
      const facet = facets[facetIdx];

      // Sample point on facet surface
      const localPoint = sampleFacetPoint(
        facet.vertices[0],
        facet.vertices[1],
        facet.vertices[2],
        rng,
      );

      // Apply shared + per-crystal rotation
      const rotated = rotatePoint(localPoint, cosTY, sinTY, cosTX, sinTX);

      // Rotate normal too
      const rotNormal = rotatePoint(facet.normal, cosTY, sinTY, cosTX, sinTX);
      const nLen = Math.sqrt(rotNormal[0] ** 2 + rotNormal[1] ** 2 + rotNormal[2] ** 2) || 1;

      // World position = lattice node + rotated local
      const idx = pointIdx * 3;
      positions[idx] = node[0] + rotated[0];
      positions[idx + 1] = node[1] + rotated[1];
      positions[idx + 2] = node[2] + rotated[2];

      latticePositions[idx] = node[0];
      latticePositions[idx + 1] = node[1];
      latticePositions[idx + 2] = node[2];

      facetNormals[idx] = rotNormal[0] / nLen;
      facetNormals[idx + 1] = rotNormal[1] / nLen;
      facetNormals[idx + 2] = rotNormal[2] / nLen;

      pointIdx++;
    }
  }

  return { positions, latticePositions, facetNormals };
}
