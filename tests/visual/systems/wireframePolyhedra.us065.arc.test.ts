import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createWireframePolyhedra } from '../../../src/visual/systems/wireframePolyhedra';
import type { VisualParams } from '../../../src/visual/mappings';
import type { FrameState } from '../../../src/visual/types';

const defaultParams: VisualParams = {
  paletteHue: 180,
  paletteSaturation: 0.5,
  cadence: 0.7,
  density: 0.6,
  motionAmplitude: 1.0,
  pointerDisturbance: 0,
  bassEnergy: 0,
  trebleEnergy: 0,
  curveSoftness: 0.5,
  structureComplexity: 0.5,
  noiseFrequency: 1.0,
  radialScale: 1.0,
  twistStrength: 1.0,
  fieldSpread: 1.0,
};

function makeFrame(overrides?: Partial<FrameState & { params: Partial<VisualParams> }>): FrameState {
  return {
    time: 1000,
    delta: 16,
    elapsed: 1000,
    width: 800,
    height: 600,
    params: { ...defaultParams, ...(overrides?.params ?? {}) },
    ...Object.fromEntries(Object.entries(overrides ?? {}).filter(([k]) => k !== 'params')),
  } as FrameState;
}

describe('US-065: Electric arc mode with vertex-edge topology', () => {
  it('T-065-59: electric arc mode creates both Points and LineSegments', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 2, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-pair-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
    const points = scene.children.filter((c) => c instanceof THREE.Points);
    expect(lines.length).toBe(2);
    expect(points.length).toBe(2);
  });

  it('T-065-60: arc mode LineSegments have subdivided geometry (more vertices than Points)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-subdiv-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const point = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const lineCount = (line.geometry as THREE.BufferGeometry).getAttribute('position').count;
    const pointCount = (point.geometry as THREE.BufferGeometry).getAttribute('position').count;
    // Subdivided edges have many more vertices than unique polyhedron vertices
    expect(lineCount).toBeGreaterThan(pointCount * 2);
  });

  it('T-065-61: arc mode vertex dots use standard wireframeVertex shaders (not arc shaders)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-shader-seed', defaultParams);
    const point = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = point.material as THREE.ShaderMaterial;
    // Vertex dot shader should NOT have arc-specific uniforms
    expect(mat.uniforms.uArcIntensity).toBeUndefined();
    // But should have point-specific uniforms
    expect(mat.uniforms.uBasePointSize).toBeDefined();
  });

  it('T-065-62: arc mode LineSegments have arc-specific attributes (aEdgeParam, aEdgeTangent)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-attr-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const lineGeo = line.geometry as THREE.BufferGeometry;
    expect(lineGeo.getAttribute('aEdgeParam')).toBeDefined();
    expect(lineGeo.getAttribute('aEdgeTangent')).toBeDefined();

    // Points should NOT have arc attributes
    const point = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const pointGeo = point.geometry as THREE.BufferGeometry;
    expect(pointGeo.getAttribute('aEdgeParam')).toBeUndefined();
    expect(pointGeo.getAttribute('aEdgeTangent')).toBeUndefined();
  });

  it('T-065-63: arc mode draw() does not throw', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 2, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-draw-seed', defaultParams);
    expect(() => wire.draw(scene, makeFrame({ elapsed: 1000, params: { ...defaultParams, bassEnergy: 0.7, trebleEnergy: 0.5 } }))).not.toThrow();
  });

  it('T-065-64: arc mode cleanup() removes all Points and LineSegments', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 3, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-cleanup-seed', defaultParams);
    wire.cleanup!();
    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(0);
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
  });

  it('T-065-65: arc mode paired meshes share the same position and rotation', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 2, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-pair-pos-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    const points = scene.children.filter((c) => c instanceof THREE.Points) as THREE.Points[];
    for (let i = 0; i < lines.length; i++) {
      expect(points[i].position.x).toBe(lines[i].position.x);
      expect(points[i].position.y).toBe(lines[i].position.y);
      expect(points[i].position.z).toBe(lines[i].position.z);
      expect(points[i].rotation.x).toBe(lines[i].rotation.x);
      expect(points[i].rotation.y).toBe(lines[i].rotation.y);
      expect(points[i].rotation.z).toBe(lines[i].rotation.z);
    }
  });
});
