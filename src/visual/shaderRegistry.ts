import * as THREE from 'three';
import type { AttributeSpec } from './types';

export interface UniformSpec {
  name: string;
  type: string;
  defaultValue: unknown;
}

export const COMMON_UNIFORMS: UniformSpec[] = [
  { name: 'uTime', type: 'float', defaultValue: 0.0 },
  { name: 'uBassEnergy', type: 'float', defaultValue: 0.0 },
  { name: 'uTrebleEnergy', type: 'float', defaultValue: 0.0 },
  { name: 'uOpacity', type: 'float', defaultValue: 1.0 },
  { name: 'uMotionAmplitude', type: 'float', defaultValue: 1.0 },
  { name: 'uPointerDisturbance', type: 'float', defaultValue: 0.0 },
  { name: 'uPointerPos', type: 'vec2', defaultValue: new THREE.Vector2(0, 0) },
  { name: 'uPaletteHue', type: 'float', defaultValue: 180 },
  { name: 'uPaletteSaturation', type: 'float', defaultValue: 0.5 },
  { name: 'uCadence', type: 'float', defaultValue: 0.7 },
  { name: 'uBreathScale', type: 'float', defaultValue: 1.0 },
  { name: 'uBasePointSize', type: 'float', defaultValue: 0.06 },
  { name: 'uNoiseFrequency', type: 'float', defaultValue: 1.0 },
  { name: 'uRadialScale', type: 'float', defaultValue: 1.0 },
  { name: 'uTwistStrength', type: 'float', defaultValue: 1.0 },
  { name: 'uFieldSpread', type: 'float', defaultValue: 1.0 },
  { name: 'uNoiseOctaves', type: 'int', defaultValue: 3 },
  { name: 'uEnablePointerRepulsion', type: 'float', defaultValue: 1.0 },
  { name: 'uEnableSlowModulation', type: 'float', defaultValue: 1.0 },
  { name: 'uDisplacementScale', type: 'float', defaultValue: 0.5 },
  { name: 'uHasSizeAttr', type: 'float', defaultValue: 0.0 },
  { name: 'uHasVertexColor', type: 'float', defaultValue: 0.0 },
  { name: 'uFogNear', type: 'float', defaultValue: 3.0 },
  { name: 'uFogFar', type: 'float', defaultValue: 8.0 },
  { name: 'uDispersion', type: 'float', defaultValue: 0.0 },
  { name: 'uFocusDistance', type: 'float', defaultValue: 5.0 },
  { name: 'uDofStrength', type: 'float', defaultValue: 0.6 },
];

export const POINTCLOUD_ATTRIBUTES: AttributeSpec[] = [
  { name: 'position', itemSize: 3 },
  { name: 'aRandom', itemSize: 3 },
  { name: 'aVertexColor', itemSize: 3 },
];

export const PARTICLEFIELD_ATTRIBUTES: AttributeSpec[] = [
  { name: 'position', itemSize: 3 },
  { name: 'aRandom', itemSize: 3 },
  { name: 'aVertexColor', itemSize: 3 },
];

export const RIBBONFIELD_ATTRIBUTES: AttributeSpec[] = [
  { name: 'position', itemSize: 3 },
  { name: 'aRandom', itemSize: 3 },
  { name: 'aVertexColor', itemSize: 3 },
  { name: 'aCurveParam', itemSize: 1 },
];

export const OPTIONAL_POINTCLOUD_ATTRIBUTES: AttributeSpec[] = [
  { name: 'size', itemSize: 1 },
];

export const OPTIONAL_PARTICLEFIELD_ATTRIBUTES: AttributeSpec[] = [
  { name: 'size', itemSize: 1 },
  { name: 'aAlpha', itemSize: 1 },
];

export const OPTIONAL_RIBBONFIELD_ATTRIBUTES: AttributeSpec[] = [
  { name: 'size', itemSize: 1 },
];

export const FLOWRIBBON_ATTRIBUTES: AttributeSpec[] = [
  { name: 'position', itemSize: 3 },
  { name: 'aRandom', itemSize: 3 },
  { name: 'aVertexColor', itemSize: 3 },
];

export const OPTIONAL_FLOWRIBBON_ATTRIBUTES: AttributeSpec[] = [
  { name: 'size', itemSize: 1 },
];

export const CONSTELLATION_ATTRIBUTES: AttributeSpec[] = [
  { name: 'position', itemSize: 3 },
  { name: 'aDistance', itemSize: 1 },
  { name: 'aRandom', itemSize: 3 },
];

export const TERRAIN_ATTRIBUTES: AttributeSpec[] = [
  { name: 'position', itemSize: 3 },
  { name: 'aRandom', itemSize: 3 },
];

export const OPTIONAL_TERRAIN_ATTRIBUTES: AttributeSpec[] = [
  { name: 'aVertexColor', itemSize: 3 },
];

export const WIREPOLYHEDRA_ATTRIBUTES: AttributeSpec[] = [
  { name: 'position', itemSize: 3 },
  { name: 'aRandom', itemSize: 3 },
];

export const WIREPOLYHEDRA_VERTEX_ATTRIBUTES: AttributeSpec[] = [
  { name: 'position', itemSize: 3 },
  { name: 'aRandom', itemSize: 3 },
];

export const OCCLUDER_ATTRIBUTES: AttributeSpec[] = [
  { name: 'position', itemSize: 3 },
  { name: 'aRandom', itemSize: 3 },
];

export const OCCLUDER_INSTANCED_ATTRIBUTES: AttributeSpec[] = [
  { name: 'position', itemSize: 3 },
];
