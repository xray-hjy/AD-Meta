import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const URL = mode => `/analysis/abundance?dataset=ad-nc-species&chart=${mode}`;

test('treemap fills wide canvas and supports exact-path focus, back, sizes and scoped SVG', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 2300, height: 1200 });
  await page.goto(URL('treemap'));
  await expect(page.locator('.taxonomy-chart-surface canvas')).toBeVisible();
  await expect(page.getByText(/数值为样本相对丰度之和|数值为源丰度之和/)).toBeVisible();
  const size = await page.locator('.taxonomy-treemap-panel').evaluate(element => ({ width: element.clientWidth, available: element.parentElement.clientWidth }));
  expect(size.width / size.available).toBeGreaterThan(.96);
  await page.locator('.taxonomy-explorer').screenshot({ path: test.info().outputPath('opt004-treemap-wide.png') });
  await page.locator('.taxonomy-chart-surface canvas').first().click({ position: { x: 150, y: 150 } });
  await expect(page.getByRole('region', { name: '分类节点详情' })).toBeVisible();
  await page.getByRole('button', { name: '恢复全图', exact: true }).click();
  await page.getByRole('searchbox', { name: '查找分类名称或路径' }).fill('Firmicutes');
  const results = page.getByRole('region', { name: '分类查找结果' });
  await results.getByRole('button', { name: /^Firmicutes ·/ }).click();
  await expect(page.getByRole('navigation', { name: '当前分类路径' })).toContainText('Firmicutes');
  await expect(page.getByRole('region', { name: '分类节点详情' })).toContainText('占完整范围总和');
  await page.getByRole('searchbox', { name: '查找分类名称或路径' }).fill('');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出图形', exact: true }).click();
  const svg = await readFile(await (await downloadEvent).path(), 'utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain('Firmicutes');
  expect(svg).toContain('当前导出范围');
  await page.getByRole('button', { name: '返回上一级', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '当前分类路径' })).not.toContainText('Firmicutes');
  await page.getByRole('spinbutton', { name: '分类图画布高度' }).fill('1100');
  await expect.poll(() => page.locator('.taxonomy-treemap-panel').evaluate(element => element.clientHeight)).toBe(1100);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.taxonomy-chart-surface canvas')).toBeVisible();
  await page.locator('.taxonomy-explorer').screenshot({ path: test.info().outputPath('opt004-treemap-mobile.png') });
  expect(errors).toEqual([]);
});

test('sunburst circular canvas and draggable keyboard legend stay bounded and export the legend', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1800, height: 1200 });
  await page.goto(URL('sunburst'));
  const card = page.getByRole('complementary', { name: '门级图例卡片' });
  await expect(card).toBeVisible();
  const circle = await page.locator('.taxonomy-sunburst-visual .taxonomy-chart-surface').boundingBox();
  expect(Math.abs(circle.width - circle.height)).toBeLessThan(2);
  await expect.poll(() => page.locator('.taxonomy-sunburst-visual .echarts-for-react').evaluate(element => {
    let fiber = element[Object.keys(element).find(key => key.startsWith('__reactFiber$'))], chart;
    while (fiber && !chart) { chart = fiber.stateNode?.getEchartsInstance?.(); fiber = fiber.return; }
    return Math.abs((chart?.getWidth() || 0) - element.clientWidth);
  })).toBeLessThan(2);
  const handle = page.getByRole('button', { name: '拖动图例；方向键移动' });
  const before = await card.boundingBox();
  await handle.focus(); await handle.press('ArrowLeft');
  await expect.poll(async () => (await card.boundingBox()).x).toBeLessThan(before.x);
  const area = await page.locator('.taxonomy-sunburst-layout').boundingBox();
  const hand = await handle.boundingBox();
  await page.mouse.move(hand.x + 10, hand.y + 10); await page.mouse.down();
  await page.mouse.move(area.x - 500, area.y - 500); await page.mouse.up();
  const moved = await card.boundingBox();
  expect(moved.x).toBeGreaterThanOrEqual(area.x - 1);
  expect(moved.y).toBeGreaterThanOrEqual(area.y - 1);
  await page.getByRole('button', { name: '收起图例', exact: true }).click();
  await page.getByRole('button', { name: '展开图例', exact: true }).click();
  await page.getByRole('button', { name: '隐藏门级图例' }).click();
  await page.getByRole('button', { name: '显示门级图例', exact: true }).click();
  await page.getByRole('button', { name: '恢复图例默认位置' }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出图形', exact: true }).click();
  const svg = await readFile(await (await downloadEvent).path(), 'utf8');
  expect(svg).toContain('门级占比'); expect(svg).toContain('占完整范围总和');
  await page.locator('.taxonomy-explorer').screenshot({ path: test.info().outputPath('opt004-sunburst-wide.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => card.evaluate(element => getComputedStyle(element).position)).toBe('static');
  await page.locator('.taxonomy-explorer').screenshot({ path: test.info().outputPath('opt004-sunburst-mobile.png') });
  expect(errors).toEqual([]);
});

for (const mode of ['radialtree', 'sankey']) {
  test(`${mode} opens, explains interpretation and exposes keyboard node search`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(URL(mode));
    await expect(page.locator('.taxonomy-chart-surface')).toBeVisible();
    await expect(page.getByText(mode === 'radialtree' ? /不是序列推断的系统发育树/ : /不表示迁移或物质流动/).first()).toBeVisible();
    await page.getByRole('searchbox', { name: '查找分类名称或路径' }).fill('Firmicutes');
    await page.getByRole('region', { name: '分类查找结果' }).getByRole('button').first().click();
    await expect(page.getByRole('region', { name: '分类节点详情' })).toBeVisible();
    await page.getByRole('button', { name: '恢复全图', exact: true }).click();
    await page.getByRole('searchbox', { name: '查找分类名称或路径' }).fill('Bacteroid');
    await page.getByRole('region', { name: '分类查找结果' }).getByRole('button').first().click();
    await expect(page.getByRole('region', { name: '分类节点详情' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('real MetaPhlAn hierarchy preserves 185-sample semantics and Other member access', async ({ page }) => {
  const source = process.env.AD_META_E2E_REAL_TAXONOMY;
  test.skip(!source, 'Optional read-only real-source render fixture.');
  const model = JSON.parse(await readFile(source, 'utf8'));
  await page.route('**/projections/taxonomy', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.payload = model.tree;
    body.dataSemantics.abundanceScale = 'relative_abundance';
    body.datasetRevision = 'read-only-metaphlan-source-render-check';
    Object.assign(body.projection, { sampleCount: 185, sourceFeatureCount: 1828, groupCounts: { AD: 122, NC: 63 } });
    await route.fulfill({ response, json: body });
  });
  await page.setViewportSize({ width: 2000, height: 1250 });
  await page.goto(URL('treemap'));
  await expect(page.getByText(/完整范围累计值 185/)).toBeVisible();
  await page.getByRole('searchbox', { name: '查找分类名称或路径' }).fill('Other genera');
  await page.getByRole('region', { name: '分类查找结果' }).getByRole('button').first().click();
  const detail = page.getByRole('region', { name: '分类节点详情' });
  await expect(detail.getByText(/直接合并成员/)).toBeVisible();
  await expect(detail.locator('.taxonomy-explorer__members button').first()).toBeVisible();
  await page.getByRole('button', { name: '恢复全图', exact: true }).click();
  await page.getByRole('searchbox', { name: '查找分类名称或路径' }).fill('');
  await page.mouse.move(0, 0);
  await page.locator('.taxonomy-explorer').screenshot({ path: test.info().outputPath('opt004-real-treemap.png') });
  await page.goto(URL('sunburst'));
  await expect(page.getByRole('complementary', { name: '门级图例卡片' })).toBeVisible();
  await page.mouse.move(0, 0);
  await page.locator('.taxonomy-explorer').screenshot({ path: test.info().outputPath('opt004-real-sunburst.png') });
});
