import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { addPlaceholder } from '../../src/visual/placeholder';

describe('US-029: Placeholder 3D object', () => {
  it('T-029-08: addPlaceholder adds a mesh to the scene', () => {
    const scene = new THREE.Scene();
    addPlaceholder(scene);
    const meshes = scene.children.filter((c) => c instanceof THREE.Mesh);
    expect(meshes.length).toBeGreaterThanOrEqual(1);
  });

  it('T-029-09: addPlaceholder returns an object with a mesh property', () => {
    const scene = new THREE.Scene();
    const result = addPlaceholder(scene);
    expect(result.mesh).toBeDefined();
    expect(result.mesh).toBeInstanceOf(THREE.Mesh);
  });

  it('T-029-10: placeholder mesh uses wireframe material', () => {
    const scene = new THREE.Scene();
    const result = addPlaceholder(scene);
    const material = result.mesh.material as THREE.MeshStandardMaterial;
    expect(material.wireframe).toBe(true);
  });

  it('T-029-11: placeholder mesh uses IcosahedronGeometry', () => {
    const scene = new THREE.Scene();
    const result = addPlaceholder(scene);
    expect(result.mesh.geometry.type).toBe('IcosahedronGeometry');
  });

  it('T-029-12: addPlaceholder adds lighting to the scene', () => {
    const scene = new THREE.Scene();
    addPlaceholder(scene);
    const ambients = scene.children.filter((c) => c instanceof THREE.AmbientLight);
    const directionals = scene.children.filter((c) => c instanceof THREE.DirectionalLight);
    expect(ambients.length).toBeGreaterThanOrEqual(1);
    expect(directionals.length).toBeGreaterThanOrEqual(1);
  });

  it('T-029-13: scene has exactly the expected number of children after addPlaceholder (mesh + 2 lights)', () => {
    const scene = new THREE.Scene();
    addPlaceholder(scene);
    expect(scene.children.length).toBe(3);
  });

  it('T-030-29: addPlaceholder returns lights for cleanup', () => {
    const scene = new THREE.Scene();
    const result = addPlaceholder(scene);
    expect(result.mesh).toBeDefined();
    expect(result.ambient).toBeInstanceOf(THREE.AmbientLight);
    expect(result.directional).toBeInstanceOf(THREE.DirectionalLight);
  });
});
