import { describe, it, expect, vi } from 'vitest';
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

describe('US-062: Wireframe polyhedra generation mode integration', () => {
  it('T-062-64: init still produces LineSegments with maxEdgesPerShape config', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 2, maxEdgesPerShape: 480 });
    wire.init(scene, 'mode-line-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(lines.length).toBeGreaterThanOrEqual(1);
  });

  it('T-062-65: all generation modes produce valid geometry with position attribute', () => {
    // Sweep many seeds to exercise different modes
    for (let i = 0; i < 20; i++) {
      const scene = new THREE.Scene();
      const wire = createWireframePolyhedra({ maxPolyhedra: 1, maxEdgesPerShape: 1920 });
      wire.init(scene, `mode-sweep-${i}`, defaultParams);
      const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
      expect(line).toBeDefined();
      const geo = line.geometry as THREE.BufferGeometry;
      expect(geo.getAttribute('position')).toBeDefined();
      expect(geo.getAttribute('position').count).toBeGreaterThanOrEqual(4);
      wire.cleanup!();
    }
  });

  it('T-062-66: geodesic mode produces more edges than plain mode for same shape', () => {
    // Collect edge counts across many seeds — at least one geodesic should exceed plain maximums
    // Plain shapes max out at 30 edges (icosahedron/dodecahedron). Geodesic level 1 = 120.
    let foundHighEdgeCount = false;
    for (let i = 0; i < 50; i++) {
      const scene = new THREE.Scene();
      const wire = createWireframePolyhedra({ maxPolyhedra: 1, maxEdgesPerShape: 1920 });
      wire.init(scene, `geodesic-hunt-${i}`, defaultParams);
      const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
      const posCount = (line.geometry as THREE.BufferGeometry).getAttribute('position').count;
      if (posCount > 60) { // > 30 edges = 60 vertices, plain max
        foundHighEdgeCount = true;
        break;
      }
      wire.cleanup!();
    }
    expect(foundHighEdgeCount).toBe(true);
  });

  it('T-062-67: low tier with maxEdgesPerShape=30 only produces plain mode (modest edge counts)', () => {
    for (let i = 0; i < 30; i++) {
      const scene = new THREE.Scene();
      const wire = createWireframePolyhedra({ maxPolyhedra: 1, maxEdgesPerShape: 30 });
      wire.init(scene, `low-tier-${i}`, defaultParams);
      const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
      const posCount = (line.geometry as THREE.BufferGeometry).getAttribute('position').count;
      // Plain shapes: tetra=6edges=12verts, octa=12edges=24verts, icosa=30edges=60verts, dodeca=30edges=60verts
      expect(posCount).toBeLessThanOrEqual(60);
      wire.cleanup!();
    }
  });

  it('T-062-68: draw still works after init with generation modes', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 3, maxEdgesPerShape: 480 });
    wire.init(scene, 'draw-mode-seed', defaultParams);
    expect(() => {
      wire.draw(scene, makeFrame({ elapsed: 500, params: { bassEnergy: 0.5, trebleEnergy: 0.3 } }));
    }).not.toThrow();
    // Verify uniforms updated
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uBassEnergy.value).toBe(0.5);
  });

  it('T-062-69: cleanup works with all generation modes', () => {
    for (let i = 0; i < 10; i++) {
      const scene = new THREE.Scene();
      const wire = createWireframePolyhedra({ maxPolyhedra: 2, maxEdgesPerShape: 1920 });
      wire.init(scene, `cleanup-mode-${i}`, defaultParams);
      expect(() => wire.cleanup!()).not.toThrow();
      expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(0);
    }
  });

  it('T-062-70: all vertex positions are finite across generation modes', () => {
    for (let i = 0; i < 20; i++) {
      const scene = new THREE.Scene();
      const wire = createWireframePolyhedra({ maxPolyhedra: 1, maxEdgesPerShape: 1920 });
      wire.init(scene, `finite-mode-${i}`, defaultParams);
      const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
      const pos = (line.geometry as THREE.BufferGeometry).getAttribute('position');
      for (let v = 0; v < pos.count * 3; v++) {
        expect(Number.isFinite((pos.array as Float32Array)[v])).toBe(true);
      }
      wire.cleanup!();
    }
  });

  it('T-062-71: aRandom attribute present on all mode-generated geometries', () => {
    for (let i = 0; i < 20; i++) {
      const scene = new THREE.Scene();
      const wire = createWireframePolyhedra({ maxPolyhedra: 1, maxEdgesPerShape: 1920 });
      wire.init(scene, `arandom-mode-${i}`, defaultParams);
      const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
      const geo = line.geometry as THREE.BufferGeometry;
      expect(geo.getAttribute('aRandom')).toBeDefined();
      expect(geo.getAttribute('aRandom').itemSize).toBe(3);
      wire.cleanup!();
    }
  });

  it('T-062-72: vertex count is always even (LineSegments pairs) for all modes', () => {
    for (let i = 0; i < 20; i++) {
      const scene = new THREE.Scene();
      const wire = createWireframePolyhedra({ maxPolyhedra: 1, maxEdgesPerShape: 1920 });
      wire.init(scene, `even-mode-${i}`, defaultParams);
      const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
      const posCount = (line.geometry as THREE.BufferGeometry).getAttribute('position').count;
      expect(posCount % 2).toBe(0);
      wire.cleanup!();
    }
  });

  it('T-062-73: no localStorage or cookie access with generation modes', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 3, maxEdgesPerShape: 480 });
    wire.init(scene, 'privacy-mode-seed', defaultParams);
    wire.draw(scene, makeFrame());
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('T-062-74: generationMode config override forces specific mode', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, generationMode: 'geodesic', maxEdgesPerShape: 1920 });
    wire.init(scene, 'force-geo-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const posCount = (line.geometry as THREE.BufferGeometry).getAttribute('position').count;
    // Geodesic level 1 minimum = 120 edges = 240 vertices
    expect(posCount).toBeGreaterThanOrEqual(240);
  });

  it('T-062-75: generationMode "nested" produces more edges than single plain shape', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, generationMode: 'nested', maxEdgesPerShape: 480 });
    wire.init(scene, 'force-nested-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const posCount = (line.geometry as THREE.BufferGeometry).getAttribute('position').count;
    // Nested has at least 2 layers, so at least 2x minimum shape (tetra 6 edges)
    expect(posCount).toBeGreaterThanOrEqual(24); // 12 edges * 2 verts minimum
  });

  it('T-062-76: generationMode "dual" produces combined edge count from two shapes', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, generationMode: 'dual', maxEdgesPerShape: 480 });
    wire.init(scene, 'force-dual-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const posCount = (line.geometry as THREE.BufferGeometry).getAttribute('position').count;
    // Minimum dual is tetra+tetra = 12 edges = 24 vertices
    expect(posCount).toBeGreaterThanOrEqual(24);
  });
});
