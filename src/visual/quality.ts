import type { BrowserSignals } from '../input/signals';

export type QualityTier = 'low' | 'medium' | 'high';

export type ShaderComplexity = 'low' | 'medium' | 'high';

export interface QualityProfile {
  tier: QualityTier;
  maxParticles: number;
  maxPoints: number;
  maxRibbonPoints: number;
  maxInstances: number;
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
    return { tier: 'low', maxParticles: 150, maxPoints: 200, maxRibbonPoints: 200, maxInstances: 200, resolutionScale: 0.5, enableSparkle: false, shaderComplexity: 'low', noiseOctaves: 1, enablePointerRepulsion: false, enableSlowModulation: false, enableConstellationLines: false, maxConstellationSegments: 0, maxPolyhedra: 3, maxFractalDepth: 3, enableElectricArc: false, arcSubdivisions: 0 };
  }
  if (score > 0.65) {
    return { tier: 'high', maxParticles: 1000, maxPoints: 2000, maxRibbonPoints: 1600, maxInstances: 1200, resolutionScale: 1.0, enableSparkle: true, shaderComplexity: 'high', noiseOctaves: 3, enablePointerRepulsion: true, enableSlowModulation: true, enableConstellationLines: true, maxConstellationSegments: 3000, maxPolyhedra: 12, maxFractalDepth: 6, enableElectricArc: true, arcSubdivisions: 8 };
  }
  return { tier: 'medium', maxParticles: 550, maxPoints: 800, maxRibbonPoints: 700, maxInstances: 600, resolutionScale: 0.75, enableSparkle: true, shaderComplexity: 'medium', noiseOctaves: 2, enablePointerRepulsion: true, enableSlowModulation: true, enableConstellationLines: true, maxConstellationSegments: 1500, maxPolyhedra: 6, maxFractalDepth: 4, enableElectricArc: true, arcSubdivisions: 5 };
}
