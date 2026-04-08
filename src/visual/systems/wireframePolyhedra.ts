// RETIRED from rotation (US-080). Rejected twice by user (US-069/US-071).
// Left unregistered intentionally — kept as reference only.
import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import chromaticDispersionGlsl from '../shaders/chromaticDispersion.glsl?raw';
import wireframeVert from '../shaders/wireframe.vert.glsl?raw';
import wireframeFrag from '../shaders/wireframe.frag.glsl?raw';
import electricArcVert from '../shaders/electricArc.vert.glsl?raw';
import electricArcFrag from '../shaders/electricArc.frag.glsl?raw';
import wireframeVertexVert from '../shaders/wireframeVertex.vert.glsl?raw';
import wireframeVertexFrag from '../shaders/wireframeVertex.frag.glsl?raw';
import { generatePolyhedronEdges, selectShape, selectGenerationMode, createBaseGeometry } from '../generators/polyhedraEdges';
import type { GenerationMode } from '../generators/polyhedraEdges';
import { generateGeodesicEdges, maxGeodesicLevel } from '../generators/geodesicSphere';
import { generateNestedEdges } from '../generators/nestedSolids';
import { generateDualEdges } from '../generators/dualPolyhedra';
import { subdivideEdges, hashRandomFromPosition } from '../generators/subdivideEdges';
import { extractUniqueVertices } from '../generators/extractVertices';
import { createOccluderMaterial, syncOccluderUniforms } from '../occluder';

const standardVertexShader = noise3dGlsl + '\n' + wireframeVert;
const standardFragmentShader = chromaticDispersionGlsl + '\n' + wireframeFrag;
const arcVertexShader = noise3dGlsl + '\n' + electricArcVert;
const arcFragmentShader = chromaticDispersionGlsl + '\n' + electricArcFrag;
const vertexDotVertShader = noise3dGlsl + '\n' + wireframeVertexVert;
const vertexDotFragShader = chromaticDispersionGlsl + '\n' + wireframeVertexFrag;

const DEFAULT_MAX_POLYHEDRA = 6;

interface MeshPair {
  edges: THREE.LineSegments;
  vertices: THREE.Points;
  occluder?: THREE.Mesh;
}

export interface WireframePolyhedraConfig {
  maxPolyhedra?: number;
  noiseOctaves?: 1 | 2 | 3;
  enablePointerRepulsion?: boolean;
  enableSlowModulation?: boolean;
  enableElectricArc?: boolean;
  arcSubdivisions?: number;
  generationMode?: GenerationMode;
  maxEdgesPerShape?: number;
  enableOcclusion?: boolean;
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
  const enableOcclusion = config?.enableOcclusion ?? false;

  let meshPairs: MeshPair[] = [];
  let sceneRef: Scene | null = null;

  function createEdgeUniforms(params: VisualParams): Record<string, { value: unknown }> {
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
      uDispersion: { value: 0.0 },
    };

    if (enableElectricArc) {
      uniforms.uArcIntensity = { value: 0.0 };
      uniforms.uArcSpeed = { value: 1.0 };
      uniforms.uArcFrequency = { value: 8.0 };
    }

    return uniforms;
  }

  function createVertexDotUniforms(params: VisualParams): Record<string, { value: unknown }> {
    return {
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
      uDispersion: { value: 0.0 },
      uBasePointSize: { value: 0.04 },
    };
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

        // --- Edge LineSegments mesh ---
        const edgeGeometry = new THREE.BufferGeometry();

        if (enableElectricArc && arcSubdivisions > 1) {
          const subdivided = subdivideEdges(edgeData.positions, arcSubdivisions);
          edgeGeometry.setAttribute('position', new THREE.BufferAttribute(subdivided.positions, 3));
          edgeGeometry.setAttribute('aRandom', new THREE.BufferAttribute(subdivided.aRandom, 3));
          edgeGeometry.setAttribute('aEdgeParam', new THREE.BufferAttribute(subdivided.aEdgeParam, 1));
          edgeGeometry.setAttribute('aEdgeTangent', new THREE.BufferAttribute(subdivided.aEdgeTangent, 3));
        } else {
          edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgeData.positions, 3));
          edgeGeometry.setAttribute('aRandom', new THREE.BufferAttribute(edgeData.randoms, 3));
        }

        const edgeMaterial = new THREE.ShaderMaterial({
          vertexShader: enableElectricArc ? arcVertexShader : standardVertexShader,
          fragmentShader: enableElectricArc ? arcFragmentShader : standardFragmentShader,
          uniforms: createEdgeUniforms(params),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          ...(enableOcclusion ? { depthTest: true } : {}),
        });

        const edgeMesh = new THREE.LineSegments(edgeGeometry, edgeMaterial);

        // --- Vertex dot Points mesh ---
        const vertexData = extractUniqueVertices(edgeData.positions);
        const vertexGeometry = new THREE.BufferGeometry();
        vertexGeometry.setAttribute('position', new THREE.BufferAttribute(vertexData.positions, 3));
        vertexGeometry.setAttribute('aRandom', new THREE.BufferAttribute(vertexData.aRandom, 3));

        const vertexMaterial = new THREE.ShaderMaterial({
          vertexShader: vertexDotVertShader,
          fragmentShader: vertexDotFragShader,
          uniforms: createVertexDotUniforms(params),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          ...(enableOcclusion ? { depthTest: true } : {}),
        });

        const vertexMesh = new THREE.Points(vertexGeometry, vertexMaterial);

        // Position each polyhedron in 3D space
        const spread = 2.0;
        const px = (rng() - 0.5) * spread;
        const py = (rng() - 0.5) * spread;
        const pz = (rng() - 0.5) * spread;
        edgeMesh.position.set(px, py, pz);
        vertexMesh.position.set(px, py, pz);

        // Random initial rotation
        const rx = rng() * Math.PI * 2;
        const ry = rng() * Math.PI * 2;
        const rz = rng() * Math.PI * 2;
        edgeMesh.rotation.set(rx, ry, rz);
        vertexMesh.rotation.set(rx, ry, rz);

        // --- Occluder mesh (optional) ---
        let occluder: THREE.Mesh | undefined;
        if (enableOcclusion) {
          edgeMesh.renderOrder = 0;
          vertexMesh.renderOrder = 0;

          const occluderGeometry = createBaseGeometry(shape, 0.3);
          // Add aRandom attribute computed from vertex positions
          const occPositions = occluderGeometry.getAttribute('position');
          const occRandomArr = new Float32Array(occPositions.count * 3);
          for (let v = 0; v < occPositions.count; v++) {
            const vx = occPositions.getX(v);
            const vy = occPositions.getY(v);
            const vz = occPositions.getZ(v);
            const [r0, r1, r2] = hashRandomFromPosition(vx, vy, vz);
            occRandomArr[v * 3] = r0;
            occRandomArr[v * 3 + 1] = r1;
            occRandomArr[v * 3 + 2] = r2;
          }
          occluderGeometry.setAttribute('aRandom', new THREE.BufferAttribute(occRandomArr, 3));

          const occMaterial = createOccluderMaterial(standardVertexShader, createEdgeUniforms(params));
          occluder = new THREE.Mesh(occluderGeometry, occMaterial);
          occluder.renderOrder = -1;
          occluder.position.set(px, py, pz);
          occluder.rotation.set(rx, ry, rz);
          scene.add(occluder);
        }

        scene.add(edgeMesh);
        scene.add(vertexMesh);
        meshPairs.push({ edges: edgeMesh, vertices: vertexMesh, occluder });
      }
    },

    draw(_scene: Scene, frame: FrameState): void {
      if (meshPairs.length === 0) return;

      const {
        bassEnergy, trebleEnergy, pointerDisturbance,
        motionAmplitude, paletteHue, paletteSaturation, cadence,
        structureComplexity, noiseFrequency, radialScale, twistStrength, fieldSpread,
      } = frame.params;
      const elapsed = frame.elapsed ?? 0;
      const pointerX = (frame.pointerX ?? 0.5) - 0.5;
      const pointerY = (frame.pointerY ?? 0.5) - 0.5;

      const breathScale = 1 + Math.sin(elapsed * 0.0004) * 0.03 * motionAmplitude;

      for (const pair of meshPairs) {
        // Update edge uniforms
        const eu = (pair.edges.material as THREE.ShaderMaterial).uniforms;
        eu.uTime.value = elapsed;
        eu.uBassEnergy.value = bassEnergy;
        eu.uTrebleEnergy.value = trebleEnergy;
        eu.uMotionAmplitude.value = motionAmplitude;
        eu.uPointerDisturbance.value = pointerDisturbance;
        (eu.uPointerPos.value as THREE.Vector2).set(pointerX, pointerY);
        eu.uPaletteHue.value = paletteHue;
        eu.uPaletteSaturation.value = paletteSaturation;
        eu.uCadence.value = cadence;
        eu.uNoiseFrequency.value = noiseFrequency;
        eu.uRadialScale.value = radialScale;
        eu.uTwistStrength.value = twistStrength;
        eu.uFieldSpread.value = fieldSpread;
        eu.uDisplacementScale.value = motionAmplitude * structureComplexity;
        eu.uDispersion.value = frame.params.dispersion ?? 0.0;
        eu.uBreathScale.value = breathScale;

        if (enableElectricArc && eu.uArcIntensity) {
          eu.uArcIntensity.value = 0.5 + trebleEnergy * 1.5;
          eu.uArcSpeed.value = 0.8 + cadence * 0.4;
          eu.uArcFrequency.value = 8.0;
        }

        // Update vertex dot uniforms
        const vu = (pair.vertices.material as THREE.ShaderMaterial).uniforms;
        vu.uTime.value = elapsed;
        vu.uBassEnergy.value = bassEnergy;
        vu.uTrebleEnergy.value = trebleEnergy;
        vu.uMotionAmplitude.value = motionAmplitude;
        vu.uPointerDisturbance.value = pointerDisturbance;
        (vu.uPointerPos.value as THREE.Vector2).set(pointerX, pointerY);
        vu.uPaletteHue.value = paletteHue;
        vu.uPaletteSaturation.value = paletteSaturation;
        vu.uCadence.value = cadence;
        vu.uNoiseFrequency.value = noiseFrequency;
        vu.uRadialScale.value = radialScale;
        vu.uTwistStrength.value = twistStrength;
        vu.uFieldSpread.value = fieldSpread;
        vu.uDisplacementScale.value = motionAmplitude * structureComplexity;
        vu.uDispersion.value = frame.params.dispersion ?? 0.0;
        vu.uBreathScale.value = breathScale;

        // Sync occluder uniforms
        if (pair.occluder) {
          syncOccluderUniforms(pair.occluder, eu);
        }
      }
    },

    setOpacity(opacity: number): void {
      for (const pair of meshPairs) {
        (pair.edges.material as THREE.ShaderMaterial).uniforms.uOpacity.value = opacity;
        (pair.vertices.material as THREE.ShaderMaterial).uniforms.uOpacity.value = opacity;
      }
    },

    cleanup(): void {
      if (sceneRef) {
        for (const pair of meshPairs) {
          sceneRef.remove(pair.edges);
          pair.edges.geometry.dispose();
          (pair.edges.material as THREE.Material).dispose();
          sceneRef.remove(pair.vertices);
          pair.vertices.geometry.dispose();
          (pair.vertices.material as THREE.Material).dispose();
          if (pair.occluder) {
            sceneRef.remove(pair.occluder);
            pair.occluder.geometry.dispose();
            (pair.occluder.material as THREE.Material).dispose();
          }
        }
      }
      meshPairs = [];
      sceneRef = null;
    },
  };
}
