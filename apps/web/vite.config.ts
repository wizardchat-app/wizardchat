import { createReadStream, existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

const readJson = (path: string) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf-8'));
const packageJson = readJson('./package.json');
// One version for the whole repo, in the root package.json
const appVersion: string = readJson('../../package.json').version;

// Emits version.txt so the running app can notice a new deployment
function versionFilePlugin(): Plugin {
  return {
    name: 'version-file',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.txt', source: appVersion });
    },
  };
}

// The shared sounds (packages/sounds/raw) at /assets/sounds/<name>.wav: served in dev, copied into builds
const soundsDir = fileURLToPath(new URL('../../packages/sounds/raw/', import.meta.url));
function soundsPlugin(): Plugin {
  return {
    name: 'shared-sounds',
    configureServer(server) {
      server.middlewares.use('/assets/sounds', (req, res, next) => {
        const file = join(soundsDir, basename(decodeURIComponent((req.url ?? '').split('?')[0])));
        if (!file.endsWith('.wav') || !existsSync(file)) return next();
        res.setHeader('Content-Type', 'audio/wav');
        createReadStream(file).pipe(res);
      });
    },
    generateBundle() {
      for (const file of readdirSync(soundsDir).filter((name) => name.endsWith('.wav'))) {
        this.emitFile({
          type: 'asset',
          fileName: `assets/sounds/${file}`,
          source: readFileSync(join(soundsDir, file)),
        });
      }
    },
  };
}

const corePkg = fileURLToPath(new URL('../../crates/wasm/pkg/', import.meta.url));
export default defineConfig(({ mode }) => {
  // The desktop app runs the core natively in Tauri and talks to it over IPC
  const desktop = mode === 'desktop';
  return {
    plugins: [react(), vanillaExtractPlugin(), versionFilePlugin(), soundsPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        // The generated core API, over Tauri IPC on desktop or the wasm build (`npm run core:web`)
        '@wizardchat/core': fileURLToPath(
          new URL(desktop ? './src/core/rpc/desktop.ts' : './src/core/rpc/web.ts', import.meta.url)
        ),
        '@wizardchat/core-wasm': `${corePkg}wizardchat_core.js`,
        // Release notes for every app, at the repo root
        '@whatsnew': fileURLToPath(new URL('../../whatsnew', import.meta.url)),
      },
    },
    server: {
      port: desktop ? 5190 : 5180,
      // Firefox gathers no ICE candidates on pages served from ::1, so calls never connect
      host: desktop ? undefined : '127.0.0.1',
      strictPort: desktop,
      fs: { allow: ['../..'] },
    },
    define: {
      'import.meta.env.APP_VERSION': JSON.stringify(appVersion),
      'import.meta.env.DESKTOP': JSON.stringify(desktop),
      'import.meta.env.GIF_API_URL': JSON.stringify(
        process.env.GIF_API_URL ?? 'https://gifs.wizardchat.org'
      ),
      'import.meta.env.APP_HOME_URL': JSON.stringify(
        packageJson.homepage ?? 'https://wizardchat.org'
      ),
    },
    optimizeDeps: { exclude: ['@wizardchat/core-wasm'] },
    build: { target: 'es2022', outDir: desktop ? 'dist-desktop' : 'dist' },
  };
});
