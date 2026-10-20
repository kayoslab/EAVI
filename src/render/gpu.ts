import { init, type Gpu } from 'vgpu';

/** Thrown when WebGPU is unavailable or the device cannot be created. The caller shows the static page. */
export class WebGPUUnavailableError extends Error {
  readonly code: string;
  constructor(message: string, code = 'VGPU-RING1-UNSUPPORTED', options?: ErrorOptions) {
    super(message, options);
    this.name = 'WebGPUUnavailableError';
    this.code = code;
  }
}

export interface GpuCaps {
  readonly backend: 'webgpu';
  readonly maxStorageBuffersInVertexStage: number;
  readonly maxComputeWorkgroupSizeX: number;
  readonly maxBufferSize: number;
}

export interface GpuContext {
  readonly gpu: Gpu;
  readonly caps: GpuCaps;
}

/**
 * Create the vgpu context. Every init failure becomes a WebGPUUnavailableError so the
 * boot path has exactly one decision: render, or show the static message.
 */
export async function createGpu(): Promise<GpuContext> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) {
    throw new WebGPUUnavailableError('navigator.gpu is not available');
  }
  let gpu: Gpu;
  try {
    gpu = await init({
      powerPreference: 'high-performance',
      // Point layers read their simulation output from a vertex-stage storage buffer.
      requiredLimits: { maxStorageBuffersInVertexStage: 1 },
      label: 'eavi',
    });
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'VGPU-INIT-FAILED';
    throw new WebGPUUnavailableError(`WebGPU init failed (${code})`, code, { cause: err });
  }
  const limits = gpu.gpu.limits;
  return {
    gpu,
    caps: {
      backend: 'webgpu',
      maxStorageBuffersInVertexStage: limits.maxStorageBuffersInVertexStage,
      maxComputeWorkgroupSizeX: limits.maxComputeWorkgroupSizeX,
      maxBufferSize: limits.maxBufferSize,
    },
  };
}
