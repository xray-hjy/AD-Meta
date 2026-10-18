import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createApiProxy, resolveApiProxyTarget } from './scripts/api-proxy.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const apiProxy = createApiProxy(resolveApiProxyTarget(process.env, loadEnv(mode, root, 'VITE_')));
  return {
  plugins: [react()],
  optimizeDeps: {
    entries: ['index.html'],
  },
  server: {
    host: '127.0.0.1',
    port: 3000,
    strictPort: true,
    proxy: apiProxy,
    watch: {
      ignored: ['**/.tmp/**', '**/coverage/**', '**/output/**'],
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    proxy: apiProxy,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/zrender/')) return 'zrender';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.js',
    include: ['src/**/*.test.{js,jsx}'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/**/*.test.{js,jsx}', 'src/api/generated.ts', 'src/index.jsx'],
      thresholds: {
        statements: 70,
        branches: 60,
      },
    },
  },
  };
});
