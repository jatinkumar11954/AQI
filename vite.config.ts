import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: 'saansai-content-security-policy',
    apply: 'build',
    transformIndexHtml() {
      return [{
        tag: 'meta', injectTo: 'head-prepend',
        attrs: {
          'http-equiv': 'Content-Security-Policy',
          content: "default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'",
        },
      }];
    },
  }],
  build: { outDir: 'dist/client' },
});
