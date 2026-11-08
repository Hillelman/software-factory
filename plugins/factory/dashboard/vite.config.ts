import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  server: {
    // `pnpm dev` talks to a dashboard started with `factory dashboard start`.
    proxy: { '/api': `http://localhost:${process.env.FACTORY_PORT ?? 4317}` },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 800 },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
