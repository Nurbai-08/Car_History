import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('../..', import.meta.url)), '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@carhistory/validation': fileURLToPath(
          new URL('../../packages/validation/src/index.ts', import.meta.url),
        ),
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: Number(new URL(env.FRONTEND_URL || 'http://localhost:5173').port) || 5173,
      strictPort: true,
      watch: { usePolling: true, interval: 400 },
      proxy: { '/api': env.API_URL || 'http://127.0.0.1:3001' },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            charts: ['recharts'],
            forms: ['react-hook-form', '@hookform/resolvers/zod', 'zod'],
            vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
          },
        },
      },
    },
  };
});
