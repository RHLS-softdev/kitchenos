import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Explicit safety net: under vitest (vite 8 + vitest 3), esbuild's JSX
  // handling for .jsx test files wasn't picking up plugin-react's automatic
  // runtime the way `vite dev`/`vite build` do, producing "React is not
  // defined" for every component that (correctly, per React 17+) doesn't
  // import React itself. Doesn't change dev/build behaviour, only fixes it
  // for the test runner.
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
  },
})
