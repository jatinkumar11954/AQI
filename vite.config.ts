import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { DATA_ORIGINS, httpsOrigin } from './src/shared/deployment.ts';

export default defineConfig(({ mode }) => {
  const pages = mode === 'pages';
  const setting = pages ? loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE_URL : undefined;
  const apiOrigin = httpsOrigin(setting);
  if (setting && !apiOrigin) throw new Error('VITE_API_BASE_URL must be an HTTPS origin without a path.');
  const connections = pages ? apiOrigin ? [apiOrigin] : DATA_ORIGINS : [];
  const connectPolicy = ["'self'", ...connections].join(' ');
  return {
    base: pages ? './' : '/',
    plugins: [react(), tailwindcss(), {
      name: 'saansai-content-security-policy',
      apply: 'build',
      transformIndexHtml() {
        return [{
          tag: 'meta', injectTo: 'head-prepend',
          attrs: {
            'http-equiv': 'Content-Security-Policy',
            content: `default-src 'self'; script-src 'self'; connect-src ${connectPolicy}; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'`,
          },
        }];
      },
    }],
    build: { outDir: pages ? 'dist/pages' : 'dist/client' },
  };
});
