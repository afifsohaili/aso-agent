import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/cli.ts'],
  outDir: 'dist',
  format: 'esm',
  bundle: true,
  platform: 'node',
  target: 'node20',
})
