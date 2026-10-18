import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { createStartupCache, frontendRoot, removeStartupCache, runtimeWatchDirectories, withStartupServer } from './startup-harness.mjs';

const runsIndex = process.argv.indexOf('--runs');
const runs = runsIndex < 0 ? 3 : Number(process.argv[runsIndex + 1]);
assert(Number.isInteger(runs) && runs >= 1 && runs <= 20, '--runs must be an integer from 1 to 20');
const browser = await chromium.launch({ headless: true });
const samples = [];

async function measure(server, url, mode, trial, listeningMs) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    const errors = [], apiRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()); });
    const started = performance.now();
    const response = await page.goto(`${url}/`, { waitUntil: 'commit', timeout: 45_000 });
    assert.equal(response.status(), 200);
    const htmlResponseMs = Math.round(performance.now() - started);
    await page.locator('#home-title').waitFor({ state: 'visible', timeout: 45_000 });
    const homeMs = Math.round(performance.now() - started);
    await page.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    await page.waitForFunction(() => document.querySelector('.admeta-home')?.dataset.intro === 'full');
    const metrics = await page.evaluate(() => ({
      paints: performance.getEntriesByType('paint').map(entry => ({ name: entry.name, ms: Math.round(entry.startTime) })),
      reactReadyMs: performance.getEntriesByName('ad-meta:react-ready')[0]?.startTime ?? null,
    }));
    const runtimeDirectories = runtimeWatchDirectories(server);
    assert.deepEqual(errors, []);
    assert.deepEqual(apiRequests, []);
    assert.deepEqual(runtimeDirectories, []);
    const sample = { mode, trial, listeningMs, htmlResponseMs, homeMs, introFullMs: Math.round(performance.now() - started), ...metrics, apiRequests: 0, runtimeWatchDirectories: 0 };
    samples.push(sample);
    console.log(JSON.stringify(sample));
  } finally {
    await context.close();
  }
}

try {
  for (let trial = 1; trial <= runs; trial++) {
    const cacheDir = await createStartupCache();
    try {
      await withStartupServer(cacheDir, async (server, url, listeningMs) => {
        await measure(server, url, 'fresh-dependency-cache', trial, listeningMs);
        await measure(server, url, 'same-server-navigation', trial, listeningMs);
      });
      await withStartupServer(cacheDir, (server, url, listeningMs) => measure(server, url, 'cached-server-restart', trial, listeningMs));
    } finally {
      await removeStartupCache(cacheDir);
    }
  }
} finally {
  await browser.close();
}

const summary = Object.fromEntries([...new Set(samples.map(sample => sample.mode))].map(mode => {
  const values = samples.filter(sample => sample.mode === mode).map(sample => sample.homeMs).sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return [mode, { medianMs: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2, maxMs: values.at(-1), samples: values.length }];
}));
const report = { node: process.version, browser: browser.version(), viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce', browserCache: 'new context for every navigation', note: 'OS filesystem cache is not cleared. No existing Vite or data caches are removed.', samples, summary };
const output = path.join(frontendRoot, 'output/startup');
await mkdir(output, { recursive: true });
const target = path.join(output, `benchmark-${Date.now()}.json`);
await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ summary, report: target }));
