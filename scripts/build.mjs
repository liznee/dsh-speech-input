import { mkdir } from 'node:fs/promises'
import { build } from 'esbuild'

await mkdir('lib', { recursive: true })

await Promise.all([
  build({
    entryPoints: ['src/index.js'],
    outfile: 'lib/index.js',
    bundle: true,
    format: 'esm',
    platform: 'node',
    sourcemap: true,
  }),
  build({
    entryPoints: ['src/invariant.js'],
    outfile: 'lib/invariant.js',
    bundle: true,
    format: 'esm',
    platform: 'node',
    sourcemap: true,
  }),
  build({
    entryPoints: ['src/client/index.js'],
    outfile: 'lib/client.js',
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    external: ['react'],
    sourcemap: true,
    banner: {
      js: 'window.__ModuleLoader__.load({ id: "dsh-speech-input", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
    },
    footer: {
      js: 'return module.exports; } });',
    },
  }),
])
