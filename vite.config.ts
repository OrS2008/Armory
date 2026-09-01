import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Which build is live is otherwise unanswerable: Cloudflare Pages builds on a
 * push and nothing in the served page says which commit it came from. Pages
 * exports CF_PAGES_COMMIT_SHA to the build; a local build says "dev".
 */
const buildRef = (process.env.CF_PAGES_COMMIT_SHA ?? '').slice(0, 7) || 'dev';

/**
 * The same answer, without having to sign in for it.
 *
 * The settings screen already prints the build reference, but reading it means
 * being an administrator on the deployed site — no use for asking "did the push
 * I just made actually go live". A static file beside the bundle answers that
 * with one unauthenticated request, which is what a deploy check needs.
 */
const versionFile = {
  name: 'version-file',
  generateBundle(this: { emitFile: (file: Record<string, string>) => void }) {
    this.emitFile({
      type: 'asset',
      fileName: 'version.json',
      source: JSON.stringify({ ref: buildRef, builtAt: new Date().toISOString() }),
    });
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile],
  define: { __BUILD_REF__: JSON.stringify(buildRef) },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  build: { target: 'es2022', sourcemap: true },
  server: { port: 4174 },
});
