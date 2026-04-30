import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// We build to ./dist; on cPanel you upload that directory's contents into
// public_html/. The base is '/' so SPA routing works at the apex domain.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
  },
  server: { port: 5173, host: true },
});
