import type { BrowserSignals } from '../input/signals';

export type QualityTier = 'low' | 'medium' | 'high';

export type ShaderComplexity = 'low' | 'medium' | 'high';

export interface QualityProfile {
  tier: QualityTier;
  maxParticles: number;
  maxPoints: number;
  maxRibbonPoints: number;

  resolutionScale: number;
  enableSparkle: boolean;
  shaderComplexity: ShaderComplexity;
  noiseOctaves: 1 | 2 | 3;
  enablePointerRepulsion: boolean;
  enableSlowModulation: boolean;
  enableConstellationLines: boolean;
  maxConstellationSegments: number;
  maxPolyhedra: number;
  maxFractalDepth: number;
  enableElectricArc: boolean;
  arcSubdivisions: number;
  enableVoronoiCells: boolean;
  maxEdgesPerShape: number;
  maxFlowRibbonPoints: number;
  enableBezierWeb: boolean;
  maxBezierConnections: number;
  bezierSegments: number;
  latticeGridSize: number;
  latticeCellSize: number;
  latticeVoidDensity: number;
  latticeJitter: number;
  maxTopologyInstances: number;
  terrainRows: number;
  terrainCols: number;
}

export function computeQuality(signals: BrowserSignals): QualityProfile {
  // Normalize each signal to 0–1 range with conservative defaults for null
  const dpr = signals.devicePixelRatio ?? 1.5;
  const cores = signals.hardwareConcurrency ?? 4;
  const memory = signals.deviceMemory ?? 4;
  const screenPixels = (signals.screenWidth ?? 1024) * (signals.screenHeight ?? 768);
  const touch = signals.touchCapable ?? false;

  // DPR score: 1 is low, 2+ is high (but high DPR on small screens isn't a capability signal)
  const dprScore = Math.min(dpr / 2, 1);

  // Core count score: 2 cores = 0, 4 cores = 0.5, 6+ cores = 1
  const coreScore = Math.min(Math.max((cores - 2) / 4, 0), 1);

  // Memory score: 1GB = 0, 4GB = 0.5, 7+ GB = 1
  const memoryScore = Math.min(Math.max((memory - 1) / 6, 0), 1);

  // Screen pixel count score: small phone (~180k px) = 0, large desktop (~3.7M px) = 1
  const pixelScore = Math.min(Math.max((screenPixels - 180000) / 3500000, 0), 1);

  // Weighted combination
  let score =
    dprScore * 0.2 +
    coreScore * 0.3 +
    memoryScore * 0.2 +
    pixelScore * 0.15;

  // Touch penalty: touch-capable devices with low core count are likely low-end phones
  if (touch && cores <= 4) {
    score -= 0.08;
  } else if (touch) {
    score -= 0.03;
  } else {
    score += 0.08;
  }

  // Clamp score
  score = Math.max(0, Math.min(1, score));

  if (score < 0.35) {
    return { tier: 'low', maxParticles: 150, maxPoints: 200, maxRibbonPoints: 200, resolutionScale: 0.5, enableSparkle: false, shaderComplexity: 'low', noiseOctaves: 1, enablePointerRepulsion: false, enableSlowModulation: false, enableConstellationLines: false, maxConstellationSegments: 0, maxPolyhedra: 3, maxFractalDepth: 3, enableElectricArc: false, arcSubdivisions: 0, enableVoronoiCells: false, maxEdgesPerShape: 30, maxFlowRibbonPoints: 200, enableBezierWeb: false, maxBezierConnections: 0, bezierSegments: 4, latticeGridSize: 3, latticeCellSize: 1.2, latticeVoidDensity: 0.4, latticeJitter: 0.25, maxTopologyInstances: 0, terrainRows: 20, terrainCols: 30 };
  }
  if (score > 0.65) {
    return { tier: 'high', maxParticles: 1000, maxPoints: 2000, maxRibbonPoints: 1600, resolutionScale: 1.0, enableSparkle: true, shaderComplexity: 'high', noiseOctaves: 3, enablePointerRepulsion: true, enableSlowModulation: true, enableConstellationLines: true, maxConstellationSegments: 3000, maxPolyhedra: 12, maxFractalDepth: 6, enableElectricArc: true, arcSubdivisions: 8, enableVoronoiCells: true, maxEdgesPerShape: 1920, maxFlowRibbonPoints: 1600, enableBezierWeb: true, maxBezierConnections: 2000, bezierSegments: 6, latticeGridSize: 7, latticeCellSize: 0.8, latticeVoidDensity: 0.25, latticeJitter: 0.35, maxTopologyInstances: 3, terrainRows: 60, terrainCols: 90 };
  }
  return { tier: 'medium', maxParticles: 550, maxPoints: 800, maxRibbonPoints: 700, resolutionScale: 0.75, enableSparkle: true, shaderComplexity: 'medium', noiseOctaves: 2, enablePointerRepulsion: true, enableSlowModulation: true, enableConstellationLines: true, maxConstellationSegments: 1500, maxPolyhedra: 6, maxFractalDepth: 4, enableElectricArc: true, arcSubdivisions: 5, enableVoronoiCells: true, maxEdgesPerShape: 480, maxFlowRibbonPoints: 700, enableBezierWeb: true, maxBezierConnections: 800, bezierSegments: 4, latticeGridSize: 5, latticeCellSize: 1.0, latticeVoidDensity: 0.3, latticeJitter: 0.3, maxTopologyInstances: 2, terrainRows: 40, terrainCols: 60 };
}

const COUNT_FIELDS: (keyof QualityProfile)[] = [
  'maxParticles', 'maxPoints', 'maxRibbonPoints',
  'maxPolyhedra', 'maxConstellationSegments', 'maxEdgesPerShape', 'maxFlowRibbonPoints',
  'maxBezierConnections', 'latticeGridSize', 'maxTopologyInstances',
  'terrainRows', 'terrainCols',
];

const COUNT_MINIMUMS: Partial<Record<keyof QualityProfile, number>> = {
  maxParticles: 50,
  maxPoints: 50,
  maxRibbonPoints: 50,

  maxPolyhedra: 2,
  maxConstellationSegments: 0,
  maxEdgesPerShape: 20,
  maxFlowRibbonPoints: 50,
  maxBezierConnections: 0,
  latticeGridSize: 2,
  maxTopologyInstances: 0,
  terrainRows: 8,
  terrainCols: 8,
};

export function scaleQualityProfile(profile: QualityProfile, factor: number): QualityProfile {
  const scaled = { ...profile };
  for (const field of COUNT_FIELDS) {
    const original = profile[field] as number;
    const min = COUNT_MINIMUMS[field] ?? 0;
    (scaled as Record<string, unknown>)[field] = Math.max(min, Math.round(original * factor));
  }
  return scaled;
}

export function extractSystemConfig(systemName: string, profile: QualityProfile): Record<string, unknown> {
  switch (systemName) {
    case 'particles':
      return { maxParticles: profile.maxParticles };
    case 'ribbon':
      return {
        maxPoints: profile.maxRibbonPoints,
        enableSparkle: profile.enableSparkle,
        noiseOctaves: profile.noiseOctaves,
        enablePointerRepulsion: profile.enablePointerRepulsion,
        enableSlowModulation: profile.enableSlowModulation,
      };
    case 'pointcloud':
      return {
        maxPoints: profile.maxPoints,
        enableSparkle: profile.enableSparkle,
        noiseOctaves: profile.noiseOctaves,
        enablePointerRepulsion: profile.enablePointerRepulsion,
        enableSlowModulation: profile.enableSlowModulation,
        useVoronoiShader: profile.enableVoronoiCells,
      };
    case 'crystal':
      return {
        maxPoints: Math.round(profile.maxPoints * 0.8),
        enableSparkle: profile.enableSparkle,
        noiseOctaves: profile.noiseOctaves,
        enablePointerRepulsion: profile.enablePointerRepulsion,
        enableSlowModulation: profile.enableSlowModulation,
      };
    case 'wirepolyhedra':
      return {
        maxPolyhedra: profile.maxPolyhedra,
        noiseOctaves: profile.noiseOctaves,
        enablePointerRepulsion: profile.enablePointerRepulsion,
        enableSlowModulation: profile.enableSlowModulation,
        enableElectricArc: profile.enableElectricArc,
        arcSubdivisions: profile.arcSubdivisions,
        maxEdgesPerShape: profile.maxEdgesPerShape,
      };
    case 'flowribbon':
      return {
        maxPoints: profile.maxFlowRibbonPoints,
        enableSparkle: profile.enableSparkle,
        noiseOctaves: profile.noiseOctaves,
        enablePointerRepulsion: profile.enablePointerRepulsion,
        enableSlowModulation: profile.enableSlowModulation,
      };
    case 'cubelattice':
      return {
        gridSize: profile.latticeGridSize,
        cellSize: profile.latticeCellSize,
        noiseOctaves: profile.noiseOctaves,
        enablePointerRepulsion: profile.enablePointerRepulsion,
        enableSlowModulation: profile.enableSlowModulation,
        jitter: profile.latticeJitter,
        voidDensity: profile.latticeVoidDensity,
      };
    case 'constellation':
      return {
        maxTopologyInstances: profile.maxTopologyInstances,
        maxConstellationSegments: profile.maxConstellationSegments,
        enableElectricArc: profile.enableElectricArc,
        arcSubdivisions: profile.arcSubdivisions,
        enableConstellationLines: profile.enableConstellationLines,
      };
    case 'fractalgrowth':
      return {
        maxFractalDepth: Math.min(profile.maxFractalDepth, 5),
        noiseOctaves: profile.noiseOctaves,
        enablePointerRepulsion: profile.enablePointerRepulsion,
        enableSlowModulation: profile.enableSlowModulation,
        maxEdgesPerShape: profile.maxEdgesPerShape,
      };
    case 'terrain':
      return {
        rows: profile.terrainRows,
        cols: profile.terrainCols,
        noiseOctaves: profile.noiseOctaves,
      };
    default:
      throw new Error(`Unknown system name: ${systemName}`);
  }
}
