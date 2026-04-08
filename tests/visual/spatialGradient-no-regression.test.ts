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

describe('US-075: No regression — non-visual systems do not gain aVertexColor', () => {
  // US-081: pointCloud, particleField, ribbonField, flowRibbon now use aVertexColor
  const systemSpecs = [
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
