import type { GeometrySystem } from './types';
import type { QualityProfile } from './quality';
import { scaleQualityProfile, extractSystemConfig } from './quality';

export interface CompoundLayerDef {
  systemName: string;
  isPrimary: boolean;
}

export interface CompoundModeDef {
  name: string;
  layers: [CompoundLayerDef, CompoundLayerDef];
}

export interface CompoundLayerEntry {
  system: GeometrySystem;
  name: string;
}

export interface CompoundRotationEntry {
  kind: 'compound';
  name: string;
  layers: [CompoundLayerEntry, CompoundLayerEntry];
  primaryLayerIndex: 0 | 1;
  maxPoints: number;
}

export const COMPOUND_MODE_DEFS: CompoundModeDef[] = [
  {
    name: 'particles+flowribbon',
    layers: [
      { systemName: 'particles', isPrimary: true },
      { systemName: 'flowribbon', isPrimary: false },
    ],
  },
  {
    name: 'pointcloud+fractalgrowth',
    layers: [
      { systemName: 'pointcloud', isPrimary: true },
      { systemName: 'fractalgrowth', isPrimary: false },
    ],
  },
];

export type SystemFactory = (config: Record<string, unknown>) => GeometrySystem;
export type SystemRegistry = Record<string, SystemFactory>;

const COMPOUND_SCALE = 0.5;

function primaryCountForSystem(systemName: string, config: Record<string, unknown>): number {
  switch (systemName) {
    case 'particles': return (config.maxParticles as number) ?? 0;
    case 'pointcloud':
    case 'crystal':
    case 'ribbon':
    case 'flowribbon': return (config.maxPoints as number) ?? 0;

    case 'fractalgrowth': return (config.maxEdgesPerShape as number) ?? 0;
    default: return 0;
  }
}

export function buildCompoundEntries(
  quality: QualityProfile,
  registry: SystemRegistry,
): CompoundRotationEntry[] {
  if (quality.tier === 'low') return [];

  const scaled = scaleQualityProfile(quality, COMPOUND_SCALE);

  return COMPOUND_MODE_DEFS.map((def) => {
    const primaryIndex = def.layers.findIndex((l) => l.isPrimary) as 0 | 1;
    let totalPoints = 0;

    const layerEntries = def.layers.map((layerDef) => {
      const config = extractSystemConfig(layerDef.systemName, scaled);
      const factory = registry[layerDef.systemName];
      if (!factory) throw new Error(`No factory for system: ${layerDef.systemName}`);
      totalPoints += primaryCountForSystem(layerDef.systemName, config);
      return {
        system: factory(config),
        name: layerDef.systemName,
      };
    }) as [CompoundLayerEntry, CompoundLayerEntry];

    return {
      kind: 'compound' as const,
      name: def.name,
      layers: layerEntries,
      primaryLayerIndex: primaryIndex,
      maxPoints: totalPoints,
    };
  });
}
