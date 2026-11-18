import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

async function geometry(page) {
  return page.locator('.ordination-chart__surface .echarts-for-react').evaluate(element => {
    // Read the existing chart instance through its React class owner; no production test hooks.
    let fiber = element[Object.keys(element).find(key => key.startsWith('__reactFiber$'))];
    let chart;
    while (fiber && !chart) { chart = fiber.stateNode?.getEchartsInstance?.(); fiber = fiber.return; }
    if (!chart) throw new Error('Missing ECharts instance');
    const coordinate = chart.getModel().getComponent('grid').coordinateSystem;
    const rect = coordinate.getRect();
    const x = coordinate.getAxis('x').scale.getExtent();
    const y = coordinate.getAxis('y').scale.getExtent();
    return { ratio: (rect.width / (x[1] - x[0])) / (rect.height / (y[1] - y[0])),
      outside: chart.getOption().series.flatMap(series => series.data || []).filter(point => {
        const pixel = chart.convertToPixel({ gridIndex: 0 }, point.slice(0, 2));
        return pixel[0] < rect.x - 1 || pixel[0] > rect.x + rect.width + 1 || pixel[1] < rect.y - 1 || pixel[1] > rect.y + rect.height + 1;
      }).length };
  });
}

for (const kind of ['pca', 'pcoa']) {
  test(`${kind}: preview, apply, style, resize and full SVG export`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto(`/analysis/abundance?dataset=ad-nc-species&chart=${kind}`);
    await expect(page.locator('.ordination-chart__surface canvas')).toBeVisible();
    await expect(page.getByRole('region', { name: '物种筛选工作区' })).toBeVisible();
    await expect(page.getByText(/当前条件已应用/)).toBeVisible();
    await expect.poll(async () => (await geometry(page)).ratio).toBeCloseTo(1, 3);
    expect((await geometry(page)).outside).toBe(0);
    const requests = [];
    page.on('request', request => { if (request.url().endsWith(`/projections/${kind}`)) requests.push(request); });
    await page.getByRole('combobox', { name: '物种范围', exact: true }).selectOption('custom');
    await page.getByRole('spinbutton', { name: '单样本最低相对丰度（%）' }).fill('0.01');
    await page.getByRole('spinbutton', { name: '最低样本比例（%）' }).fill('10');
    await expect(page.getByText(/条件尚未应用/)).toBeVisible();
    expect(requests).toHaveLength(0);
    await page.getByRole('button', { name: '应用筛选并重新计算' }).click();
    await expect(page.getByText(/当前条件已应用/)).toBeVisible();
    await expect.poll(() => requests.length).toBeGreaterThan(0);
    const appliedCount = requests.length;
    await page.getByRole('combobox', { name: '配色', exact: true }).selectOption('accessible');
    await page.getByRole('button', { name: '隐藏 95% 分布椭圆' }).click();
    await page.getByRole('button', { name: '显示 95% 分布椭圆' }).click();
    await page.getByRole('button', { name: '放大', exact: true }).click();
    await page.getByRole('button', { name: '全图 / 重置视野' }).click();
    await page.setViewportSize({ width: 820, height: 1000 });
    await page.setViewportSize({ width: 1440, height: 1100 });
    expect(requests).toHaveLength(appliedCount);
    await expect.poll(async () => (await geometry(page)).ratio).toBeCloseTo(1, 3);
    expect((await geometry(page)).outside).toBe(0);
    await page.locator('.ordination-tools summary').click();
    const axes = page.getByRole('combobox', { name: '坐标轴组合' });
    if (await axes.count()) { await axes.selectOption('1,3'); await axes.selectOption('1,2'); }
    expect(requests).toHaveLength(appliedCount);
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出完整分析图', exact: true }).click();
    const svg = await readFile(await (await downloadEvent).path(), 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="800"');
    expect(svg).toContain(kind === 'pca' ? 'PC 1' : 'Axis 1');
    const jsonDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出坐标、筛选明细与参数' }).click();
    const result = JSON.parse(await readFile(await (await jsonDownload).path(), 'utf8'));
    expect(result.featureSelection.preset).toBe('custom');
    expect(result.filterAudit).toHaveLength(4);
    expect(result.points).toHaveLength(8);
    expect(result.provenance.datasetRevision).toBeTruthy();
    expect(result.methodVersion).toContain('ordination-filter-v2');
    await page.getByRole('combobox', { name: '图像格式' }).selectOption('png');
    const pngEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出完整分析图', exact: true }).click();
    const png = await readFile(await (await pngEvent).path());
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(2400);
    expect(png.readUInt32BE(20)).toBe(1600);
    const previousCount = requests.length;
    await page.getByRole('button', { name: 'AD 组', exact: true }).click();
    await expect(page.getByText('样本范围尚未应用，当前图仍为上次计算结果。')).toBeVisible();
    expect(requests).toHaveLength(previousCount);
    await page.getByRole('button', { name: '应用样本范围并重新计算' }).click();
    await expect.poll(() => requests.length).toBeGreaterThan(previousCount);
    await expect(page.getByText(/有效样本 4 \/ 4/)).toBeVisible();
    await page.getByRole('button', { name: '全部样本', exact: true }).click();
    await page.getByRole('button', { name: '应用样本范围并重新计算' }).click();
    await expect(page.getByText(/有效样本 8 \/ 8/)).toBeVisible();
    await page.locator('.ordination-tools summary').click();
    await page.locator('.chart-plain--ordination').screenshot({ path: test.info().outputPath(`opt002-${kind}-controls.png`) });
    await page.locator('.ordination-chart__surface').screenshot({ path: test.info().outputPath(`opt002-${kind}-desktop.png`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.ordination-chart__surface canvas')).toBeVisible();
    await page.locator('.chart-plain--ordination').screenshot({ path: test.info().outputPath(`opt002-${kind}-mobile.png`) });
    expect(errors).toEqual([]);
  });
}
