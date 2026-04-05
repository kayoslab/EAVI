import * as THREE from 'three';
import type { Scene } from 'three';
import type { VisualParams } from '../mappings';
import type { FrameState } from '../types';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import chromaticDispersionGlsl from '../shaders/chromaticDispersion.glsl?raw';
import constellationVert from '../shaders/constellation.vert.glsl?raw';
import constellationFrag from '../shaders/constellation.frag.glsl?raw';
import electricArcConstellationVert from '../shaders/electricArcConstellation.vert.glsl?raw';
import electricArcConstellationFrag from '../shaders/electricArcConstellation.frag.glsl?raw';
import { subdivideEdges } from '../generators/subdivideEdges';

const standardVertexShader = noise3dGlsl + '\n' + constellationVert;
const standardFragmentShader = chromaticDispersionGlsl + '\n' + constellationFrag;
const arcVertexShader = noise3dGlsl + '\n' + electricArcConstellationVert;
const arcFragmentShader = chromaticDispersionGlsl + '\n' + electricArcConstellationFrag;

const DEFAULT_PROXIMITY_THRESHOLD = 0.8;
const DEFAULT_MAX_CONNECTIONS = 3000;
const DEFAULT_MAX_NEIGHBORS_PER_POINT = 5;

export interface ConstellationConfig {
  proximityThreshold?: number;
  maxConnections?: number;
  enabled?: boolean;
  enableElectricArc?: boolean;
  arcSubdivisions?: number;
}

export interface ConstellationLines {
  init(scene: Scene, positions: Float32Array, params: VisualParams): void;
  draw(scene: Scene, frame: FrameState): void;
  cleanup(): void;
  setOpacity(opacity: number): void;
  /** Number of active vertices in line buffer (exposed for testing) */
  readonly activeVertexCount: number;
}

interface Connection {
  i: number;
  j: number;
  distance: number;
}

/**
 * CPU-side proximity search. Returns pairs of point indices within threshold,
 * bounded by maxConnections globally and maxNeighbors per point.
 */
function findConnections(
  positions: Float32Array,
  threshold: number,
  maxConnections: number,
  maxNeighbors: number,
): Connection[] {
  const pointCount = Math.floor(positions.length / 3);
  if (pointCount < 2 || threshold <= 0 || maxConnections <= 0) return [];

  const thresholdSq = threshold * threshold;
  const connections: Connection[] = [];
  const neighborCount = new Uint16Array(pointCount);

  for (let i = 0; i < pointCount; i++) {
    if (connections.length >= maxConnections) break;

    const ix = positions[i * 3];
    const iy = positions[i * 3 + 1];
    const iz = positions[i * 3 + 2];

    for (let j = i + 1; j < pointCount; j++) {
      if (connections.length >= maxConnections) break;
      if (neighborCount[i] >= maxNeighbors || neighborCount[j] >= maxNeighbors) continue;

      const dx = positions[j * 3] - ix;
      const dy = positions[j * 3 + 1] - iy;
      const dz = positions[j * 3 + 2] - iz;
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq <= thresholdSq) {
        const distance = Math.sqrt(distSq);
        connections.push({ i, j, distance });
        neighborCount[i]++;
        neighborCount[j]++;
      }
    }
  }

  return connections;
}

/**
 * Build line segment buffers from connections.
 */
function buildLineBuffers(
  sourcePositions: Float32Array,
  connections: Connection[],
  threshold: number,
): { positions: Float32Array; distances: Float32Array; randoms: Float32Array } {
  const vertexCount = connections.length * 2;
  const positions = new Float32Array(vertexCount * 3);
  const distances = new Float32Array(vertexCount);
  const randoms = new Float32Array(vertexCount * 3);

  for (let c = 0; c < connections.length; c++) {
    const conn = connections[c];
    const v0 = c * 2;
    const v1 = c * 2 + 1;

    positions[v0 * 3] = sourcePositions[conn.i * 3];
    positions[v0 * 3 + 1] = sourcePositions[conn.i * 3 + 1];
    positions[v0 * 3 + 2] = sourcePositions[conn.i * 3 + 2];

    positions[v1 * 3] = sourcePositions[conn.j * 3];
    positions[v1 * 3 + 1] = sourcePositions[conn.j * 3 + 1];
    positions[v1 * 3 + 2] = sourcePositions[conn.j * 3 + 2];

    // Normalized distance (0 = touching, 1 = at threshold)
    const normDist = threshold > 0 ? conn.distance / threshold : 0;
    distances[v0] = normDist;
    distances[v1] = normDist;

    // Per-vertex random values derived from point indices for GPU noise
    const ri = conn.i * 0.01;
    const rj = conn.j * 0.01;
    randoms[v0 * 3] = Math.abs(Math.sin(ri * 73.1)) % 1;
    randoms[v0 * 3 + 1] = Math.abs(Math.cos(ri * 91.3)) % 1;
    randoms[v0 * 3 + 2] = Math.abs(Math.sin(ri * 117.7)) % 1;
    randoms[v1 * 3] = Math.abs(Math.sin(rj * 73.1)) % 1;
    randoms[v1 * 3 + 1] = Math.abs(Math.cos(rj * 91.3)) % 1;
    randoms[v1 * 3 + 2] = Math.abs(Math.sin(rj * 117.7)) % 1;
  }

  return { positions, distances, randoms };
}

/**
 * Interpolate per-edge distance values across subdivided vertices.
 * Each original edge has 2 vertices with distance values (d0, d1).
 * After subdivision, each edge becomes subdivisions*2 vertices.
 * We linearly interpolate d0 -> d1 across the sub-segment vertices.
 */
function interpolateDistances(
  distances: Float32Array,
  edgeCount: number,
  subdivisions: number,
): Float32Array {
  const outVertCount = edgeCount * subdivisions * 2;
  const out = new Float32Array(outVertCount);

  for (let e = 0; e < edgeCount; e++) {
    const d0 = distances[e * 2];
    const d1 = distances[e * 2 + 1];
    const outBase = e * subdivisions * 2;

    for (let s = 0; s < subdivisions; s++) {
      const t0 = s / subdivisions;
      const t1 = (s + 1) / subdivisions;
      const vi0 = outBase + s * 2;
      const vi1 = vi0 + 1;
      out[vi0] = d0 + (d1 - d0) * t0;
      out[vi1] = d0 + (d1 - d0) * t1;
    }
  }

  return out;
}

export function createConstellationLines(config?: ConstellationConfig): ConstellationLines {
  const proximityThreshold = config?.proximityThreshold ?? DEFAULT_PROXIMITY_THRESHOLD;
  const maxConnections = config?.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  const enableElectricArc = config?.enableElectricArc ?? false;
  const arcSubdivisions = config?.arcSubdivisions ?? 5;

  let linesMesh: THREE.LineSegments | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let shaderMaterial: THREE.ShaderMaterial | null = null;
  let sceneRef: Scene | null = null;
  let activeVertexCount = 0;

  return {
    get activeVertexCount() {
      return activeVertexCount;
    },

    init(scene: Scene, positions: Float32Array, params: VisualParams): void {
      if (!positions || positions.length < 6) return;

      const connections = findConnections(
        positions,
        proximityThreshold,
        maxConnections,
        DEFAULT_MAX_NEIGHBORS_PER_POINT,
      );

      if (connections.length === 0) return;

      const buffers = buildLineBuffers(positions, connections, proximityThreshold);

      geometry = new THREE.BufferGeometry();

      if (enableElectricArc && arcSubdivisions > 1) {
        const subdivided = subdivideEdges(buffers.positions, arcSubdivisions);
        const interpDistances = interpolateDistances(buffers.distances, connections.length, arcSubdivisions);

        geometry.setAttribute('position', new THREE.BufferAttribute(subdivided.positions, 3));
        geometry.setAttribute('aDistance', new THREE.BufferAttribute(interpDistances, 1));
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(subdivided.aRandom, 3));
        geometry.setAttribute('aEdgeParam', new THREE.BufferAttribute(subdivided.aEdgeParam, 1));
        geometry.setAttribute('aEdgeTangent', new THREE.BufferAttribute(subdivided.aEdgeTangent, 3));

        activeVertexCount = subdivided.positions.length / 3;
      } else {
        geometry.setAttribute('position', new THREE.BufferAttribute(buffers.positions, 3));
        geometry.setAttribute('aDistance', new THREE.BufferAttribute(buffers.distances, 1));
        geometry.setAttribute('aRandom', new THREE.BufferAttribute(buffers.randoms, 3));

        activeVertexCount = connections.length * 2;
      }

      const uniforms: Record<string, { value: unknown }> = {
        uTime: { value: 0.0 },
        uBassEnergy: { value: 0.0 },
        uTrebleEnergy: { value: 0.0 },
        uOpacity: { value: 1.0 },
        uMotionAmplitude: { value: params.motionAmplitude },
        uPaletteHue: { value: params.paletteHue },
        uPaletteSaturation: { value: params.paletteSaturation },
        uCadence: { value: params.cadence },
        uProximityThreshold: { value: proximityThreshold },
        uNoiseFrequency: { value: params.noiseFrequency ?? 1.0 },
        uRadialScale: { value: params.radialScale ?? 1.0 },
        uTwistStrength: { value: params.twistStrength ?? 1.0 },
        uFieldSpread: { value: params.fieldSpread ?? 1.0 },
        uBreathScale: { value: 1.0 },
        uNoiseOctaves: { value: 2 },
        uDisplacementScale: { value: params.motionAmplitude * params.structureComplexity },
        uFogNear: { value: 3.0 },
        uFogFar: { value: 8.0 },
        uDispersion: { value: 0.0 },
      };

      if (enableElectricArc) {
        uniforms.uArcIntensity = { value: 0.0 };
        uniforms.uArcSpeed = { value: 1.0 };
        uniforms.uArcFrequency = { value: 8.0 };
      }

      shaderMaterial = new THREE.ShaderMaterial({
        vertexShader: enableElectricArc ? arcVertexShader : standardVertexShader,
        fragmentShader: enableElectricArc ? arcFragmentShader : standardFragmentShader,
        uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });

      linesMesh = new THREE.LineSegments(geometry, shaderMaterial);
      scene.add(linesMesh);
      sceneRef = scene;
    },

    draw(_scene: Scene, frame: FrameState): void {
      if (!shaderMaterial || !linesMesh) return;

      const {
        bassEnergy, trebleEnergy, motionAmplitude,
        paletteHue, paletteSaturation, cadence,
        structureComplexity, noiseFrequency, radialScale, twistStrength, fieldSpread,
      } = frame.params;
      const elapsed = frame.elapsed ?? 0;

      const u = shaderMaterial.uniforms;
      u.uTime.value = elapsed;
      u.uBassEnergy.value = bassEnergy;
      u.uTrebleEnergy.value = trebleEnergy;
      u.uMotionAmplitude.value = motionAmplitude;
      u.uPaletteHue.value = paletteHue;
      u.uPaletteSaturation.value = paletteSaturation;
      u.uCadence.value = cadence;
      u.uNoiseFrequency.value = noiseFrequency;
      u.uRadialScale.value = radialScale;
      u.uTwistStrength.value = twistStrength;
      u.uFieldSpread.value = fieldSpread;
      u.uDisplacementScale.value = motionAmplitude * structureComplexity;
      u.uDispersion.value = frame.params.dispersion ?? 0.0;

      const breathScale = 1 + Math.sin(elapsed * 0.0004) * 0.03 * motionAmplitude;
      u.uBreathScale.value = breathScale;

      if (enableElectricArc && u.uArcIntensity) {
        u.uArcIntensity.value = 0.5 + trebleEnergy * 1.5;
        u.uArcSpeed.value = 0.8 + cadence * 0.4;
        u.uArcFrequency.value = 8.0;
      }

      // Match parent point cloud rotation
      const driftPeriod = 20000;
      const driftAngle = Math.sin(elapsed / driftPeriod * Math.PI * 2) * 0.15 * motionAmplitude;
      linesMesh.rotation.y = driftAngle;
      const bassRotation = bassEnergy * motionAmplitude * 0.1;
      linesMesh.rotation.y += bassRotation * Math.sin(elapsed * 0.0003);

      const zBreath = Math.sin(elapsed / 15000 * Math.PI * 2) * 0.3 * motionAmplitude;
      linesMesh.position.z = zBreath;
    },

    setOpacity(opacity: number): void {
      if (shaderMaterial) {
        shaderMaterial.uniforms.uOpacity.value = opacity;
      }
    },

    cleanup(): void {
      if (linesMesh && sceneRef) {
        sceneRef.remove(linesMesh);
      }
      if (geometry) {
        geometry.dispose();
      }
      if (shaderMaterial) {
        shaderMaterial.dispose();
      }
      linesMesh = null;
      geometry = null;
      shaderMaterial = null;
      sceneRef = null;
      activeVertexCount = 0;
    },
  };
}

/**
 * Returns the number of active vertices in the line buffer (for testing).
 */
export function getActiveVertexCount(constellation: ConstellationLines): number {
  return constellation.activeVertexCount;
}
