import type { Gpu } from 'vgpu';

export type HealthStatus = 'pending' | 'pass' | 'fail';

export interface HealthReport {
  readonly code: string;
  readonly message: string;
  readonly where?: string;
}

export interface HealthGate {
  readonly status: HealthStatus;
  readonly errors: readonly HealthReport[];
  /** Run every compile-ahead task; any rejection or asynchronous vgpu error fails the gate. */
  compileAll(tasks: readonly (() => Promise<unknown>)[]): Promise<boolean>;
  /** Wait for submitted work and error deliveries, then re-evaluate. */
  settle(): Promise<boolean>;
  dispose(): void;
}

function describe(err: unknown): HealthReport {
  const e = err as { code?: string; message?: string; where?: string };
  return {
    code: typeof e?.code === 'string' ? e.code : 'UNKNOWN',
    message: typeof e?.message === 'string' ? e.message : String(err),
    ...(typeof e?.where === 'string' ? { where: e.where } : {}),
  };
}

/**
 * Health gate v2: every pipeline of the active recipe is compiled ahead, asynchronous vgpu
 * errors and native uncaptured errors are collected, and the gate fails on any of them.
 */
export function createHealthGate(gpu: Gpu): HealthGate {
  const errors: HealthReport[] = [];
  let status: HealthStatus = 'pending';

  const unsubscribe = gpu.onError((err) => {
    const report = describe(err);
    errors.push(report);
    status = 'fail';
    console.error('[EAVI health-gate] vgpu error', report);
  });

  const onUncaptured = (event: Event) => {
    const e = event as Event & { error?: { message?: string } };
    const report = { code: 'GPU-UNCAPTURED', message: e.error?.message ?? 'uncaptured GPU error' };
    errors.push(report);
    status = 'fail';
    console.error('[EAVI health-gate] uncaptured GPU error', report);
  };
  gpu.gpu.addEventListener('uncapturederror', onUncaptured);

  return {
    get status() {
      return status;
    },
    get errors() {
      return errors;
    },
    async compileAll(tasks) {
      const results = await Promise.allSettled(tasks.map((task) => task()));
      for (const r of results) {
        if (r.status === 'rejected') {
          const report = describe(r.reason);
          errors.push(report);
          console.error('[EAVI health-gate] compile failed', report);
        }
      }
      status = errors.length === 0 ? 'pass' : 'fail';
      return status === 'pass';
    },
    async settle() {
      await gpu.settled();
      if (status !== 'fail') status = errors.length === 0 ? 'pass' : 'fail';
      return status === 'pass';
    },
    dispose() {
      unsubscribe();
      gpu.gpu.removeEventListener('uncapturederror', onUncaptured);
    },
  };
}
