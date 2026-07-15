import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

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
    baseURL: 'http://127.0.0.1:4173',
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
      command: `${python} -m uvicorn app.main:app --host 127.0.0.1 --port 8000`,
      cwd: backendRoot,
      url: 'http://127.0.0.1:8000/api/health/live',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run build && npm run preview',
      cwd: frontendRoot,
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
