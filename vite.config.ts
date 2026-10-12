import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat'] },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
