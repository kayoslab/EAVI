import type { FramingConfig, GeometrySystem } from './types';
import type { QualityProfile } from './quality';
import { scaleQualityProfile, extractSystemConfig } from './quality';

export interface CompoundLayerDef {
  systemName: string;
  isPrimary: boolean;
}

export interface CompoundModeDef {
  name: string;
  layers: [CompoundLayerDef, CompoundLayerDef];
  weight?: number;
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
  framing: FramingConfig;
  weight?: number;
}

// Default framing per system name — compound modes use the primary layer's framing, slightly farther back
const SYSTEM_FRAMING: Record<string, FramingConfig> = {
  particles: { targetDistance: 4.5, lookOffset: [0, 0, 0], nearClip: 0.1, farClip: 50 },
  ribbon: { targetDistance: 3.0, lookOffset: [0, 0, 0], nearClip: 0.1, farClip: 30 },
  pointcloud: { targetDistance: 3.5, lookOffset: [0, 0, 0], nearClip: 0.1, farClip: 40 },
  crystal: { targetDistance: 6.0, lookOffset: [0, 0, 0], nearClip: 0.1, farClip: 80 },
  flowribbon: { targetDistance: 5.5, lookOffset: [0, 0, 0], nearClip: 0.1, farClip: 60 },
  fractalgrowth: { targetDistance: 3.0, lookOffset: [0, 0, 0], nearClip: 0.1, farClip: 30 },
  terrain: { targetDistance: 14.0, lookOffset: [0, 3.0, 0], nearClip: 0.1, farClip: 100 },
};

const DEFAULT_COMPOUND_FRAMING: FramingConfig = {
  targetDistance: 5.0, lookOffset: [0, 0, 0], nearClip: 0.1, farClip: 60,
};

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
    weight: 2,
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

    // Use primary layer's framing, pulled back slightly for compound modes
    const primaryName = def.layers[primaryIndex].systemName;
    const baseFraming = SYSTEM_FRAMING[primaryName] ?? DEFAULT_COMPOUND_FRAMING;
    const compoundFraming: FramingConfig = {
      targetDistance: baseFraming.targetDistance * 1.15,
      lookOffset: [...baseFraming.lookOffset] as [number, number, number],
      nearClip: baseFraming.nearClip,
      farClip: Math.max(baseFraming.farClip, baseFraming.targetDistance * 1.15 * 8),
    };

    return {
      kind: 'compound' as const,
      name: def.name,
      layers: layerEntries,
      primaryLayerIndex: primaryIndex,
      maxPoints: totalPoints,
      framing: compoundFraming,
      ...(def.weight !== undefined ? { weight: def.weight } : {}),
    };
  });
}
