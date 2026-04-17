import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  createCrystalField,
  getPointCount,
  getPointPositions,
} from '../../../src/visual/systems/crystalField';
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

function makeFrame(overrides?: Partial<FrameState>): FrameState {
  return {
    time: 1000,
    delta: 16,
    elapsed: 1000,
    width: 800,
    height: 600,
    params: { ...defaultParams },
    ...overrides,
  };
}

function initCrystal(seed = 'test-seed', params = defaultParams, config?: Parameters<typeof createCrystalField>[0]) {
  const scene = new THREE.Scene();
  const crystal = createCrystalField(config);
  crystal.init(scene, seed, params);
  const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
  const geo = points.geometry as THREE.BufferGeometry;
  const mat = points.material as THREE.ShaderMaterial;
  return { scene, crystal, points, geo, mat };
}

describe('US-085: CrystalField lattice-aligned faceted cluster', () => {
  // --- Lattice geometry attributes ---

  it('T-085-17: geometry has aLatticePos attribute with itemSize 3', () => {
    const { geo } = initCrystal();
    const attr = geo.getAttribute('aLatticePos');
    expect(attr).toBeDefined();
    expect(attr.itemSize).toBe(3);
  });

  it('T-085-18: geometry has aFacetNormal attribute with itemSize 3', () => {
    const { geo } = initCrystal();
    const attr = geo.getAttribute('aFacetNormal');
    expect(attr).toBeDefined();
    expect(attr.itemSize).toBe(3);
  });

  it('T-085-19: aLatticePos values are all finite', () => {
    const { geo, crystal } = initCrystal();
    const attr = geo.getAttribute('aLatticePos');
    const arr = attr.array as Float32Array;
    const count = getPointCount(crystal);
    for (let i = 0; i < count * 3; i++) {
      expect(Number.isFinite(arr[i])).toBe(true);
    }
  });

  it('T-085-20: aFacetNormal values are all finite', () => {
    const { geo, crystal } = initCrystal();
    const attr = geo.getAttribute('aFacetNormal');
    const arr = attr.array as Float32Array;
    const count = getPointCount(crystal);
    for (let i = 0; i < count * 3; i++) {
      expect(Number.isFinite(arr[i])).toBe(true);
    }
  });

  it('T-085-21: aFacetNormal vectors are approximately unit length', () => {
    const { geo, crystal } = initCrystal();
    const arr = geo.getAttribute('aFacetNormal').array as Float32Array;
    const count = getPointCount(crystal);
    for (let i = 0; i < count; i++) {
      const nx = arr[i * 3];
      const ny = arr[i * 3 + 1];
      const nz = arr[i * 3 + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      expect(len).toBeCloseTo(1.0, 1);
    }
  });

  it('T-085-22: aLatticePos values cluster into distinct lattice nodes (not all identical)', () => {
    const { geo, crystal } = initCrystal();
    const arr = geo.getAttribute('aLatticePos').array as Float32Array;
    const count = getPointCount(crystal);

    // Collect unique lattice positions
    const uniqueNodes: Array<[number, number, number]> = [];
    const tolerance = 0.01;
    for (let i = 0; i < count; i++) {
      const lx = arr[i * 3];
      const ly = arr[i * 3 + 1];
      const lz = arr[i * 3 + 2];
      const found = uniqueNodes.some(([ux, uy, uz]) =>
        Math.abs(lx - ux) < tolerance &&
        Math.abs(ly - uy) < tolerance &&
        Math.abs(lz - uz) < tolerance,
      );
      if (!found) uniqueNodes.push([lx, ly, lz]);
    }

    // Should have multiple distinct lattice nodes (6-12 per plan)
    expect(uniqueNodes.length).toBeGreaterThanOrEqual(2);
    expect(uniqueNodes.length).toBeLessThanOrEqual(16);
  });

  // --- New uniforms ---

  it('T-085-23: shader material has uLatticePulse uniform', () => {
    const { mat } = initCrystal();
    expect(mat.uniforms.uLatticePulse).toBeDefined();
    expect(typeof mat.uniforms.uLatticePulse.value).toBe('number');
  });

  it('T-085-24: shader material has uFacetShimmer uniform', () => {
    const { mat } = initCrystal();
    expect(mat.uniforms.uFacetShimmer).toBeDefined();
    expect(typeof mat.uniforms.uFacetShimmer.value).toBe('number');
  });

  it('T-085-25: shader material has uHasLatticePos guard uniform', () => {
    const { mat } = initCrystal();
    expect(mat.uniforms.uHasLatticePos).toBeDefined();
    expect(mat.uniforms.uHasLatticePos.value).toBe(1.0);
  });

  it('T-085-26: shader material has uHasFacetNormal guard uniform', () => {
    const { mat } = initCrystal();
    expect(mat.uniforms.uHasFacetNormal).toBeDefined();
    expect(mat.uniforms.uHasFacetNormal.value).toBe(1.0);
  });

  // --- Bass drives lattice pulse ---

  it('T-085-27: bass energy updates uLatticePulse uniform via draw()', () => {
    const { scene, crystal, mat } = initCrystal();

    crystal.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0 } }));
    const lowPulse = mat.uniforms.uLatticePulse.value;

    crystal.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 1.0 } }));
    const highPulse = mat.uniforms.uLatticePulse.value;

    expect(highPulse).toBeGreaterThan(lowPulse);
  });

  it('T-085-28: uLatticePulse reflects bassEnergy value', () => {
    const { scene, crystal, mat } = initCrystal();
    crystal.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0.75 } }));
    // The exact mapping can vary, but it should be a positive value correlated with bass
    expect(mat.uniforms.uLatticePulse.value).toBeGreaterThan(0);
  });

  // --- Treble drives facet shimmer ---

  it('T-085-29: treble energy updates uFacetShimmer uniform via draw()', () => {
    const { scene, crystal, mat } = initCrystal();

    crystal.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0 } }));
    const lowShimmer = mat.uniforms.uFacetShimmer.value;

    crystal.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 1.0 } }));
    const highShimmer = mat.uniforms.uFacetShimmer.value;

    expect(highShimmer).toBeGreaterThan(lowShimmer);
  });

  it('T-085-30: uFacetShimmer reflects trebleEnergy value', () => {
    const { scene, crystal, mat } = initCrystal();
    crystal.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0.8 } }));
    expect(mat.uniforms.uFacetShimmer.value).toBeGreaterThan(0);
  });

  // --- Lattice structure in positions ---

  it('T-085-31: points cluster around lattice nodes (standard deviation within each cluster is small)', () => {
    const { geo, crystal } = initCrystal();
    const posArr = geo.getAttribute('position').array as Float32Array;
    const latticeArr = geo.getAttribute('aLatticePos').array as Float32Array;
    const count = getPointCount(crystal);

    // Group points by their lattice node and compute per-group spread
    const groups = new Map<string, number[]>();
    const tolerance = 0.01;

    for (let i = 0; i < count; i++) {
      const lx = latticeArr[i * 3];
      const ly = latticeArr[i * 3 + 1];
      const lz = latticeArr[i * 3 + 2];
      const key = `${lx.toFixed(2)},${ly.toFixed(2)},${lz.toFixed(2)}`;

      if (!groups.has(key)) groups.set(key, []);
      const dx = posArr[i * 3] - lx;
      const dy = posArr[i * 3 + 1] - ly;
      const dz = posArr[i * 3 + 2] - lz;
      groups.get(key)!.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
    }

    // Each cluster's points should be relatively close to their lattice node
    for (const [, distances] of groups) {
      const mean = distances.reduce((a, b) => a + b, 0) / distances.length;
      // Mean distance from lattice node should be less than 3.0 (crystal height + radius + jitter)
      expect(mean).toBeLessThan(3.0);
    }
  });

  it('T-085-32: positions span 3D volume (non-coplanar in all three axes)', () => {
    const { crystal } = initCrystal();
    const positions = getPointPositions(crystal)!;
    const count = positions.length / 3;

    let sumX = 0, sumY = 0, sumZ = 0;
    for (let i = 0; i < count; i++) {
      sumX += positions[i * 3];
      sumY += positions[i * 3 + 1];
      sumZ += positions[i * 3 + 2];
    }
    const meanX = sumX / count, meanY = sumY / count, meanZ = sumZ / count;

    let varX = 0, varY = 0, varZ = 0;
    for (let i = 0; i < count; i++) {
      varX += (positions[i * 3] - meanX) ** 2;
      varY += (positions[i * 3 + 1] - meanY) ** 2;
      varZ += (positions[i * 3 + 2] - meanZ) ** 2;
    }

    expect(Math.sqrt(varX / count)).toBeGreaterThan(0.1);
    expect(Math.sqrt(varY / count)).toBeGreaterThan(0.1);
    expect(Math.sqrt(varZ / count)).toBeGreaterThan(0.1);
  });

  // --- Existing functionality preserved ---

  it('T-085-33: still uses THREE.Points mesh with BufferGeometry', () => {
    const { points, geo } = initCrystal();
    expect(points).toBeInstanceOf(THREE.Points);
    expect(geo).toBeInstanceOf(THREE.BufferGeometry);
  });

  it('T-085-34: still has position, size, aRandom, aVertexColor attributes', () => {
    const { geo } = initCrystal();
    expect(geo.getAttribute('position')).toBeDefined();
    expect(geo.getAttribute('position').itemSize).toBe(3);
    expect(geo.getAttribute('size')).toBeDefined();
    expect(geo.getAttribute('size').itemSize).toBe(1);
    expect(geo.getAttribute('aRandom')).toBeDefined();
    expect(geo.getAttribute('aRandom').itemSize).toBe(3);
    expect(geo.getAttribute('aVertexColor')).toBeDefined();
    expect(geo.getAttribute('aVertexColor').itemSize).toBe(3);
  });

  it('T-085-35: material uses additive blending, transparency, and no depth write', () => {
    const { mat } = initCrystal();
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });

  it('T-085-36: setOpacity still updates uOpacity uniform', () => {
    const { crystal, mat } = initCrystal();
    crystal.setOpacity!(0.3);
    expect(mat.uniforms.uOpacity.value).toBe(0.3);
  });

  it('T-085-37: cleanup() removes mesh and disposes resources', () => {
    const { scene, crystal, points } = initCrystal();
    const geoSpy = vi.spyOn(points.geometry, 'dispose');
    const matSpy = vi.spyOn(points.material as THREE.Material, 'dispose');
    crystal.cleanup!();
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
    expect(geoSpy).toHaveBeenCalled();
    expect(matSpy).toHaveBeenCalled();
  });

  it('T-085-38: same seed produces identical positions (deterministic)', () => {
    const a = initCrystal('det-seed');
    const b = initCrystal('det-seed');
    expect(getPointPositions(a.crystal)).toEqual(getPointPositions(b.crystal));
  });

  it('T-085-39: different seeds produce different positions', () => {
    const a = initCrystal('seed-one');
    const b = initCrystal('seed-two');
    expect(getPointPositions(a.crystal)).not.toEqual(getPointPositions(b.crystal));
  });

  // --- Shader uniforms update ---

  it('T-085-40: draw() updates uTime from elapsed time', () => {
    const { scene, crystal, mat } = initCrystal();
    crystal.draw(scene, makeFrame({ elapsed: 5000 }));
    expect(mat.uniforms.uTime.value).toBe(5000);
  });

  it('T-085-41: draw() updates uBassEnergy and uTrebleEnergy from params', () => {
    const { scene, crystal, mat } = initCrystal();
    crystal.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0.6, trebleEnergy: 0.4 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0.6);
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0.4);
  });

  it('T-085-42: mesh rotation changes over elapsed time (parallax preserved)', () => {
    const { scene, crystal, points } = initCrystal();
    crystal.draw(scene, makeFrame({ elapsed: 0 }));
    const rotY0 = points.rotation.y;
    crystal.draw(scene, makeFrame({ elapsed: 5000 }));
    expect(points.rotation.y).not.toBeCloseTo(rotY0, 5);
  });

  // --- Draw safety ---

  it('T-085-43: draw() does not throw with zero bass, treble, and pointer', () => {
    const { scene, crystal } = initCrystal();
    expect(() => crystal.draw(scene, makeFrame({
      params: { ...defaultParams, bassEnergy: 0, trebleEnergy: 0, pointerDisturbance: 0 },
      pointerX: undefined,
      pointerY: undefined,
    }))).not.toThrow();
  });

  it('T-085-44: draw() does not throw with max bass and treble', () => {
    const { scene, crystal } = initCrystal();
    expect(() => crystal.draw(scene, makeFrame({
      params: { ...defaultParams, bassEnergy: 1.0, trebleEnergy: 1.0 },
    }))).not.toThrow();
  });

  it('T-085-45: boundary density/complexity values do not throw', () => {
    const boundaries = [
      { density: 0, structureComplexity: 0 },
      { density: 0, structureComplexity: 1 },
      { density: 1, structureComplexity: 0 },
      { density: 1, structureComplexity: 1 },
    ];
    for (const b of boundaries) {
      const scene = new THREE.Scene();
      const crystal = createCrystalField();
      const params = { ...defaultParams, ...b };
      expect(() => {
        crystal.init(scene, 'boundary-seed', params);
        crystal.draw(scene, makeFrame({ params }));
      }).not.toThrow();
    }
  });

  // --- Vertex shader declarations ---

  it('T-085-46: vertex shader source contains aLatticePos attribute declaration', () => {
    const { mat } = initCrystal();
    expect(mat.vertexShader).toContain('attribute vec3 aLatticePos');
  });

  it('T-085-47: vertex shader source contains aFacetNormal attribute declaration', () => {
    const { mat } = initCrystal();
    expect(mat.vertexShader).toContain('attribute vec3 aFacetNormal');
  });

  it('T-085-48: vertex shader source contains uLatticePulse uniform declaration', () => {
    const { mat } = initCrystal();
    expect(mat.vertexShader).toContain('uniform float uLatticePulse');
  });

  it('T-085-49: vertex shader source contains uFacetShimmer uniform declaration', () => {
    const { mat } = initCrystal();
    expect(mat.vertexShader).toContain('uniform float uFacetShimmer');
  });

  it('T-085-50: vertex shader uses aLatticePos for lattice-coherent expansion', () => {
    const { mat } = initCrystal();
    // The shader should reference aLatticePos in an expansion/displacement context
    expect(mat.vertexShader).toContain('aLatticePos');
    expect(mat.vertexShader).toContain('uLatticePulse');
  });

  it('T-085-51: vertex shader uses aFacetNormal for shimmer displacement', () => {
    const { mat } = initCrystal();
    expect(mat.vertexShader).toContain('aFacetNormal');
    expect(mat.vertexShader).toContain('uFacetShimmer');
  });

  // --- Fragment shader ---

  it('T-085-52: fragment shader contains vFacetNormal varying', () => {
    const { mat } = initCrystal();
    expect(mat.fragmentShader).toContain('vFacetNormal');
  });

  // --- Privacy ---

  it('T-085-53: no localStorage or cookie access during init/draw', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const { scene, crystal } = initCrystal();
    crystal.draw(scene, makeFrame());
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  // --- Low quality / adaptive scaling ---

  it('T-085-54: maxPoints=200 produces fewer points than maxPoints=2000', () => {
    const low = initCrystal('scale-seed', defaultParams, { maxPoints: 200 });
    const high = initCrystal('scale-seed', defaultParams, { maxPoints: 2000 });
    expect(getPointCount(high.crystal)).toBeGreaterThan(getPointCount(low.crystal));
  });

  it('T-085-55: point count never exceeds maxPoints', () => {
    const maxPoints = 300;
    const { crystal } = initCrystal('cap-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 }, { maxPoints });
    expect(getPointCount(crystal)).toBeLessThanOrEqual(maxPoints);
  });
});
