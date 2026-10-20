// Node module hooks so plain `node` scripts can import the app sources the way Vite does:
// `.wgsl` files become prepared ShaderSource modules, and extensionless relative imports resolve to `.ts`.
// Usage: node --import ./scripts/registerWgsl.ts scripts/renderPoster.ts

import { transformWgsl } from '@vgpu/wgsl/loader-vite';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function exists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

export async function resolve(
  specifier: string,
  context: { parentURL?: string },
  next: (specifier: string, context: unknown) => Promise<{ url: string; format?: string; shortCircuit?: boolean }>,
) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[a-z]+$/i.test(specifier) && context.parentURL) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    for (const candidate of [`${base}.ts`, `${base}/index.ts`]) {
      if (await exists(candidate)) return { url: pathToFileURL(candidate).href, format: 'module-typescript', shortCircuit: true };
    }
  }
  return next(specifier, context);
}

export async function load(
  url: string,
  context: unknown,
  next: (url: string, context: unknown) => Promise<{ format: string; source?: string | Buffer; shortCircuit?: boolean }>,
) {
  const parsed = new URL(url);
  if (parsed.protocol === 'file:' && parsed.pathname.endsWith('.wgsl')) {
    // Generated shader modules import private metadata requests with a query; the id keeps it.
    const path = fileURLToPath(`${parsed.protocol}//${parsed.pathname}`);
    const source = await readFile(path, 'utf8');
    const result = await transformWgsl(source, path + parsed.search);
    return { format: 'module', source: result.code, shortCircuit: true };
  }
  return next(url, context);
}
