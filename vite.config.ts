import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Relative base so assets resolve under file:// in the packaged app
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
