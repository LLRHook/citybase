/// <reference types="vitest" />
import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'

const testExclude = [...configDefaults.exclude, 'e2e/**', 'build/**', '.claude/worktrees/**']

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    globals: true,
    exclude: testExclude,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/tests/**/*.test.js'],
          exclude: [...testExclude, 'src/tests/citybaseApi.test.js'],
        },
      },
      {
        extends: true,
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['src/tests/**/*.test.jsx', 'src/tests/citybaseApi.test.js'],
          setupFiles: ['./src/tests/setup.js'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.{js,jsx}', 'electron/**/*.cjs', 'core/**/*.cjs'],
      exclude: ['src/tests/**'],
    },
  },
})
