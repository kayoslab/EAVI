import { createPRNG } from '../prng';
import { generatePolyhedronEdges } from './polyhedraEdges';
import type { PolyhedronShape, PolyhedronEdgeData } from './polyhedraEdges';

const LAYER_SCALE_FACTORS = [1.0, 0.65, 0.42, 0.27];

export function generateNestedEdges(opts: {
  shape: PolyhedronShape;
  layers: number;
  radius?: number;
  seed: string;
}): PolyhedronEdgeData {
  const radius = opts.radius ?? 0.3;
  const layers = Math.max(2, Math.min(4, Math.round(opts.layers)));
  const rng = createPRNG(opts.seed + ':nested');

  const layerResults: PolyhedronEdgeData[] = [];

  for (let l = 0; l < layers; l++) {
    const layerRadius = radius * LAYER_SCALE_FACTORS[l];
    const data = generatePolyhedronEdges({
      shape: opts.shape,
      radius: layerRadius,
      seed: opts.seed + ':nested:layer:' + l,
    });

    // Apply a slight rotation offset per layer
    const ax = rng() * Math.PI * 2;
    const ay = rng() * Math.PI * 2;
    const az = rng() * Math.PI * 2;
    const cosX = Math.cos(ax), sinX = Math.sin(ax);
    const cosY = Math.cos(ay), sinY = Math.sin(ay);
    const cosZ = Math.cos(az), sinZ = Math.sin(az);

    for (let i = 0; i < data.positions.length; i += 3) {
      let x = data.positions[i];
      let y = data.positions[i + 1];
      let z = data.positions[i + 2];

      // Rotate X
      let ty = y * cosX - z * sinX;
      let tz = y * sinX + z * cosX;
      y = ty; z = tz;

      // Rotate Y
      let tx = x * cosY + z * sinY;
      tz = -x * sinY + z * cosY;
      x = tx; z = tz;

      // Rotate Z
      tx = x * cosZ - y * sinZ;
      ty = x * sinZ + y * cosZ;
      x = tx; y = ty;

      data.positions[i] = x;
      data.positions[i + 1] = y;
      data.positions[i + 2] = z;
    }

    layerResults.push(data);
  }

  const totalEdges = layerResults.reduce((s, d) => s + d.edgeCount, 0);
  const totalVerts = totalEdges * 2;
  const positions = new Float32Array(totalVerts * 3);
  const randoms = new Float32Array(totalVerts * 3);

  let offset = 0;
  for (const data of layerResults) {
    positions.set(data.positions, offset);
    randoms.set(data.randoms, offset);
    offset += data.positions.length;
  }

  return { positions, randoms, edgeCount: totalEdges };
}
