import { describe, it, expect } from 'vitest';
import { subdivideEdges } from '../../../src/visual/generators/subdivideEdges';

describe('US-060: Edge subdivision utility', () => {
  // Helper: create a single edge from (0,0,0) to (1,0,0)
  function singleEdge(): Float32Array {
    return new Float32Array([0, 0, 0, 1, 0, 0]);
  }

  // Helper: create two edges
  function twoEdges(): Float32Array {
    return new Float32Array([
      0, 0, 0, 1, 0, 0,
      0, 0, 0, 0, 1, 0,
    ]);
  }

  it('T-060-01: output vertex count equals originalEdges * subdivisions * 2', () => {
    const positions = singleEdge();
    const result = subdivideEdges(positions, 4);
    // 1 edge * 4 subdivisions * 2 vertices per sub-segment = 8
    expect(result.positions.length / 3).toBe(1 * 4 * 2);
  });

  it('T-060-02: output vertex count scales with edge count', () => {
    const positions = twoEdges();
    const result = subdivideEdges(positions, 4);
    // 2 edges * 4 subdivisions * 2 vertices per sub-segment = 16
    expect(result.positions.length / 3).toBe(2 * 4 * 2);
  });

  it('T-060-03: output vertex count scales with subdivision count', () => {
    const positions = singleEdge();
    const r5 = subdivideEdges(positions, 5);
    const r8 = subdivideEdges(positions, 8);
    expect(r5.positions.length / 3).toBe(1 * 5 * 2);
    expect(r8.positions.length / 3).toBe(1 * 8 * 2);
  });

  it('T-060-04: aEdgeParam is 0 at edge start endpoint', () => {
    const result = subdivideEdges(singleEdge(), 6);
    // First sub-segment starts at t=0 of the edge
    expect(result.aEdgeParam[0]).toBeCloseTo(0, 5);
  });

  it('T-060-05: aEdgeParam is 0 at edge end endpoint', () => {
    const result = subdivideEdges(singleEdge(), 6);
    const vertexCount = result.aEdgeParam.length;
    // Last vertex of the last sub-segment should be at t=1 (edge end)
    // sin(PI * 1) = 0, so tapered param should be 0
    expect(result.aEdgeParam[vertexCount - 1]).toBeCloseTo(0, 5);
  });

  it('T-060-06: aEdgeParam peaks near midpoint of edge (max > 0.9)', () => {
    const result = subdivideEdges(singleEdge(), 8);
    let maxParam = 0;
    for (let i = 0; i < result.aEdgeParam.length; i++) {
      if (result.aEdgeParam[i] > maxParam) maxParam = result.aEdgeParam[i];
    }
    // sin(PI * 0.5) = 1.0, so at midpoint the tapered param should be ~1.0
    expect(maxParam).toBeGreaterThan(0.9);
  });

  it('T-060-07: aEdgeParam values are symmetric around midpoint', () => {
    const result = subdivideEdges(singleEdge(), 8);
    const params = Array.from(result.aEdgeParam);
    const mid = Math.floor(params.length / 2);
    // Compare first half with reversed second half
    for (let i = 0; i < mid; i++) {
      const mirror = params.length - 1 - i;
      expect(params[i]).toBeCloseTo(params[mirror], 3);
    }
  });

  it('T-060-08: aEdgeTangent is normalized for all vertices (length ~1.0)', () => {
    const result = subdivideEdges(twoEdges(), 4);
    const vertexCount = result.aEdgeTangent.length / 3;
    for (let i = 0; i < vertexCount; i++) {
      const tx = result.aEdgeTangent[i * 3];
      const ty = result.aEdgeTangent[i * 3 + 1];
      const tz = result.aEdgeTangent[i * 3 + 2];
      const len = Math.sqrt(tx * tx + ty * ty + tz * tz);
      expect(len).toBeCloseTo(1.0, 3);
    }
  });

  it('T-060-09: aEdgeTangent is consistent for all vertices on the same edge', () => {
    const result = subdivideEdges(singleEdge(), 6);
    const vertexCount = result.aEdgeTangent.length / 3;
    const firstTx = result.aEdgeTangent[0];
    const firstTy = result.aEdgeTangent[1];
    const firstTz = result.aEdgeTangent[2];
    for (let i = 1; i < vertexCount; i++) {
      expect(result.aEdgeTangent[i * 3]).toBeCloseTo(firstTx, 5);
      expect(result.aEdgeTangent[i * 3 + 1]).toBeCloseTo(firstTy, 5);
      expect(result.aEdgeTangent[i * 3 + 2]).toBeCloseTo(firstTz, 5);
    }
  });

  it('T-060-10: aEdgeTangent points along edge direction', () => {
    // Edge from (0,0,0) to (1,0,0) => tangent should be (1,0,0)
    const result = subdivideEdges(singleEdge(), 4);
    expect(result.aEdgeTangent[0]).toBeCloseTo(1.0, 5);
    expect(result.aEdgeTangent[1]).toBeCloseTo(0.0, 5);
    expect(result.aEdgeTangent[2]).toBeCloseTo(0.0, 5);
  });

  it('T-060-11: tangent for Y-axis edge is correct', () => {
    // Edge from (0,0,0) to (0,1,0) => tangent should be (0,1,0)
    const positions = new Float32Array([0, 0, 0, 0, 1, 0]);
    const result = subdivideEdges(positions, 4);
    expect(result.aEdgeTangent[0]).toBeCloseTo(0.0, 5);
    expect(result.aEdgeTangent[1]).toBeCloseTo(1.0, 5);
    expect(result.aEdgeTangent[2]).toBeCloseTo(0.0, 5);
  });

  it('T-060-12: tangent for diagonal edge is normalized', () => {
    // Edge from (0,0,0) to (1,1,1) => tangent should be normalized (1,1,1)/sqrt(3)
    const positions = new Float32Array([0, 0, 0, 1, 1, 1]);
    const result = subdivideEdges(positions, 4);
    const expected = 1 / Math.sqrt(3);
    expect(result.aEdgeTangent[0]).toBeCloseTo(expected, 3);
    expect(result.aEdgeTangent[1]).toBeCloseTo(expected, 3);
    expect(result.aEdgeTangent[2]).toBeCloseTo(expected, 3);
  });

  it('T-060-13: handles zero-length edges without NaN', () => {
    const positions = new Float32Array([1, 2, 3, 1, 2, 3]);
    const result = subdivideEdges(positions, 4);
    const vertexCount = result.positions.length / 3;
    for (let i = 0; i < vertexCount * 3; i++) {
      expect(Number.isFinite(result.positions[i])).toBe(true);
      expect(Number.isFinite(result.aEdgeTangent[i])).toBe(true);
    }
    for (let i = 0; i < vertexCount; i++) {
      expect(Number.isFinite(result.aEdgeParam[i])).toBe(true);
    }
  });

  it('T-060-14: aRandom attribute has itemSize 3 and correct vertex count', () => {
    const result = subdivideEdges(twoEdges(), 5);
    const expectedVertCount = 2 * 5 * 2;
    expect(result.aRandom.length).toBe(expectedVertCount * 3);
  });

  it('T-060-15: aRandom values are all finite', () => {
    const result = subdivideEdges(singleEdge(), 6);
    for (let i = 0; i < result.aRandom.length; i++) {
      expect(Number.isFinite(result.aRandom[i])).toBe(true);
    }
  });

  it('T-060-16: positions output has correct length (vertexCount * 3)', () => {
    const result = subdivideEdges(twoEdges(), 4);
    const expectedVertCount = 2 * 4 * 2;
    expect(result.positions.length).toBe(expectedVertCount * 3);
  });

  it('T-060-17: aEdgeParam output has correct length (vertexCount)', () => {
    const result = subdivideEdges(twoEdges(), 4);
    const expectedVertCount = 2 * 4 * 2;
    expect(result.aEdgeParam.length).toBe(expectedVertCount);
  });

  it('T-060-18: aEdgeTangent output has correct length (vertexCount * 3)', () => {
    const result = subdivideEdges(twoEdges(), 4);
    const expectedVertCount = 2 * 4 * 2;
    expect(result.aEdgeTangent.length).toBe(expectedVertCount * 3);
  });

  it('T-060-19: sub-segment endpoints lie on the original edge', () => {
    // Edge from (0,0,0) to (3,0,0) with 3 subdivisions
    const positions = new Float32Array([0, 0, 0, 3, 0, 0]);
    const result = subdivideEdges(positions, 3);
    // With 3 subdivisions, intermediate points should be at x=0, 1, 2, 3
    // Check that all Y and Z values remain 0 (no displacement in CPU)
    const vertCount = result.positions.length / 3;
    for (let i = 0; i < vertCount; i++) {
      expect(result.positions[i * 3 + 1]).toBeCloseTo(0, 5); // Y
      expect(result.positions[i * 3 + 2]).toBeCloseTo(0, 5); // Z
    }
  });

  it('T-060-20: first sub-segment starts at edge start vertex', () => {
    const positions = new Float32Array([1, 2, 3, 4, 5, 6]);
    const result = subdivideEdges(positions, 4);
    expect(result.positions[0]).toBeCloseTo(1, 5);
    expect(result.positions[1]).toBeCloseTo(2, 5);
    expect(result.positions[2]).toBeCloseTo(3, 5);
  });

  it('T-060-21: last sub-segment ends at edge end vertex', () => {
    const positions = new Float32Array([1, 2, 3, 4, 5, 6]);
    const result = subdivideEdges(positions, 4);
    const vertCount = result.positions.length / 3;
    const lastIdx = (vertCount - 1) * 3;
    expect(result.positions[lastIdx]).toBeCloseTo(4, 5);
    expect(result.positions[lastIdx + 1]).toBeCloseTo(5, 5);
    expect(result.positions[lastIdx + 2]).toBeCloseTo(6, 5);
  });

  it('T-060-22: subdivision=1 produces same vertex count as original edge (2 vertices)', () => {
    const result = subdivideEdges(singleEdge(), 1);
    expect(result.positions.length / 3).toBe(2);
  });

  it('T-060-23: all aEdgeParam values are between 0 and 1 inclusive', () => {
    const result = subdivideEdges(twoEdges(), 8);
    for (let i = 0; i < result.aEdgeParam.length; i++) {
      expect(result.aEdgeParam[i]).toBeGreaterThanOrEqual(0);
      expect(result.aEdgeParam[i]).toBeLessThanOrEqual(1);
    }
  });

  it('T-060-24: result contains Float32Arrays for all output fields', () => {
    const result = subdivideEdges(singleEdge(), 4);
    expect(result.positions).toBeInstanceOf(Float32Array);
    expect(result.aEdgeParam).toBeInstanceOf(Float32Array);
    expect(result.aEdgeTangent).toBeInstanceOf(Float32Array);
    expect(result.aRandom).toBeInstanceOf(Float32Array);
  });

  it('T-060-25: handles large subdivision count without error', () => {
    const positions = twoEdges();
    expect(() => subdivideEdges(positions, 20)).not.toThrow();
    const result = subdivideEdges(positions, 20);
    expect(result.positions.length / 3).toBe(2 * 20 * 2);
  });

  it('T-060-26: empty input positions returns empty arrays', () => {
    const result = subdivideEdges(new Float32Array(0), 4);
    expect(result.positions.length).toBe(0);
    expect(result.aEdgeParam.length).toBe(0);
    expect(result.aEdgeTangent.length).toBe(0);
    expect(result.aRandom.length).toBe(0);
  });
});
