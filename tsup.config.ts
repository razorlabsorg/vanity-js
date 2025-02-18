import { defineConfig } from 'tsup'

export default defineConfig((options) => ({
  entry: {
    index: 'app.ts',
  },
  sourcemap: true,
  skipNodeModulesBundle: true,
  format: ['esm', 'cjs'],
  dts: true,
  clean: !options.watch,
  treeshake: true,
  splitting: true,
}))
