import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { build } from 'esbuild';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
};

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

const clientDir = join(process.cwd(), 'dist', 'client');
const manifest = {};
for (const file of walk(clientDir)) {
  const rel = '/' + relative(clientDir, file).replace(/\\/g, '/');
  manifest[rel] = {
    type: MIME[extname(file)] ?? 'application/octet-stream',
    base64: readFileSync(file).toString('base64'),
  };
}

const entry = join(process.cwd(), 'dist', '.worker-entry.mjs');
writeFileSync(
  entry,
  `globalThis.__SAANS_ASSETS__ = ${JSON.stringify(manifest)};\nexport { default } from '../src/server/worker.ts';\n`,
);

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['workerd', 'worker', 'browser'],
  minify: true,
  target: 'es2022',
  outfile: 'dist/worker.mjs',
});

mkdirSync('dist/server', { recursive: true });
copyFileSync('dist/worker.mjs', 'dist/server/index.js');

console.log('Built dist/worker.mjs with ' + Object.keys(manifest).length + ' embedded static assets.');
