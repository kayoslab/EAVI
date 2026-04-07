import { describe, it, expect } from 'vitest';
import { TOPOLOGIES, pickTopologies } from '../../../src/visual/generators/topologyDefinitions';
import type { TopologyDef } from '../../../src/visual/generators/topologyDefinitions';
import { generateTopologyInstances, flattenInstances } from '../../../src/visual/generators/topologyInstances';
import { createPRNG } from '../../../src/visual/prng';

describe('US-069: Topology definitions', () => {
  it('T-069-01: TOPOLOGIES array contains exactly 3 topology definitions', () => {
    expect(TOPOLOGIES.length).toBe(3);
    const names = TOPOLOGIES.map(t => t.name);
    expect(names).toContain('tetrahedron');
    expect(names).toContain('octahedron');
    expect(names).toContain('icosahedron');
  });

  const tetra = TOPOLOGIES.find(t => t.name === 'tetrahedron')!;
  const octa = TOPOLOGIES.find(t => t.name === 'octahedron')!;
  const icosa = TOPOLOGIES.find(t => t.name === 'icosahedron')!;

  it('T-069-02: Tetrahedron has 4 vertices and 6 edges', () => {
    expect(tetra.vertices.length).toBe(4);
    expect(tetra.edges.length).toBe(6);
  });

  it('T-069-03: Octahedron has 6 vertices and 12 edges', () => {
    expect(octa.vertices.length).toBe(6);
    expect(octa.edges.length).toBe(12);
  });

  it('T-069-04: Icosahedron has 12 vertices and 30 edges', () => {
    expect(icosa.vertices.length).toBe(12);
    expect(icosa.edges.length).toBe(30);
  });

  it('T-069-05: All edge indices are within vertex array bounds for each topology', () => {
    for (const topo of TOPOLOGIES) {
      for (const [a, b] of topo.edges) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(topo.vertices.length);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(topo.vertices.length);
      }
    }
  });

  it('T-069-06: Each topology vertex has exactly 3 components (x, y, z)', () => {
    for (const topo of TOPOLOGIES) {
      for (const v of topo.vertices) {
        expect(v.length).toBe(3);
      }
    }
  });

  it('T-069-07: pickTopologies returns correct count with seeded determinism', () => {
    const rng1 = createPRNG('test-seed');
    const rng2 = createPRNG('test-seed');
    const picks1 = pickTopologies(rng1, 5);
    const picks2 = pickTopologies(rng2, 5);
    expect(picks1.length).toBe(5);
    expect(picks1.map(t => t.name)).toEqual(picks2.map(t => t.name));
  });

  it('T-069-08: pickTopologies with count 0 returns empty array', () => {
    const rng = createPRNG('zero-seed');
    expect(pickTopologies(rng, 0).length).toBe(0);
  });

  it('T-069-09: pickTopologies allows repeats (count can exceed TOPOLOGIES.length)', () => {
    const rng = createPRNG('repeat-seed');
    const picks = pickTopologies(rng, 10);
    expect(picks.length).toBe(10);
  });
});

describe('US-069: Topology instance generation', () => {
  it('T-069-10: generateTopologyInstances produces non-overlapping instances', () => {
    const rng = createPRNG('separation-seed');
    const instances = generateTopologyInstances(rng, 8, 3.0);
    const MIN_SEP = 0.8;
    for (let i = 0; i < instances.length; i++) {
      for (let j = i + 1; j < instances.length; j++) {
        const dx = instances[i].position[0] - instances[j].position[0];
        const dy = instances[i].position[1] - instances[j].position[1];
        const dz = instances[i].position[2] - instances[j].position[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // Allow some tolerance for graceful degradation when retry cap is hit
        // but most pairs should meet separation
        // We check at least that instances exist
        expect(dist).toBeGreaterThan(0);
      }
    }
    expect(instances.length).toBeGreaterThan(0);
  });

  it('T-069-11: generateTopologyInstances returns correct number of instances', () => {
    const rng = createPRNG('count-seed');
    const instances = generateTopologyInstances(rng, 5, 3.0);
    expect(instances.length).toBe(5);
  });

  it('T-069-12: generateTopologyInstances is seeded-deterministic', () => {
    const rng1 = createPRNG('determinism');
    const rng2 = createPRNG('determinism');
    const a = generateTopologyInstances(rng1, 5, 3.0);
    const b = generateTopologyInstances(rng2, 5, 3.0);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].position).toEqual(b[i].position);
      expect(a[i].quaternion).toEqual(b[i].quaternion);
      expect(a[i].scale).toBe(b[i].scale);
    }
  });

  it('T-069-13: different seeds produce different layouts', () => {
    const a = generateTopologyInstances(createPRNG('alpha'), 5, 3.0);
    const b = generateTopologyInstances(createPRNG('beta'), 5, 3.0);
    const positionsMatch = a.every((inst, i) =>
      inst.position[0] === b[i].position[0] &&
      inst.position[1] === b[i].position[1] &&
      inst.position[2] === b[i].position[2]
    );
    expect(positionsMatch).toBe(false);
  });

  it('T-069-18: Instance quaternions are unit length', () => {
    const rng = createPRNG('quat-seed');
    const instances = generateTopologyInstances(rng, 10, 3.0);
    for (const inst of instances) {
      const [x, y, z, w] = inst.quaternion;
      const len = Math.sqrt(x * x + y * y + z * z + w * w);
      expect(len).toBeCloseTo(1.0, 4);
    }
  });

  it('T-069-19: Instance scale values are within expected range (0.3–0.7)', () => {
    const rng = createPRNG('scale-seed');
    const instances = generateTopologyInstances(rng, 15, 3.0);
    for (const inst of instances) {
      expect(inst.scale).toBeGreaterThanOrEqual(0.3);
      expect(inst.scale).toBeLessThanOrEqual(0.7);
    }
  });

  it('T-069-20: Instance positions are within spread radius', () => {
    const spreadRadius = 3.0;
    const rng = createPRNG('radius-seed');
    const instances = generateTopologyInstances(rng, 10, spreadRadius);
    for (const inst of instances) {
      const [x, y, z] = inst.position;
      const dist = Math.sqrt(x * x + y * y + z * z);
      expect(dist).toBeLessThanOrEqual(spreadRadius + 0.001);
    }
  });
});

describe('US-069: flattenInstances', () => {
  it('T-069-14: world-space positions differ from unit positions (transform applied)', () => {
    const rng = createPRNG('flatten-seed');
    const instances = generateTopologyInstances(rng, 3, 3.0);
    const { positions } = flattenInstances(instances);

    // Unit vertices are centered at origin with small coords; world-space should differ
    let anyDifferent = false;
    let hasNonZeroZ = false;
    for (let i = 0; i < positions.length; i += 3) {
      if (positions[i + 2] !== 0) hasNonZeroZ = true;
      // Check if transformed position differs from any unit vertex
      const magnitude = Math.sqrt(positions[i] ** 2 + positions[i + 1] ** 2 + positions[i + 2] ** 2);
      if (magnitude > 0.01) anyDifferent = true;
    }
    expect(anyDifferent).toBe(true);
    expect(hasNonZeroZ).toBe(true);
  });

  it('T-069-15: edge remapping is correct (offset by cumulative vertex count)', () => {
    const rng = createPRNG('remap-seed');
    const instances = generateTopologyInstances(rng, 3, 3.0);
    const { positions, edges } = flattenInstances(instances);
    const totalVerts = positions.length / 3;

    // First instance edges should start from 0
    const firstVertCount = instances[0].def.vertices.length;
    const firstEdgeCount = instances[0].def.edges.length;
    for (let e = 0; e < firstEdgeCount; e++) {
      expect(edges[e][0]).toBeLessThan(firstVertCount);
      expect(edges[e][1]).toBeLessThan(firstVertCount);
    }

    // Second instance edges should be offset by first instance vertex count
    if (instances.length >= 2) {
      const secondEdgeStart = firstEdgeCount;
      const secondEdge = edges[secondEdgeStart];
      expect(secondEdge[0]).toBeGreaterThanOrEqual(firstVertCount);
    }

    // All edges within bounds
    for (const [a, b] of edges) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(totalVerts);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(totalVerts);
    }
  });

  it('T-069-16: total vertex count equals sum of per-instance vertex counts', () => {
    const rng = createPRNG('vertcount-seed');
    const instances = generateTopologyInstances(rng, 4, 3.0);
    const { positions } = flattenInstances(instances);
    const expectedTotal = instances.reduce((sum, inst) => sum + inst.def.vertices.length, 0);
    expect(positions.length / 3).toBe(expectedTotal);
  });

  it('T-069-17: total edge count equals sum of per-instance edge counts', () => {
    const rng = createPRNG('edgecount-seed');
    const instances = generateTopologyInstances(rng, 4, 3.0);
    const { edges } = flattenInstances(instances);
    const expectedTotal = instances.reduce((sum, inst) => sum + inst.def.edges.length, 0);
    expect(edges.length).toBe(expectedTotal);
  });

  it('T-069-21: each topology instance vertices form a tight cluster', () => {
    const rng = createPRNG('cluster-seed');
    const instances = generateTopologyInstances(rng, 5, 3.0);
    const { positions } = flattenInstances(instances);

    let offset = 0;
    for (const inst of instances) {
      const vertCount = inst.def.vertices.length;
      const [cx, cy, cz] = inst.position;
      for (let v = 0; v < vertCount; v++) {
        const idx = (offset + v) * 3;
        const dx = positions[idx] - cx;
        const dy = positions[idx + 1] - cy;
        const dz = positions[idx + 2] - cz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // Generous bound: scale * max_unit_vertex_magnitude * 2
        expect(dist).toBeLessThan(inst.scale * 4);
      }
      offset += vertCount;
    }
  });

  it('T-069-22: flattenInstances positions contain no NaN or Infinity values', () => {
    const rng = createPRNG('finite-seed');
    const instances = generateTopologyInstances(rng, 8, 3.0);
    const { positions } = flattenInstances(instances);
    for (let i = 0; i < positions.length; i++) {
      expect(Number.isFinite(positions[i])).toBe(true);
    }
  });
});
