/**
 * Topology instance scattering: generates scattered topology instances
 * in 3D space with seeded positions, orientations, and scales.
 */

import type { TopologyDef } from './topologyDefinitions';
import { pickTopologies } from './topologyDefinitions';

export interface TopologyInstance {
  def: TopologyDef;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: number;
}

/**
 * Generate a unit quaternion from seeded random values.
 * Uses the subgroup algorithm for uniform random rotations.
 */
function randomQuaternion(rng: () => number): [number, number, number, number] {
  const u1 = rng();
  const u2 = rng() * Math.PI * 2;
  const u3 = rng() * Math.PI * 2;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return [
    a * Math.sin(u2),
    a * Math.cos(u2),
    b * Math.sin(u3),
    b * Math.cos(u3),
  ];
}

/**
 * Generate a random point inside a sphere of given radius.
 */
function randomPointInSphere(rng: () => number, radius: number): [number, number, number] {
  // Rejection sampling for uniform distribution in sphere
  let x: number, y: number, z: number;
  do {
    x = (rng() * 2 - 1);
    y = (rng() * 2 - 1);
    z = (rng() * 2 - 1);
  } while (x * x + y * y + z * z > 1);
  return [x * radius, y * radius, z * radius];
}

const MAX_PLACEMENT_RETRIES = 50;
const MIN_SEPARATION = 0.8;

export function generateTopologyInstances(
  rng: () => number,
  count: number,
  spreadRadius: number,
): TopologyInstance[] {
  const defs = pickTopologies(rng, count);
  const instances: TopologyInstance[] = [];

  for (let i = 0; i < defs.length; i++) {
    let position: [number, number, number] = [0, 0, 0];
    let placed = false;

    for (let attempt = 0; attempt < MAX_PLACEMENT_RETRIES; attempt++) {
      position = randomPointInSphere(rng, spreadRadius);
      let tooClose = false;
      for (const existing of instances) {
        const dx = position[0] - existing.position[0];
        const dy = position[1] - existing.position[1];
        const dz = position[2] - existing.position[2];
        if (dx * dx + dy * dy + dz * dz < MIN_SEPARATION * MIN_SEPARATION) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        placed = true;
        break;
      }
    }

    // Graceful degradation: place at last attempted position if retry cap hit
    if (!placed) {
      // position already holds the last attempt
    }

    const quaternion = randomQuaternion(rng);
    const scale = 0.3 + rng() * 0.4; // 0.3–0.7

    instances.push({ def: defs[i], position, quaternion, scale });
  }

  return instances;
}

/**
 * Apply quaternion rotation to a 3D point.
 */
function rotateByQuaternion(
  px: number, py: number, pz: number,
  qx: number, qy: number, qz: number, qw: number,
): [number, number, number] {
  // q * p * q^-1
  const ix = qw * px + qy * pz - qz * py;
  const iy = qw * py + qz * px - qx * pz;
  const iz = qw * pz + qx * py - qy * px;
  const iw = -qx * px - qy * py - qz * pz;

  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

export function flattenInstances(instances: TopologyInstance[]): {
  positions: Float32Array;
  edges: [number, number][];
} {
  let totalVertices = 0;
  for (const inst of instances) {
    totalVertices += inst.def.vertices.length;
  }

  const positions = new Float32Array(totalVertices * 3);
  const edges: [number, number][] = [];
  let vertexOffset = 0;

  for (const inst of instances) {
    const [qx, qy, qz, qw] = inst.quaternion;
    const [ox, oy, oz] = inst.position;
    const s = inst.scale;

    for (let v = 0; v < inst.def.vertices.length; v++) {
      const [vx, vy, vz] = inst.def.vertices[v];
      // Scale, rotate, translate
      const scaled_x = vx * s;
      const scaled_y = vy * s;
      const scaled_z = vz * s;
      const [rx, ry, rz] = rotateByQuaternion(scaled_x, scaled_y, scaled_z, qx, qy, qz, qw);
      const idx = (vertexOffset + v) * 3;
      positions[idx] = rx + ox;
      positions[idx + 1] = ry + oy;
      positions[idx + 2] = rz + oz;
    }

    for (const [a, b] of inst.def.edges) {
      edges.push([vertexOffset + a, vertexOffset + b]);
    }

    vertexOffset += inst.def.vertices.length;
  }

  return { positions, edges };
}
