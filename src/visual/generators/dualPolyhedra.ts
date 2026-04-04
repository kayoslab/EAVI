import { generatePolyhedronEdges } from './polyhedraEdges';
import type { PolyhedronShape, PolyhedronEdgeData } from './polyhedraEdges';

const DUAL_MAP: Record<PolyhedronShape, PolyhedronShape> = {
  icosahedron: 'dodecahedron',
  dodecahedron: 'icosahedron',
  octahedron: 'cube',
  cube: 'octahedron',
  tetrahedron: 'tetrahedron',
};

export function generateDualEdges(opts: {
  shape: PolyhedronShape;
  radius?: number;
  seed: string;
}): PolyhedronEdgeData {
  const radius = opts.radius ?? 0.3;
  const dualShape = DUAL_MAP[opts.shape];

  const primary = generatePolyhedronEdges({
    shape: opts.shape,
    radius,
    seed: opts.seed + ':dual:primary',
  });

  const dualRadius = dualShape === opts.shape ? radius * 0.7 : radius;
  const dual = generatePolyhedronEdges({
    shape: dualShape,
    radius: dualRadius,
    seed: opts.seed + ':dual:secondary',
  });

  const totalEdges = primary.edgeCount + dual.edgeCount;
  const totalVerts = totalEdges * 2;
  const positions = new Float32Array(totalVerts * 3);
  const randoms = new Float32Array(totalVerts * 3);

  positions.set(primary.positions, 0);
  randoms.set(primary.randoms, 0);
  positions.set(dual.positions, primary.positions.length);
  randoms.set(dual.randoms, primary.randoms.length);

  return { positions, randoms, edgeCount: totalEdges };
}
