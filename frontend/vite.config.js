import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// We build to ./dist; on cPanel you upload that directory's contents into
// public_html/. The base is '/' so SPA routing works at the apex domain.
/**
 * Opens the TCP + TLS connection to Supabase and the API while the JS bundle
 * is still parsing. The session check and the bootstrap call fire the moment
 * React mounts; without this they each start from a cold connection, which on
 * a mobile network is a few hundred milliseconds before a single byte moves.
 *
 * The hosts come from env, so this can't be hardcoded in index.html.
 */
function preconnectOrigins() {
  return {
    name: 'preconnect-origins',
    transformIndexHtml(html, ctx) {
      const origins = [ctx?.server ? null : process.env.VITE_SUPABASE_URL, process.env.VITE_API_BASE]
        .filter(Boolean)
        .map((u) => { try { return new URL(u).origin; } catch { return null; } })
        .filter((o, i, a) => o && a.indexOf(o) === i);
      if (!origins.length) return html;
      const tags = origins
        .map((o) => `    <link rel="preconnect" href="${o}" crossorigin />`)
        .join('\n');
      const anchor = '    <link rel="preconnect" href="https://fonts.googleapis.com" />';
      return html.includes(anchor) ? html.replace(anchor, `${tags}\n${anchor}`) : html;
    },
  };
}

export default defineConfig({
  plugins: [react(), preconnectOrigins()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Vendor code changes far less often than ours. Splitting it means a
        // returning merchant re-downloads only what actually changed instead
        // of the whole bundle after every deploy.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  server: { port: 5173, host: true },
});
