import { defineConfig } from 'vitest/config';
import wgslVitePlugin from '@vgpu/wgsl/loader-vite';

export default defineConfig({
  plugins: [wgslVitePlugin()],
  test: {
    environment: 'jsdom',
    globals: true,
    restoreMocks: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
