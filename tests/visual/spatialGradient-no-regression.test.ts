import { describe, it, expect } from 'vitest';
import {
  POINTCLOUD_ATTRIBUTES,
  OPTIONAL_POINTCLOUD_ATTRIBUTES,
  PARTICLEFIELD_ATTRIBUTES,
  OPTIONAL_PARTICLEFIELD_ATTRIBUTES,
  RIBBONFIELD_ATTRIBUTES,
  OPTIONAL_RIBBONFIELD_ATTRIBUTES,
  FLOWRIBBON_ATTRIBUTES,
  OPTIONAL_FLOWRIBBON_ATTRIBUTES,
  CONSTELLATION_ATTRIBUTES,
  WIREPOLYHEDRA_ATTRIBUTES,
  WIREPOLYHEDRA_VERTEX_ATTRIBUTES,
} from '../../src/visual/shaderRegistry';

describe('US-075: No regression — other systems do not gain aVertexColor', () => {
  const systemSpecs = [
    { name: 'pointCloud', required: POINTCLOUD_ATTRIBUTES, optional: OPTIONAL_POINTCLOUD_ATTRIBUTES },
    { name: 'particleField', required: PARTICLEFIELD_ATTRIBUTES, optional: OPTIONAL_PARTICLEFIELD_ATTRIBUTES },
    { name: 'ribbonField', required: RIBBONFIELD_ATTRIBUTES, optional: OPTIONAL_RIBBONFIELD_ATTRIBUTES },
    { name: 'flowRibbon', required: FLOWRIBBON_ATTRIBUTES, optional: OPTIONAL_FLOWRIBBON_ATTRIBUTES },
    { name: 'constellation', required: CONSTELLATION_ATTRIBUTES, optional: [] },
    { name: 'wirePolyhedra', required: WIREPOLYHEDRA_ATTRIBUTES, optional: [] },
    { name: 'wirePolyhedraVertex', required: WIREPOLYHEDRA_VERTEX_ATTRIBUTES, optional: [] },
  ];

  for (const { name, required, optional } of systemSpecs) {
    it(`T-075-NR-${name}: ${name} required attributes do not include aVertexColor`, () => {
      const names = required.map((a) => a.name);
      expect(names).not.toContain('aVertexColor');
    });

    if (optional.length > 0) {
      it(`T-075-NR-${name}-opt: ${name} optional attributes do not include aVertexColor`, () => {
        const names = optional.map((a) => a.name);
        expect(names).not.toContain('aVertexColor');
      });
    }
  }
});
