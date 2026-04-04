import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import wireframeVert from '../shaders/wireframe.vert.glsl?raw';
import wireframeFrag from '../shaders/wireframe.frag.glsl?raw';
import electricArcVert from '../shaders/electricArc.vert.glsl?raw';
import electricArcFrag from '../shaders/electricArc.frag.glsl?raw';
import { generatePolyhedronEdges, selectShape, selectGenerationMode } from '../generators/polyhedraEdges';
import type { GenerationMode } from '../generators/polyhedraEdges';
import { generateGeodesicEdges, maxGeodesicLevel } from '../generators/geodesicSphere';
import { generateNestedEdges } from '../generators/nestedSolids';
import { generateDualEdges } from '../generators/dualPolyhedra';
import { subdivideEdges } from '../generators/subdivideEdges';

const standardVertexShader = noise3dGlsl + '\n' + wireframeVert;
const standardFragmentShader = wireframeFrag;
const arcVertexShader = noise3dGlsl + '\n' + electricArcVert;
const arcFragmentShader = electricArcFrag;

const DEFAULT_MAX_POLYHEDRA = 6;

export interface WireframePolyhedraConfig {
  maxPolyhedra?: number;
  noiseOctaves?: 1 | 2 | 3;
  enablePointerRepulsion?: boolean;
  enableSlowModulation?: boolean;
  enableElectricArc?: boolean;
  arcSubdivisions?: number;
  generationMode?: GenerationMode;
  maxEdgesPerShape?: number;
}

export function createWireframePolyhedra(config?: WireframePolyhedraConfig): GeometrySystem & {
  cleanup(): void;
  setOpacity(opacity: number): void;
} {
  const maxPolyhedra = config?.maxPolyhedra ?? DEFAULT_MAX_POLYHEDRA;
  const noiseOctaves = config?.noiseOctaves ?? 3;
  const enablePointerRepulsion = config?.enablePointerRepulsion ?? true;
  const enableSlowModulation = config?.enableSlowModulation ?? true;
  const enableElectricArc = config?.enableElectricArc ?? false;
  const arcSubdivisions = config?.arcSubdivisions ?? 5;
  const configGenerationMode = config?.generationMode;
  const maxEdgesPerShape = config?.maxEdgesPerShape ?? 480;

  let meshes: THREE.LineSegments[] = [];
  let sceneRef: Scene | null = null;

  function createUniforms(params: VisualParams): Record<string, { value: unknown }> {
    const uniforms: Record<string, { value: unknown }> = {
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
      uNoiseFrequency: { value: params.noiseFrequency },
      uRadialScale: { value: params.radialScale },
      uTwistStrength: { value: params.twistStrength },
      uFieldSpread: { value: params.fieldSpread },
      uNoiseOctaves: { value: noiseOctaves },
      uEnablePointerRepulsion: { value: enablePointerRepulsion ? 1.0 : 0.0 },
      uEnableSlowModulation: { value: enableSlowModulation ? 1.0 : 0.0 },
      uDisplacementScale: { value: params.motionAmplitude * params.structureComplexity },
      uFogNear: { value: 3.0 },
      uFogFar: { value: 8.0 },
    };

    if (enableElectricArc) {
      uniforms.uArcIntensity = { value: 0.0 };
      uniforms.uArcSpeed = { value: 1.0 };
      uniforms.uArcFrequency = { value: 8.0 };
    }

    return uniforms;
  }

  return {
    init(scene: Scene, seed: string, params: VisualParams): void {
      sceneRef = scene;
      const rng = createPRNG(seed + ':wireframe');

      for (let i = 0; i < maxPolyhedra; i++) {
        const shape = selectShape(seed + ':wireframe:shape:' + i);
        const tier = maxEdgesPerShape <= 30 ? 'low' as const : maxEdgesPerShape <= 480 ? 'medium' as const : 'high' as const;
        const mode = configGenerationMode ?? selectGenerationMode(seed + ':wireframe:mode:' + i, tier);

        let edgeData;
        switch (mode) {
          case 'geodesic': {
            const level = maxGeodesicLevel(maxEdgesPerShape);
            edgeData = generateGeodesicEdges({
              radius: 0.3,
              level: Math.max(1, level),
              seed: seed + ':wireframe:edges:' + i,
            });
            break;
          }
          case 'nested': {
            const layerRng = createPRNG(seed + ':wireframe:layers:' + i);
            const layers = 2 + Math.floor(layerRng() * 3); // 2-4
            edgeData = generateNestedEdges({
              shape,
              layers,
              radius: 0.3,
              seed: seed + ':wireframe:edges:' + i,
            });
            break;
          }
          case 'dual':
            edgeData = generateDualEdges({
              shape,
              radius: 0.3,
              seed: seed + ':wireframe:edges:' + i,
            });
            break;
          default:
            edgeData = generatePolyhedronEdges({
              shape,
              radius: 0.3,
              seed: seed + ':wireframe:edges:' + i,
            });
        }

        const geometry = new THREE.BufferGeometry();

        if (enableElectricArc && arcSubdivisions > 1) {
          const subdivided = subdivideEdges(edgeData.positions, arcSubdivisions);
          geometry.setAttribute('position', new THREE.BufferAttribute(subdivided.positions, 3));
          geometry.setAttribute('aRandom', new THREE.BufferAttribute(subdivided.aRandom, 3));
          geometry.setAttribute('aEdgeParam', new THREE.BufferAttribute(subdivided.aEdgeParam, 1));
          geometry.setAttribute('aEdgeTangent', new THREE.BufferAttribute(subdivided.aEdgeTangent, 3));
        } else {
          geometry.setAttribute('position', new THREE.BufferAttribute(edgeData.positions, 3));
          geometry.setAttribute('aRandom', new THREE.BufferAttribute(edgeData.randoms, 3));
        }

        const material = new THREE.ShaderMaterial({
          vertexShader: enableElectricArc ? arcVertexShader : standardVertexShader,
          fragmentShader: enableElectricArc ? arcFragmentShader : standardFragmentShader,
          uniforms: createUniforms(params),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });

        const mesh = new THREE.LineSegments(geometry, material);

        // Position each polyhedron in 3D space
        const spread = 2.0;
        mesh.position.set(
          (rng() - 0.5) * spread,
          (rng() - 0.5) * spread,
          (rng() - 0.5) * spread,
        );

        // Random initial rotation
        mesh.rotation.set(
          rng() * Math.PI * 2,
          rng() * Math.PI * 2,
          rng() * Math.PI * 2,
        );

        scene.add(mesh);
        meshes.push(mesh);
      }
    },

    draw(_scene: Scene, frame: FrameState): void {
      if (meshes.length === 0) return;

      const {
        bassEnergy, trebleEnergy, pointerDisturbance,
        motionAmplitude, paletteHue, paletteSaturation, cadence,
        structureComplexity, noiseFrequency, radialScale, twistStrength, fieldSpread,
      } = frame.params;
      const elapsed = frame.elapsed ?? 0;
      const pointerX = (frame.pointerX ?? 0.5) - 0.5;
      const pointerY = (frame.pointerY ?? 0.5) - 0.5;

      const breathScale = 1 + Math.sin(elapsed * 0.0004) * 0.03 * motionAmplitude;

      for (const mesh of meshes) {
        const u = (mesh.material as THREE.ShaderMaterial).uniforms;
        u.uTime.value = elapsed;
        u.uBassEnergy.value = bassEnergy;
        u.uTrebleEnergy.value = trebleEnergy;
        u.uMotionAmplitude.value = motionAmplitude;
        u.uPointerDisturbance.value = pointerDisturbance;
        (u.uPointerPos.value as THREE.Vector2).set(pointerX, pointerY);
        u.uPaletteHue.value = paletteHue;
        u.uPaletteSaturation.value = paletteSaturation;
        u.uCadence.value = cadence;
        u.uNoiseFrequency.value = noiseFrequency;
        u.uRadialScale.value = radialScale;
        u.uTwistStrength.value = twistStrength;
        u.uFieldSpread.value = fieldSpread;
        u.uDisplacementScale.value = motionAmplitude * structureComplexity;
        u.uBreathScale.value = breathScale;

        if (enableElectricArc && u.uArcIntensity) {
          u.uArcIntensity.value = 0.5 + trebleEnergy * 1.5;
          u.uArcSpeed.value = 0.8 + cadence * 0.4;
          u.uArcFrequency.value = 8.0;
        }
      }
    },

    setOpacity(opacity: number): void {
      for (const mesh of meshes) {
        (mesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = opacity;
      }
    },

    cleanup(): void {
      if (sceneRef) {
        for (const mesh of meshes) {
          sceneRef.remove(mesh);
          mesh.geometry.dispose();
          (mesh.material as THREE.Material).dispose();
        }
      }
      meshes = [];
      sceneRef = null;
    },
  };
}
