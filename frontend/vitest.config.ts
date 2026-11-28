import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    // The classification test imports the shared id list from the repository's contracts directory.
    server: { fs: { allow: ['.', '../contracts'] } },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
      setupFiles: ['src/test/setup.ts'],
      restoreMocks: true,
    },
  }),
);
