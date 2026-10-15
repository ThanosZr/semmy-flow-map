import { defineConfig } from 'vite';

// Three.js ships from a pinned CDN build in production so the app bundle stays small.
// Set BUNDLE_THREE=1 (npm run build:offline) to bundle it instead, for fully offline hosting.
const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const bundleThree = typeof process !== 'undefined' && process.env.BUNDLE_THREE === '1';

export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: bundleThree
      ? {}
      : { external: ['three'], output: { paths: { three: THREE_CDN } } },
  },
});
