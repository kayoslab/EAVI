import * as THREE from 'three';
import type { Scene } from 'three';
import type { VisualParams } from '../mappings';
import type { FrameState } from '../types';
import type { Overlay } from '../overlay';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import chromaticDispersionGlsl from '../shaders/chromaticDispersion.glsl?raw';
import constellationVert from '../shaders/constellation.vert.glsl?raw';
import constellationFrag from '../shaders/constellation.frag.glsl?raw';
import electricArcConstellationVert from '../shaders/electricArcConstellation.vert.glsl?raw';
import electricArcConstellationFrag from '../shaders/electricArcConstellation.frag.glsl?raw';
import { subdivideEdges } from '../generators/subdivideEdges';
import { createPRNG } from '../prng';
import { generateTopologyInstances, flattenInstances } from '../generators/topologyInstances';
import type { TopologyInstance } from '../generators/topologyInstances';

const standardVertexShader = noise3dGlsl + '\n' + constellationVert;
const standardFragmentShader = chromaticDispersionGlsl + '\n' + constellationFrag;
const arcVertexShader = noise3dGlsl + '\n' + electricArcConstellationVert;
const arcFragmentShader = chromaticDispersionGlsl + '\n' + electricArcConstellationFrag;

const DEFAULT_MAX_TOPOLOGY_INSTANCES = 3;
const DEFAULT_SPREAD_RADIUS = 3.5;
const DEFAULT_MAX_CONNECTIONS = 3000;

export interface ConstellationConfig {
  maxTopologyInstances?: number;
  spreadRadius?: number;
  maxConnections?: number;
  enabled?: boolean;
  enableElectricArc?: boolean;
  arcSubdivisions?: number;
  seed?: string;
}

export interface ConstellationLines extends Overlay {}

/**
 * Build line segment buffers from topology edge tables.
 */
function buildTopologyBuffers(
  flatPositions: Float32Array,
  edges: [number, number][],
  maxConnections: number,
): { positions: Float32Array; distances: Float32Array; randoms: Float32Array } {
  const edgeCount = Math.min(edges.length, maxConnections);
  const vertexCount = edgeCount * 2;
  const positions = new Float32Array(vertexCount * 3);
  const distances = new Float32Array(vertexCount);
  const randoms = new Float32Array(vertexCount * 3);

  let maxDist = 0;
  // Pre-compute distances for normalization
  const edgeDists: number[] = [];
  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = edges[e];
    const dx = flatPositions[b * 3] - flatPositions[a * 3];
    const dy = flatPositions[b * 3 + 1] - flatPositions[a * 3 + 1];
    const dz = flatPositions[b * 3 + 2] - flatPositions[a * 3 + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    edgeDists.push(d);
    if (d > maxDist) maxDist = d;
  }

  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = edges[e];
    const v0 = e * 2;
    const v1 = e * 2 + 1;

    positions[v0 * 3] = flatPositions[a * 3];
    positions[v0 * 3 + 1] = flatPositions[a * 3 + 1];
    positions[v0 * 3 + 2] = flatPositions[a * 3 + 2];

    positions[v1 * 3] = flatPositions[b * 3];
    positions[v1 * 3 + 1] = flatPositions[b * 3 + 1];
    positions[v1 * 3 + 2] = flatPositions[b * 3 + 2];

    // Normalized distance (0 = shortest edge, 1 = longest)
    const normDist = maxDist > 0 ? edgeDists[e] / maxDist : 0;
    distances[v0] = normDist;
    distances[v1] = normDist;

    // Per-vertex random values derived from vertex indices for GPU noise
    const ri = a * 0.01;
    const rj = b * 0.01;
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
  const maxTopologyInstances = config?.maxTopologyInstances ?? DEFAULT_MAX_TOPOLOGY_INSTANCES;
  const spreadRadius = config?.spreadRadius ?? DEFAULT_SPREAD_RADIUS;
  const maxConnections = config?.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  const enableElectricArc = config?.enableElectricArc ?? false;
  const arcSubdivisions = config?.arcSubdivisions ?? 5;
  const seed = config?.seed ?? 'constellation-default';

  let linesMesh: THREE.LineSegments | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let shaderMaterial: THREE.ShaderMaterial | null = null;
  let sceneRef: Scene | null = null;
  let activeVertexCount = 0;
  let _instances: TopologyInstance[] = [];

  return {
    get activeVertexCount() {
      return activeVertexCount;
    },

    // Topology vertices are self-generated; positions parameter is accepted but unused.
    init(scene: Scene, _positions: Float32Array, params: VisualParams): void {
      if (maxTopologyInstances <= 0) return;

      const rng = createPRNG(seed);
      _instances = generateTopologyInstances(rng, maxTopologyInstances, spreadRadius);

      if (_instances.length === 0) return;

      const { positions: flatPositions, edges } = flattenInstances(_instances);

      if (edges.length === 0) return;

      const buffers = buildTopologyBuffers(flatPositions, edges, maxConnections);

      const effectiveEdgeCount = Math.min(edges.length, maxConnections);

      geometry = new THREE.BufferGeometry();

      if (enableElectricArc && arcSubdivisions > 1) {
        const subdivided = subdivideEdges(buffers.positions, arcSubdivisions);
        const interpDistances = interpolateDistances(buffers.distances, effectiveEdgeCount, arcSubdivisions);

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

        activeVertexCount = effectiveEdgeCount * 2;
      }

      const uniforms: Record<string, { value: unknown }> = {
        uTime: { value: 0.0 },
        uBassEnergy: { value: 0.0 },
        uBeatPulse: { value: 0.0 },
        uTrebleEnergy: { value: 0.0 },
        uOpacity: { value: 1.0 },
        uMotionAmplitude: { value: params.motionAmplitude },
        uPaletteHue: { value: params.paletteHue },
        uPaletteSaturation: { value: params.paletteSaturation },
        uCadence: { value: params.cadence },
        uProximityThreshold: { value: 1.0 },
        uNoiseFrequency: { value: params.noiseFrequency ?? 1.0 },
        uRadialScale: { value: params.radialScale ?? 1.0 },
        uTwistStrength: { value: params.twistStrength ?? 1.0 },
        uFieldSpread: { value: params.fieldSpread ?? 1.0 },
        uBreathScale: { value: 1.0 },
        uNoiseOctaves: { value: 2 },
        uDisplacementScale: { value: params.motionAmplitude * params.structureComplexity },
        uFogNear: { value: 3.0 },
        uFogFar: { value: 8.0 },
        uMidEnergy: { value: 0.0 },
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
      u.uBeatPulse.value = frame.params.beatPulse;
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
      u.uMidEnergy.value = frame.params.midEnergy;
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
      _instances = [];
    },
  };
}

/**
 * Returns the number of active vertices in the line buffer (for testing).
 */
export function getActiveVertexCount(constellation: ConstellationLines): number {
  return constellation.activeVertexCount;
}
