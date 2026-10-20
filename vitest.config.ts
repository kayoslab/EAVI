import { defineConfig } from 'vitest/config';
import wgslVitePlugin from '@vgpu/wgsl/loader-vite';

export default defineConfig({
  plugins: [wgslVitePlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    restoreMocks: true,
    // Booting main.ts under jsdom transforms thirty shader modules; give it room.
    testTimeout: 30_000,
    setupFiles: ['./tests/setup.ts'],
  },
});
