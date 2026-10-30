import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Essential for Electron relative asset loading
  server: {
    port: 5173,
    open: false
  },
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 1500
  }
});
