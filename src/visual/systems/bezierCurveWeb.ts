import * as THREE from 'three';
import type { Scene } from 'three';
import type { VisualParams } from '../mappings';
import type { FrameState } from '../types';
import type { Overlay } from '../overlay';
import { tessellateBezier } from '../generators/tessellateBezier';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import chromaticDispersionGlsl from '../shaders/chromaticDispersion.glsl?raw';
import bezierWebVert from '../shaders/bezierWeb.vert.glsl?raw';
import constellationFrag from '../shaders/constellation.frag.glsl?raw';

const vertexShader = noise3dGlsl + '\n' + bezierWebVert;
const fragmentShader = chromaticDispersionGlsl + '\n' + constellationFrag;

const DEFAULT_PROXIMITY_THRESHOLD = 0.8;
const DEFAULT_MAX_CONNECTIONS = 2000;
const DEFAULT_MAX_NEIGHBORS_PER_POINT = 5;
const DEFAULT_SEGMENTS = 5;
const DEFAULT_BASE_ARC_HEIGHT = 0.15;
const DEFAULT_BASE_OPACITY = 0.1;

export interface BezierWebConfig {
  proximityThreshold?: number;
  maxConnections?: number;
  segments?: number;
  baseArcHeight?: number;
  enabled?: boolean;
}

interface Connection {
  i: number;
  j: number;
  distance: number;
}

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

export interface BezierCurveWeb extends Overlay {}

export function createBezierCurveWeb(config?: BezierWebConfig): BezierCurveWeb {
  const proximityThreshold = config?.proximityThreshold ?? DEFAULT_PROXIMITY_THRESHOLD;
  const maxConnections = config?.maxConnections ?? DEFAULT_MAX_CONNECTIONS;
  const segments = config?.segments ?? DEFAULT_SEGMENTS;
  const baseArcHeight = config?.baseArcHeight ?? DEFAULT_BASE_ARC_HEIGHT;

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

      // Tessellate each connection into Bezier curve segments
      const verticesPerConnection = segments * 2;
      const totalVertices = connections.length * verticesPerConnection;

      const allPositions = new Float32Array(totalVertices * 3);
      const allArcOffsets = new Float32Array(totalVertices * 3);
      const allEdgeParams = new Float32Array(totalVertices);
      const allDistances = new Float32Array(totalVertices);
      const allRandoms = new Float32Array(totalVertices * 3);

      for (let c = 0; c < connections.length; c++) {
        const conn = connections[c];
        const ax = positions[conn.i * 3];
        const ay = positions[conn.i * 3 + 1];
        const az = positions[conn.i * 3 + 2];
        const bx = positions[conn.j * 3];
        const by = positions[conn.j * 3 + 1];
        const bz = positions[conn.j * 3 + 2];

        const result = tessellateBezier(
          ax, ay, az,
          bx, by, bz,
          segments,
          baseArcHeight,
        );

        const offset = c * verticesPerConnection;
        allPositions.set(result.positions, offset * 3);
        allArcOffsets.set(result.aArcOffset, offset * 3);
        allEdgeParams.set(result.aEdgeParam, offset);
        allRandoms.set(result.aRandom, offset * 3);

        // Normalized distance for this connection (0=close, 1=far)
        const normDist = proximityThreshold > 0 ? conn.distance / proximityThreshold : 0;
        for (let v = 0; v < verticesPerConnection; v++) {
          allDistances[offset + v] = normDist;
        }
      }

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(allPositions, 3));
      geometry.setAttribute('aArcOffset', new THREE.BufferAttribute(allArcOffsets, 3));
      geometry.setAttribute('aEdgeParam', new THREE.BufferAttribute(allEdgeParams, 1));
      geometry.setAttribute('aDistance', new THREE.BufferAttribute(allDistances, 1));
      geometry.setAttribute('aRandom', new THREE.BufferAttribute(allRandoms, 3));

      activeVertexCount = totalVertices;

      shaderMaterial = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0.0 },
          uBassEnergy: { value: 0.0 },
          uBeatPulse: { value: 0.0 },
          uTrebleEnergy: { value: 0.0 },
          uOpacity: { value: DEFAULT_BASE_OPACITY },
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
          uMidEnergy: { value: 0.0 },
          uDispersion: { value: 0.0 },
          uBassArcScale: { value: 1.0 },
        },
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

      // Bass modulates arc curvature: stronger bass = more pronounced arcs
      u.uBassArcScale.value = 0.5 + bassEnergy * 1.5;

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
