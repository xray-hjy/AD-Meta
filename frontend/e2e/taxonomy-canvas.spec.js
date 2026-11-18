import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const url = mode => `/analysis/abundance?dataset=ad-nc-species&chart=${mode}`;
const surface = '.echarts-for-react.taxonomy-chart-surface';
async function chartState(page) {
  return page.locator(surface).first().evaluate(element => {
    let fiber = element[Object.keys(element).find(key => key.startsWith('__reactFiber$'))], chart;
    while (fiber && !chart) { chart = fiber.stateNode?.getEchartsInstance?.(); fiber = fiber.return; }
    const series = chart.getModel().getSeriesByIndex(0);
    const data = series.getData();
    return { width: chart.getWidth(), height: chart.getHeight(),
      count: data.count(), values: chart.getOption().series[0].data.map(node => node.value),
      label: series.option.label.show,
      levelLabels: series.option.levels?.map(level => level.label?.show),
      zoom: series.option.zoom,
      rootWidth: data.tree?.root.getLayout()?.width,
      canvasWidth: element.querySelector('canvas')?.width,
      canvasHeight: element.querySelector('canvas')?.height };
  });
}
function health(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  return errors;
}
async function injectSankey(page, model) {
  await page.route('**/projections/taxonomy_sankey', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.payload = model;
    body.dataSemantics.abundanceScale = 'relative_abundance';
    Object.assign(body.projection, { sampleCount: 185, sourceFeatureCount: 1828, groupCounts: { AD: 122, NC: 63 },
      displayedNodeCount: model.nodes.length,
      mergedCategoryCount: model.nodes.reduce((sum, node) => sum + Number(node.mergedCount || 0), 0) });
    await route.fulfill({ response, json: body });
  });
}

test('real 183-node Sankey uses page scrolling, live overview, spacing and full PNG export', async ({ page }) => {
  test.skip(!process.env.AD_META_E2E_REAL_TAXONOMY, 'Optional read-only real-source fixture.');
  const model = JSON.parse(await readFile(process.env.AD_META_E2E_REAL_TAXONOMY, 'utf8')).sankey;
  const errors = health(page);
  await injectSankey(page, model);
  await page.setViewportSize({ width: 1920, height: 1080 });
  const started = Date.now();
  await page.goto(url('sankey'));
  await expect(page).toHaveURL(/chart=sankey/);
  await expect(page).toHaveTitle(/AD-Meta/);
  await expect(page.getByRole('toolbar', { name: '分类层级图操作' })).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page.locator(`${surface} canvas`)).toBeVisible();
  const initial = await chartState(page);
  expect(initial.count).toBe(model.nodes.length);
  expect(initial.height).toBe(model.layout.height);
  const sizes = await page.locator('.taxonomy-sankey-scroll').evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight,
    viewport: el.closest('.taxonomy-viewport').clientHeight, canvas: el.querySelector('.echarts-for-react').clientHeight }));
  expect(sizes.scroll - sizes.client).toBeLessThanOrEqual(1);
  expect(sizes.viewport).toBeGreaterThanOrEqual(sizes.canvas);
  await page.locator('.taxonomy-viewport').evaluate(el => el.scrollIntoView({ block: 'start' }));
  const overview = page.getByRole('complementary', { name: '桑基图页面全局预览' });
  await expect(overview).toBeVisible();
  await expect(overview.locator('image')).toHaveAttribute('href', /^data:image\/png/);
  const frame = overview.getByTestId('minimap-view');
  const firstY = Number(await frame.getAttribute('y'));
  const beforeScroll = await page.locator('.main-content').evaluate(el => el.scrollTop);
  await page.mouse.move(700, 500); await page.mouse.wheel(0, 400);
  await expect.poll(() => page.locator('.main-content').evaluate(el => el.scrollTop)).toBeGreaterThan(beforeScroll + 100);
  await expect.poll(async () => Number(await frame.getAttribute('y'))).toBeGreaterThan(firstY);
  await overview.getByRole('button', { name: '图底', exact: true }).click();
  const bottomScroll = await page.locator('.main-content').evaluate(el => el.scrollTop);
  await overview.getByRole('button', { name: '图顶', exact: true }).click();
  await expect.poll(() => page.locator('.main-content').evaluate(el => el.scrollTop)).toBeLessThan(bottomScroll - 100);
  // Clicking the lower preview should navigate the page, not an inner scrollTop.
  const map = overview.locator('.chart-minimap svg');
  const box = await map.boundingBox();
  await map.click({ position: { x: box.width / 2, y: box.height * .8 } });
  await expect.poll(() => page.locator('.main-content').evaluate(el => el.scrollTop)).toBeGreaterThan(beforeScroll + 100);
  await expect.poll(async () => Number(await frame.getAttribute('y'))).toBeGreaterThan(firstY);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * .7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * .3, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => page.locator('.main-content').evaluate(el => el.scrollTop)).toBeLessThan(bottomScroll - 100);
  await overview.getByRole('button', { name: '收起页面全局预览' }).click();
  await expect(overview.locator('.chart-minimap')).toHaveCount(0);
  await overview.getByRole('button', { name: '展开页面全局预览' }).click();
  await expect(overview.locator('.chart-minimap')).toBeVisible();
  await overview.getByRole('button', { name: '图底', exact: true }).click();
  await expect.poll(async () => Number(await frame.getAttribute('y'))).toBeGreaterThan(firstY);
  await page.screenshot({ path: test.info().outputPath('opt005-sankey-page-overview.png') });
  await page.getByRole('button', { name: '展开画布', exact: true }).click();
  await expect.poll(async () => (await chartState(page)).height).toBeGreaterThan(initial.height);
  expect((await chartState(page)).values).toEqual(initial.values);
  await page.getByRole('button', { name: '隐藏标签', exact: true }).click();
  expect((await chartState(page)).label).toBe(false);
  await page.getByRole('button', { name: '显示标签', exact: true }).click();
  expect((await chartState(page)).label).toBe(true);
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整桑基图 PNG', exact: true }).click();
  const download = await event;
  await download.saveAs(test.info().outputPath('opt005-sankey-full-export.png'));
  const png = await readFile(await download.path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  const pixels = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  expect(pixels.height).toBeGreaterThan((await chartState(page)).height);
  expect(pixels.width * pixels.height).toBeLessThanOrEqual(32_000_000);
  await page.getByRole('button', { name: '恢复全图', exact: true }).click();
  await expect.poll(async () => (await chartState(page)).height).toBe(initial.height);
  await page.getByRole('button', { name: '全屏分类图', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.locator('.taxonomy-viewport').evaluate(el => el.scrollIntoView({ block: 'start' }));
  await expect.poll(() => overview.evaluate(el => document.fullscreenElement?.contains(el))).toBe(true);
  await page.getByRole('button', { name: '全屏分类图', exact: true }).click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await page.locator('.taxonomy-explorer__controls').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('opt005-sankey-toolbar.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.locator('.taxonomy-sankey-scroll').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.locator('.taxonomy-viewport').evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.locator('.taxonomy-sankey-scroll').evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await expect(overview).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('opt005-sankey-mobile.png') });
  expect(await page.locator('.taxonomy-sankey-scroll').evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  console.log(JSON.stringify({ sourceNodes: initial.count, initialHeight: initial.height, exportPixels: pixels, elapsedMs: Date.now() - started }));
  expect(errors).toEqual([]);
});

for (const mode of ['treemap', 'radialtree']) {
  test(`${mode} native toolbar zoom changes layout and preserves data, restore and fullscreen work`, async ({ page }) => {
    const errors = health(page);
    await page.goto(url(mode));
    await expect(page.locator(surface)).toBeVisible();
    const before = await chartState(page);
    await page.getByRole('button', { name: '放大分类图', exact: true }).click();
    await expect.poll(async () => { const state = await chartState(page); return mode === 'treemap' ? state.rootWidth : state.zoom; }).toBeGreaterThan(mode === 'treemap' ? before.rootWidth : before.zoom);
    expect((await chartState(page)).values).toEqual(before.values);
    await page.getByRole('button', { name: '隐藏标签', exact: true }).click();
    expect((await chartState(page)).label).toBe(false);
    await page.getByRole('button', { name: '显示标签', exact: true }).click();
    expect((await chartState(page)).label).toBe(true);
    await page.getByRole('button', { name: '恢复全图', exact: true }).click();
    await expect.poll(async () => { const state = await chartState(page); return mode === 'treemap' ? state.rootWidth : state.zoom; }).toBe(mode === 'treemap' ? before.rootWidth : before.zoom);
    await page.getByRole('button', { name: '全屏分类图', exact: true }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await page.getByRole('button', { name: '全屏分类图', exact: true }).click();
    await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
    expect(errors).toEqual([]);
  });
}

test('sunburst toolbar toggles labels and legend while keeping branch controls', async ({ page }) => {
  const errors = health(page);
  await page.goto(url('sunburst'));
  await expect(page.getByRole('complementary', { name: '门级图例卡片' })).toBeVisible();
  await page.getByRole('button', { name: '门级图例', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '门级图例卡片' })).toHaveCount(0);
  await page.getByRole('button', { name: '门级图例', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '门级图例卡片' })).toBeVisible();
  await page.getByRole('button', { name: '隐藏标签', exact: true }).click();
  expect((await chartState(page)).label).toBe(false);
  await expect(page.getByRole('button', { name: '放大分类图', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '显示标签', exact: true }).click();
  expect((await chartState(page)).label).toBe(true);
  expect((await chartState(page)).levelLabels[1]).toBe(true);
  await expect(page.getByRole('button', { name: '返回上一级', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('300-node dense projection retains every node within the canvas resource budget', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:14173', deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = health(page);
  const levels = [12, 32, 96, 160], nodes = [], links = [];
  const groups = levels.map((count, depth) => Array.from({ length: count }, (_, index) => ({
    name: `${depth}/${index}`, label: `Dense_${depth}_${index}`, depth, value: depth === 3 ? 1 : 0,
  })));
  for (let depth = 3; depth > 0; depth--) groups[depth].forEach((node, index) => {
    const parent = groups[depth - 1][Math.floor(index * groups[depth - 1].length / groups[depth].length)];
    parent.value += node.value; links.push({ source: parent.name, target: node.name, value: node.value });
  });
  groups.forEach(group => nodes.push(...group));
  await injectSankey(page, { kind: 'taxonomy_sankey', nodes, links, layout: { width: 9000, height: 9000, maxDepth: 3, maxColumnCount: 160, nodeGap: 14 } });
  const started = Date.now();
  await page.goto(url('sankey'));
  await expect(page.locator(`${surface} canvas`)).toBeVisible();
  await page.getByRole('button', { name: '展开画布', exact: true }).click();
  const state = await chartState(page);
  expect(state.count).toBe(300);
  expect(state.height).toBeLessThanOrEqual(4800);
  expect(state.width).toBeLessThanOrEqual(2800);
  expect(state.width * state.height).toBeLessThanOrEqual(12_000_000);
  expect(state.canvasWidth * state.canvasHeight).toBeLessThanOrEqual(27_000_000);
  expect(state.canvasWidth / state.width).toBeCloseTo(1.5, 2);
  console.log(JSON.stringify({ denseNodes: state.count, canvas: [state.width, state.height], backingPixels: [state.canvasWidth, state.canvasHeight], elapsedMs: Date.now() - started }));
  expect(errors).toEqual([]);
  await context.close();
});
