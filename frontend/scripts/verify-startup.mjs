import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { createStartupCache, frontendRoot, removeStartupCache, runtimeWatchDirectories, withStartupPreview, withStartupServer } from './startup-harness.mjs';

const cacheDir = await createStartupCache();
let browser;
try {
  browser = await chromium.launch({ headless: true });
  await withStartupServer(cacheDir, async (server, url) => {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.locator('#home-title').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#app-startup').count(), 0);
    assert.equal(await page.locator('html').getAttribute('data-app-ready'), 'true');
    assert.deepEqual(runtimeWatchDirectories(server), []);

    // Trigger actual Vite updates without changing the user's source files.
    for (const file of ['src/pages/home/components/HomeHero.jsx', 'src/index.css']) {
      const update = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`No hot update for ${file}`)), 10_000);
        const onConsole = message => {
          if (message.text().includes('[vite] hot updated:')) {
            clearTimeout(timeout);
            page.off('console', onConsole);
            resolve();
          }
        };
        page.on('console', onConsole);
      });
      server.watcher.emit('change', path.join(frontendRoot, file));
      await update;
      await page.locator('#home-title').waitFor({ state: 'visible' });
    }
    console.log('PASS: normal startup, no runtime watches, JSX and CSS hot updates');
    assert.deepEqual(errors, []);
    await page.close();

    const delayed = await browser.newPage({ reducedMotion: 'reduce' });
    await delayed.clock.install();
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    await delayed.route('**/src/index.jsx*', async route => { await gate; await route.continue(); });
    try {
      await delayed.goto(url, { waitUntil: 'commit' });
      await delayed.locator('#app-startup').waitFor({ state: 'visible' });
      await delayed.clock.fastForward(16_000);
      assert.match(await delayed.locator('#app-startup-message').textContent(), /加载时间较长/);
      assert.equal(await delayed.locator('#app-startup-retry').isVisible(), true);
      release();
      await delayed.locator('#home-title').waitFor({ state: 'visible' });
      await delayed.clock.fastForward(20_000);
      assert.equal(await delayed.locator('#app-startup').count(), 0);
      console.log('PASS: delayed script feedback and recovery after React commits');
    } finally {
      release();
      await delayed.close();
    }

    const failed = await browser.newPage();
    await failed.route('**/src/index.jsx*', route => route.abort('failed'));
    await failed.goto(url, { waitUntil: 'domcontentloaded' });
    await failed.waitForFunction(() => document.querySelector('#app-startup-message')?.textContent.includes('加载失败'));
    assert.equal(await failed.locator('#app-startup-retry').isVisible(), true);
    await failed.unroute('**/src/index.jsx*');
    await failed.locator('#app-startup-retry').click();
    await failed.locator('#home-title').waitFor({ state: 'visible' });
    console.log('PASS: failed script feedback and refresh retry');
    await failed.close();

    // A missing backend must produce the page's existing error state, not a blank route.
    const routes = await browser.newPage({ reducedMotion: 'reduce' });
    await routes.route(requestUrl => requestUrl.pathname.startsWith('/api/'), route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Service unavailable"}' }));
    await routes.goto(`${url}/reference/gmrepo`);
    await routes.getByRole('heading', { name: 'GMrepo 参考资源', exact: true }).waitFor({ state: 'visible' });
    await routes.goto(`${url}/analysis/abundance`);
    await routes.waitForFunction(() => document.documentElement.dataset.appReady === 'true');
    assert.equal(await routes.locator('.app-startup[role="alert"]').count(), 0);
    assert.equal(await routes.locator('#root').innerText().then(text => text.length > 0), true);
    console.log('PASS: direct GMrepo and analysis navigation with unavailable backend');
    await routes.close();
  });
  await withStartupPreview(async url => {
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.goto(url);
    await page.locator('#home-title').waitFor({ state: 'visible' });
    await page.close();
    const failed = await browser.newPage({ reducedMotion: 'reduce' });
    const entryAsset = requestUrl => /^\/assets\/index-.*\.js$/.test(requestUrl.pathname);
    await failed.route(entryAsset, route => route.abort('failed'));
    await failed.goto(url, { waitUntil: 'domcontentloaded' });
    await failed.waitForFunction(() => document.querySelector('#app-startup-message')?.textContent.includes('加载失败'));
    await failed.unroute(entryAsset);
    await failed.locator('#app-startup-retry').click();
    await failed.locator('#home-title').waitFor({ state: 'visible' });
    await failed.close();
    console.log('PASS: production build preview, entry asset failure and retry');
  });
} finally {
  if (browser) await browser.close();
  await removeStartupCache(cacheDir);
}
