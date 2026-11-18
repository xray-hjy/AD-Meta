import { chromium, expect, test as base } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// tabs.setZoom changes native browser page zoom (including CSS viewport and
// DPR). CSS zoom, emulated viewport sizes and pinch zoom are different tests.
const test = base.extend({
  zoomPage: async ({ baseURL }, provide) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'ad-meta-zoom-'));
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ manifest_version: 3,
      name: 'Isolated chart zoom QA', version: '1.0', permissions: ['tabs'],
      background: { service_worker: 'background.js' } }));
    await writeFile(path.join(directory, 'background.js'), 'chrome.runtime.onInstalled.addListener(() => {});');
    const context = await chromium.launchPersistentContext(path.join(directory, 'profile'), {
      channel: 'chromium', headless: true, viewport: null, deviceScaleFactor: undefined, baseURL,
      args: ['--window-size=1920,1080', `--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
    });
    try {
      const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
      const page = context.pages()[0];
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
      const zoom = async factor => {
        const applied = await worker.evaluate(async value => {
          const [tab] = await globalThis.chrome.tabs.query({ active: true, currentWindow: true });
          await globalThis.chrome.tabs.setZoom(tab.id, value);
          return globalThis.chrome.tabs.getZoom(tab.id);
        }, factor);
        expect(applied).toBeCloseTo(factor, 4);
        await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBeCloseTo(factor, 3);
      };
      await provide({ page, zoom, errors });
    } finally { await context.close(); await rm(directory, { recursive: true, force: true }); }
  },
});

async function geometry(page) {
  return page.locator('.taxonomy-chart-surface').first().evaluate(element => {
    let fiber = element[Object.keys(element).find(key => key.startsWith('__reactFiber$'))], chart;
    while (fiber && !chart) { chart = fiber.stateNode?.getEchartsInstance?.(); fiber = fiber.return; }
    if (!chart || chart.isDisposed() || !chart.getOption()?.series?.length) return { ready: false, chartWidth: -1, domWidth: -100, available: 1 };
    const scroller = element.closest('.taxonomy-sankey-scroll');
    const padding = scroller ? getComputedStyle(scroller) : null;
    const available = scroller ? scroller.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight) : element.clientWidth;
    const series = chart.getOption().series[0];
    return { ready: true, viewport: innerWidth, dpr: devicePixelRatio, available, domWidth: element.clientWidth,
      chartWidth: chart.getWidth(), chartHeight: chart.getHeight(), domHeight: element.clientHeight,
      canvasWidth: element.querySelector('canvas')?.width, canvasHeight: element.querySelector('canvas')?.height,
      values: series.data.map(node => node.value), links: series.links?.map(link => link.value) };
  });
}

test('native page zoom relayouts the complete Sankey across 100%, 80%, 125% and 33%', async ({ zoomPage }) => {
  const { page, zoom, errors } = zoomPage;
  if (process.env.AD_META_E2E_REAL_TAXONOMY) {
    const model = JSON.parse(await readFile(process.env.AD_META_E2E_REAL_TAXONOMY, 'utf8')).sankey;
    await page.route('**/projections/taxonomy_sankey', async route => {
      const response = await route.fetch(), body = await response.json();
      body.payload = model;
      body.dataSemantics.abundanceScale = 'relative_abundance';
      Object.assign(body.projection, { sampleCount: 185, sourceFeatureCount: 1828, displayedNodeCount: model.nodes.length,
        mergedCategoryCount: model.nodes.reduce((sum, node) => sum + Number(node.mergedCount || 0), 0) });
      await route.fulfill({ response, json: body });
    });
  }
  await page.goto('/analysis/abundance?dataset=ad-nc-species&chart=sankey');
  await expect(page).toHaveTitle(/AD-Meta/);
  await expect(page.locator('.taxonomy-chart-surface canvas')).toBeVisible();
  await expect.poll(async () => (await geometry(page)).ready).toBe(true);
  const original = await geometry(page);
  const baseline = process.env.AD_META_ZOOM_CAPTURE_BASELINE === '1';
  const states = [];
  for (const factor of [1, .8, 1.25, .33, 1]) {
    await zoom(factor);
    await expect.poll(async () => Math.abs((await geometry(page)).chartWidth - (await geometry(page)).domWidth)).toBeLessThan(2);
    if (!baseline) await expect.poll(async () => {
      const state = await geometry(page);
      return state.chartWidth / state.available;
    }).toBeGreaterThan(.99);
    if (!baseline) await expect.poll(async () => {
      const state = await geometry(page);
      return Math.abs(state.canvasWidth / state.chartWidth - Math.min(state.dpr, 1.5));
    }).toBeLessThan(.01);
    const state = await geometry(page);
    expect(state.values).toEqual(original.values);
    expect(state.links).toEqual(original.links);
    expect(state.chartWidth * state.chartHeight).toBeLessThanOrEqual(12_000_000);
    expect(await page.locator('.taxonomy-sankey-scroll').evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
    states.push({ zoom: factor, ...state, values: state.values.length, links: state.links?.length });
    if (!baseline && factor !== 1) {
      await page.getByRole('button', { name: '隐藏标签', exact: true }).click();
      await page.getByRole('button', { name: '显示标签', exact: true }).click();
    }
    if (factor === .33 || factor === 1) {
      await page.locator('.taxonomy-viewport').evaluate(el => el.scrollIntoView({ block: 'start' }));
      // Native browser zoom changes CSS viewport dimensions. Capture the actual
      // physical viewport instead of asking for a CSS-sized beyond-viewport clip.
      const session = await page.context().newCDPSession(page);
      const shot = await session.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      await writeFile(path.join(os.tmpdir(), `opt006-${baseline ? 'before' : 'after'}-${Math.round(factor * 100)}.png`), Buffer.from(shot.data, 'base64'));
      await session.detach();
    }
  }
  console.log(JSON.stringify({ nativeZoomStates: states }));
  if (baseline) return;
  for (const width of [1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(async () => { const state = await geometry(page); return Math.abs(state.chartWidth - Math.max(1228, Math.floor(state.available))); }).toBeLessThan(2);
  }
  await page.getByRole('button', { name: '隐藏标签', exact: true }).click();
  await page.getByRole('button', { name: '显示标签', exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整桑基图 PNG', exact: true }).click();
  const png = await readFile(await (await downloadEvent).path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.readUInt32BE(16) * png.readUInt32BE(20)).toBeLessThanOrEqual(32_000_000);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const mode of ['sunburst', 'treemap', 'radialtree']) {
  test(`${mode} keeps its geometry and operations after native browser zoom`, async ({ zoomPage }) => {
    const { page, zoom, errors } = zoomPage;
    await page.goto(`/analysis/abundance?dataset=ad-nc-species&chart=${mode}`);
    await expect(page.locator('.taxonomy-chart-surface')).toBeVisible();
    const original = await geometry(page);
    for (const factor of [.8, 1.25, .33, 1]) {
      await zoom(factor);
      await expect.poll(async () => { const state = await geometry(page); return Math.abs(state.chartWidth - state.domWidth); }).toBeLessThan(2);
      const state = await geometry(page);
      expect(state.values).toEqual(original.values);
      if (mode === 'treemap') await expect.poll(() => page.locator('.taxonomy-treemap-panel').evaluate(el => el.clientWidth / el.parentElement.clientWidth)).toBeGreaterThan(.98);
      else expect(Math.abs(state.chartWidth - state.chartHeight)).toBeLessThan(2);
    }
    await page.getByRole('button', { name: '隐藏标签', exact: true }).click();
    await page.getByRole('button', { name: '显示标签', exact: true }).click();
    await page.getByRole('button', { name: '恢复全图', exact: true }).click();
    expect(errors).toEqual([]);
  });
}

for (const mode of ['pca', 'pcoa']) {
  test(`${mode} preserves equal axis units and sample coordinates across browser zoom`, async ({ zoomPage }) => {
    const { page, zoom, errors } = zoomPage;
    await page.goto(`/analysis/abundance?dataset=ad-nc-species&chart=${mode}`);
    const element = page.locator('.ordination-chart__surface .echarts-for-react');
    await expect(element).toBeVisible();
    const measure = () => element.evaluate(el => {
      let fiber = el[Object.keys(el).find(key => key.startsWith('__reactFiber$'))], chart;
      while (fiber && !chart) { chart = fiber.stateNode?.getEchartsInstance?.(); fiber = fiber.return; }
      const grid = chart.getModel().getComponent('grid').coordinateSystem, rect = grid.getRect();
      const x = grid.getAxis('x').scale.getExtent(), y = grid.getAxis('y').scale.getExtent();
      return { ratio: rect.width / (x[1] - x[0]) / (rect.height / (y[1] - y[0])),
        chart: [chart.getWidth(), chart.getHeight()], dom: [el.clientWidth, el.clientHeight],
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, x, y, grid: chart.getOption().grid,
        points: chart.getOption().series.map(series => series.data) };
    });
    const original = await measure();
    for (const factor of [.8, 1.25, .33, 1]) {
      await zoom(factor);
      await expect.poll(async () => { const state = await measure(); return Math.max(Math.abs(state.chart[0] - state.dom[0]), Math.abs(state.chart[1] - state.dom[1])); }).toBeLessThan(2);
      await expect.poll(async () => (await measure()).ratio).toBeCloseTo(1, 3);
      expect((await measure()).points).toEqual(original.points);
    }
    await page.getByRole('button', { name: '全图 / 重置视野' }).click();
    await page.locator('.ordination-tools summary').click();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出完整分析图', exact: true }).click();
    expect(await readFile(await (await downloadEvent).path(), 'utf8')).toContain('<svg');
    expect(errors).toEqual([]);
  });
}
