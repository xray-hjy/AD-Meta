import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { createApiProxy } from './api-proxy.mjs';

const base = process.env.ANALYSIS_QA_URL || 'http://127.0.0.1:3000';
const route = '/analysis/abundance?run=ad-nc-community-metaphlan4-2026-10-16&dataset=ad-nc-species&chart=species';
const output = new URL('../.tmp/analysis-loading-qa/', import.meta.url);
await mkdir(output, { recursive: true });
let isolated;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}${route}`);
  await page.locator('.chart-plain .zoomable-chart__viewport canvas').first().waitFor({ timeout: 60000 });
  assert.equal(await page.getByText('暂无已发布分析数据', { exact: true }).count(), 0);
  assert.equal(await page.getByText('分析数据加载失败', { exact: true }).count(), 0);
  await page.screenshot({ path: fileURLToPath(new URL('normal.png', output)), fullPage: true });
  console.log('PASS: live analysis renders published data');

  const failed = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  let unavailable = true;
  const catalogs = url => ['/api/datasets', '/api/analysis-runs'].includes(url.pathname);
  await failed.route(catalogs, request => unavailable
    ? request.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: '无法连接后端服务，请检查后端进程及 API 代理配置后重试。' }) })
    : request.continue());
  await failed.goto(`${base}${route}`);
  await failed.getByText('分析数据加载失败', { exact: true }).waitFor();
  assert.equal(await failed.getByText('暂无已发布分析数据', { exact: true }).count(), 0);
  await failed.screenshot({ path: fileURLToPath(new URL('unavailable.png', output)), fullPage: true });
  unavailable = false;
  await failed.getByRole('button', { name: '重试', exact: true }).click();
  await failed.locator('.chart-plain .zoomable-chart__viewport canvas').first().waitFor({ timeout: 60000 });
  assert.equal(await failed.getByText('分析数据加载失败', { exact: true }).count(), 0);
  console.log('PASS: unavailable backend shows error, retry restores real analysis');

  const empty = await browser.newPage();
  await empty.route(catalogs, request => request.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await empty.goto(`${base}/analysis/abundance`);
  await empty.getByText('暂无已发布分析数据', { exact: true }).waitFor();
  assert.equal(await empty.getByText('分析数据加载失败', { exact: true }).count(), 0);
  console.log('PASS: successful empty catalogs retain genuine empty state');

  // Reserve a port and close it, ensuring a local upstream connection refusal.
  const { createServer } = await import('node:net');
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const unusedPort = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  isolated = await preview({ configFile: false, preview: { host: '127.0.0.1', port: 0, strictPort: false, proxy: createApiProxy(`http://127.0.0.1:${unusedPort}`) } });
  const proxyPort = isolated.httpServer.address().port;
  const response = await fetch(`http://127.0.0.1:${proxyPort}/api/datasets`);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'API_UPSTREAM_UNAVAILABLE');
  console.log('PASS: real proxy connection refusal returns structured HTTP 503');
  assert.deepEqual(errors, []);
} finally {
  if (isolated) await new Promise(resolve => isolated.httpServer.close(resolve));
  await browser.close();
}
