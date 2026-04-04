import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import microGeoVert from '../shaders/microGeo.vert.glsl?raw';
import fragmentShader from '../shaders/microGeo.frag.glsl?raw';
import { generateVolumetricPoints } from '../generators/volumetricPoints';
import type { VolumetricShape } from '../generators/volumetricPoints';
import { computeAdaptiveCount } from './pointCloud';

const vertexShader = noise3dGlsl + '\n' + microGeoVert;

const VOLUMETRIC_SHAPES: VolumetricShape[] = [
  'sphereVolume', 'shell', 'torusVolume', 'spiralField', 'crystalCluster', 'geode',
];

const DEFAULT_MAX_INSTANCES = 600;

type PrimitiveType = 'cube' | 'tetrahedron' | 'octahedron';

function buildPrimitive(type: PrimitiveType): THREE.BufferGeometry {
  switch (type) {
    case 'cube':
      return new THREE.BoxGeometry(0.06, 0.06, 0.06);
    case 'tetrahedron':
      return new THREE.TetrahedronGeometry(0.04, 0);
    case 'octahedron':
      return new THREE.OctahedronGeometry(0.04, 1);
  }
}

const PRIMITIVE_TYPES: PrimitiveType[] = ['cube', 'tetrahedron', 'octahedron'];

export interface MicroGeometryConfig {
  maxInstances?: number;
  noiseOctaves?: 1 | 2 | 3;
  enablePointerRepulsion?: boolean;
  enableSlowModulation?: boolean;
}

export function createMicroGeometry(config?: MicroGeometryConfig): GeometrySystem {
  const maxInstances = config?.maxInstances ?? DEFAULT_MAX_INSTANCES;
  const noiseOctaves = config?.noiseOctaves ?? 3;
  const enablePointerRepulsion = config?.enablePointerRepulsion ?? true;
  const enableSlowModulation = config?.enableSlowModulation ?? true;

  let instancedMesh: THREE.InstancedMesh | null = null;
  let geo: THREE.BufferGeometry | null = null;
  let shaderMaterial: THREE.ShaderMaterial | null = null;
  let sceneRef: Scene | null = null;

  // Pre-allocated base data
  let basePositions: Float32Array | null = null;
  let baseRotations: Float32Array | null = null;
  let baseScales: Float32Array | null = null;

  // Pre-allocated reusable math objects for draw loop
  const _position = new THREE.Vector3();
  const _quaternion = new THREE.Quaternion();
  const _scale = new THREE.Vector3();
  const _euler = new THREE.Euler();
  const _matrix = new THREE.Matrix4();

  return {
    init(scene: Scene, seed: string, params: VisualParams): void {
      const rng = createPRNG(seed + ':microgeometry');

      const effectiveCount = computeAdaptiveCount(params.density, params.structureComplexity, maxInstances);

      // Select primitive type from seed (deterministic per session)
      const primIndex = Math.floor(rng() * PRIMITIVE_TYPES.length) % PRIMITIVE_TYPES.length;
      const primType = PRIMITIVE_TYPES[primIndex];
      geo = buildPrimitive(primType);

      // Select volumetric shape for initial placement
      const shapeIndex = Math.floor(rng() * VOLUMETRIC_SHAPES.length) % VOLUMETRIC_SHAPES.length;
      const shape = VOLUMETRIC_SHAPES[shapeIndex];

      const positions = generateVolumetricPoints({
        shape,
        pointCount: effectiveCount,
        seed: seed + ':microgeometry',
      });

      // Store base transforms
      basePositions = new Float32Array(effectiveCount * 3);
      baseRotations = new Float32Array(effectiveCount * 3);
      baseScales = new Float32Array(effectiveCount);

      for (let i = 0; i < effectiveCount; i++) {
        basePositions[i * 3] = positions[i * 3];
        basePositions[i * 3 + 1] = positions[i * 3 + 1];
        basePositions[i * 3 + 2] = positions[i * 3 + 2];

        baseRotations[i * 3] = rng() * Math.PI * 2;
        baseRotations[i * 3 + 1] = rng() * Math.PI * 2;
        baseRotations[i * 3 + 2] = rng() * Math.PI * 2;

        baseScales[i] = 0.8 + rng() * 0.4; // 0.8 - 1.2
      }

      // Create uniforms
      const uniforms = {
        uTime: { value: 0.0 },
        uBassEnergy: { value: 0.0 },
        uTrebleEnergy: { value: 0.0 },
        uOpacity: { value: 1.0 },
        uMotionAmplitude: { value: params.motionAmplitude },
        uPointerDisturbance: { value: 0.0 },
        uPointerPos: { value: new THREE.Vector2(0, 0) },
        uPaletteHue: { value: params.paletteHue },
        uPaletteSaturation: { value: params.paletteSaturation },
        uCadence: { value: params.cadence },
        uBreathScale: { value: 1.0 },
        uNoiseFrequency: { value: 1.0 },
        uRadialScale: { value: 1.0 },
        uTwistStrength: { value: 1.0 },
        uFieldSpread: { value: 1.0 },
        uNoiseOctaves: { value: noiseOctaves },
        uEnablePointerRepulsion: { value: enablePointerRepulsion ? 1.0 : 0.0 },
        uEnableSlowModulation: { value: enableSlowModulation ? 1.0 : 0.0 },
        uDisplacementScale: { value: params.motionAmplitude * params.structureComplexity },
        uFogNear: { value: 3.0 },
        uFogFar: { value: 8.0 },
      };

      shaderMaterial = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      instancedMesh = new THREE.InstancedMesh(geo, shaderMaterial, effectiveCount);

      // Set initial instance matrices
      for (let i = 0; i < effectiveCount; i++) {
        _position.set(
          basePositions[i * 3],
          basePositions[i * 3 + 1],
          basePositions[i * 3 + 2],
        );
        _euler.set(
          baseRotations[i * 3],
          baseRotations[i * 3 + 1],
          baseRotations[i * 3 + 2],
        );
        _quaternion.setFromEuler(_euler);
        _scale.setScalar(baseScales[i]);
        _matrix.compose(_position, _quaternion, _scale);
        instancedMesh.setMatrixAt(i, _matrix);
      }
      // Ensure instanceMatrix.needsUpdate is readable (Three.js r183 defines it as setter-only)
      Object.defineProperty(instancedMesh.instanceMatrix, 'needsUpdate', {
        value: true,
        writable: true,
        configurable: true,
      });

      scene.add(instancedMesh);
      sceneRef = scene;
    },

    draw(_scene: Scene, frame: FrameState): void {
      if (!instancedMesh || !shaderMaterial || !basePositions || !baseRotations || !baseScales) return;

      const {
        bassEnergy, trebleEnergy, pointerDisturbance,
        motionAmplitude, paletteHue, paletteSaturation, cadence,
        structureComplexity, noiseFrequency, radialScale, twistStrength, fieldSpread,
      } = frame.params;
      const elapsed = frame.elapsed ?? 0;
      const pointerX = (frame.pointerX ?? 0.5) - 0.5;
      const pointerY = (frame.pointerY ?? 0.5) - 0.5;

      // Update uniforms
      const u = shaderMaterial.uniforms;
      u.uTime.value = elapsed;
      u.uBassEnergy.value = bassEnergy;
      u.uTrebleEnergy.value = trebleEnergy;
      u.uMotionAmplitude.value = motionAmplitude;
      u.uPointerDisturbance.value = pointerDisturbance;
      u.uPointerPos.value.set(pointerX, pointerY);
      u.uPaletteHue.value = paletteHue;
      u.uPaletteSaturation.value = paletteSaturation;
      u.uCadence.value = cadence;
      u.uNoiseFrequency.value = noiseFrequency;
      u.uRadialScale.value = radialScale;
      u.uTwistStrength.value = twistStrength;
      u.uFieldSpread.value = fieldSpread;
      u.uDisplacementScale.value = motionAmplitude * structureComplexity;

      // Breathing scale
      const breathScale = 1 + Math.sin(elapsed * 0.0004) * 0.03 * motionAmplitude;
      u.uBreathScale.value = breathScale;

      // CPU-side per-instance matrix updates for audio reactivity
      const count = instancedMesh.count;
      const t = elapsed;
      const ma = motionAmplitude;

      for (let i = 0; i < count; i++) {
        const bx = basePositions[i * 3];
        const by = basePositions[i * 3 + 1];
        const bz = basePositions[i * 3 + 2];

        // Bass macro displacement: sinusoidal field drift scaled by bass
        const bassPhase = t * 0.0003 + i * 0.1;
        const bassScale = bassEnergy * ma * 0.3;
        const px = bx + Math.sin(bassPhase + bx * 2.0) * bassScale;
        const py = by + Math.cos(bassPhase * 0.7 + by * 2.0) * bassScale;
        const pz = bz + Math.sin(bassPhase * 1.3 + bz * 2.0) * bassScale;

        _position.set(px, py, pz);

        // Treble rotation jitter
        const trebleJitter = trebleEnergy * ma * 0.5;
        const rx = baseRotations[i * 3] + Math.sin(t * 0.003 + i * 0.17) * trebleJitter;
        const ry = baseRotations[i * 3 + 1] + Math.cos(t * 0.0025 + i * 0.23) * trebleJitter;
        const rz = baseRotations[i * 3 + 2] + Math.sin(t * 0.0035 + i * 0.31) * trebleJitter;

        // Time evolution: slow rotation drift
        const drift = t * 0.0001 * ma;
        _euler.set(rx + drift, ry + drift * 0.7, rz + drift * 1.3);
        _quaternion.setFromEuler(_euler);

        // Treble scale pulse
        const scalePulse = 1.0 + trebleEnergy * 0.15 * Math.sin(t * 0.005 + i);
        _scale.setScalar(baseScales[i] * scalePulse);

        _matrix.compose(_position, _quaternion, _scale);
        instancedMesh.setMatrixAt(i, _matrix);
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
    },

    setOpacity(opacity: number): void {
      if (shaderMaterial) {
        shaderMaterial.uniforms.uOpacity.value = opacity;
      }
    },

    cleanup(): void {
      if (instancedMesh && sceneRef) {
        sceneRef.remove(instancedMesh);
      }
      if (geo) {
        geo.dispose();
      }
      if (shaderMaterial) {
        shaderMaterial.dispose();
      }
      instancedMesh = null;
      geo = null;
      shaderMaterial = null;
      basePositions = null;
      baseRotations = null;
      baseScales = null;
      sceneRef = null;
    },
  };
}
