// front/vite.config.ts
// Minimal typing to avoid requiring @types/node in this config file.
declare const process: { cwd: () => string; env: Record<string, string | undefined> };

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const API_BASE = env.VITE_API_BASE_URL || 'http://localhost:5000';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: API_BASE,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
