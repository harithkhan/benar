import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'src/renderer'),
  plugins: [react(), tailwindcss()],
  // pnpm links packages. A package must resolve to its real path, or it does
  // not find its own dependencies.
  resolve: { preserveSymlinks: false },
  build: {
    outDir: path.resolve(import.meta.dirname, '.vite/renderer/main_window'),
    emptyOutDir: true,
    // The content policy permits 'self' only. An inlined font would be a
    // `data:` URL, which the policy blocks.
    assetsInlineLimit: 0,
  },
});
