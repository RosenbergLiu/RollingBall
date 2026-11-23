import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Dev-only endpoint used by tools/art.html to save rendered artwork (app icon, launch
 * screen) into resources/. Only accepts requests from this machine.
 */
function saveArtwork(): Plugin {
  return {
    name: 'rolling-ball-save-artwork',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__save-artwork', (req, res) => {
        const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
        const name = new URL(req.url ?? '', 'http://localhost').searchParams.get('name') ?? '';
        if (req.method !== 'POST' || !local || !/^[a-z0-9-]+\.png$/.test(name)) {
          res.statusCode = 400;
          res.end('rejected');
          return;
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          mkdirSync('resources', { recursive: true });
          writeFileSync(join('resources', name), Buffer.concat(chunks));
          res.end('saved');
        });
      });
    },
  };
}

export default defineConfig({
  // Relative asset paths so the build loads from the iOS app bundle.
  base: './',
  plugins: [saveArtwork()],
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
