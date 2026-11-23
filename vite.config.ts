import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build loads from the iOS app bundle.
  base: './',
  build: {
    // Oldest supported WebView: iPadOS 15 (e.g. iPad Pro 2nd generation runs iPadOS 15–17).
    // three.js uses class static blocks (Safari 16.4+), so syntax must be lowered.
    target: 'safari15',
    cssTarget: 'safari15',
    // Rapier ships its WASM inlined in the JS bundle.
    chunkSizeWarningLimit: 6000,
  },
  server: {
    host: true,
  },
});
