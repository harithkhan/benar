import { VitePlugin } from '@electron-forge/plugin-vite';
import type { ForgeConfig } from '@electron-forge/shared-types';

// `pnpm package` writes out/Benar-darwin-arm64/Benar.app. The app has no
// makers: scripts/install-app.mjs copies the package to /Applications.
const config: ForgeConfig = {
  packagerConfig: {
    name: 'Benar',
    asar: true,
    appBundleId: 'io.github.harithkhan.benar',
    appCategoryType: 'public.app-category.productivity',
  },
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main/main.ts', config: 'vite.main.config.ts', target: 'main' },
        { entry: 'src/preload/preload.ts', config: 'vite.preload.config.ts', target: 'preload' },
      ],
      renderer: [{ name: 'main_window', config: 'vite.renderer.config.ts' }],
    }),
  ],
};

export default config;
