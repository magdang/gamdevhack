import { defineConfig } from 'vite';

/** Optional standalone production build, without changing the core-owned Vite entry points. */
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500, rolldownOptions: { input: 'demos/world.html' } },
});
