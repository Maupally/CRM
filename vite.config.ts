/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
  build: { outDir: 'dist' },
  // the in-memory Postgres starts slowly on a cold machine
  test: { testTimeout: 30_000, hookTimeout: 60_000 },
});
