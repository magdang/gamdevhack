import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any static host or sub-path.
  base: './',
  server: { host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
