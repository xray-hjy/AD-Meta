import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

import {
  e2eApiProxyTarget,
  e2eBackendEnvironment,
  e2eBackendPort,
  e2eBaseUrl,
  e2eFrontendPort,
} from './e2e/environment.js';

const frontendRoot = path.basename(process.cwd()) === 'frontend'
  ? process.cwd()
  : path.resolve(process.cwd(), 'frontend');
const backendRoot = path.resolve(frontendRoot, '../backend');
const python = process.env.CI ? 'python' : '.venv/bin/python';

export default defineConfig({
  testDir: './e2e',
  outputDir: './output/playwright/results',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['line'], ['html', { outputFolder: './output/playwright/report', open: 'never' }]]
    : 'line',
  use: {
    baseURL: e2eBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port ${e2eBackendPort}`,
      cwd: backendRoot,
      env: { ...process.env, ...e2eBackendEnvironment },
      url: `http://127.0.0.1:${e2eBackendPort}/api/health/live`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run build && npm run preview -- --port ${e2eFrontendPort}`,
      cwd: frontendRoot,
      env: { ...process.env, VITE_API_PROXY_TARGET: e2eApiProxyTarget },
      url: e2eBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
