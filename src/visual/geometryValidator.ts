import type { BufferGeometry } from 'three';
import type { AttributeSpec } from './types';

export interface GeometryValidationError {
  attribute: string;
  reason: string;
}

export interface GeometryValidationResult {
  ok: boolean;
  errors: GeometryValidationError[];
}

export function validateGeometryAttributes(
  geometry: BufferGeometry,
  expectedAttrs: AttributeSpec[],
): GeometryValidationResult {
  const errors: GeometryValidationError[] = [];

  for (const spec of expectedAttrs) {
    const attr = geometry.getAttribute(spec.name);

    if (!attr) {
      errors.push({ attribute: spec.name, reason: `missing attribute '${spec.name}'` });
      continue;
    }

    if (attr.itemSize !== spec.itemSize) {
      errors.push({
        attribute: spec.name,
        reason: `expected itemSize ${spec.itemSize}, got ${attr.itemSize}`,
      });
      continue;
    }

    const array = attr.array as Float32Array;
    for (let i = 0; i < array.length; i++) {
      if (!Number.isFinite(array[i])) {
        const kind = Number.isNaN(array[i]) ? 'NaN' : 'non-finite';
        errors.push({
          attribute: spec.name,
          reason: `${kind} value at index ${i}`,
        });
        break;
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
