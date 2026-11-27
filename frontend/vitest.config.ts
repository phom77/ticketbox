import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    // The classification test reads the Catalog migration that seeds the ids.
    server: { fs: { allow: ['..', '../services/catalog/src/main/resources/db/migration'] } },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
      setupFiles: ['src/test/setup.ts'],
      restoreMocks: true,
    },
  }),
);
