import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const URL = '/analysis/abundance?dataset=ad-nc-species&chart=boxplot';

test('boxplot preserves selection, single-species comparison, paging and the overview export', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL);
  const panel = page.getByRole('complementary', { name: '研究对象工作区' });
  const chart = page.locator('.selection-workspace__chart');
  await expect(chart.getByRole('combobox', { name: '箱线图视野' })).toHaveValue('full');
  await chart.getByRole('combobox', { name: '每页物种数' }).selectOption('2');
  await chart.getByRole('navigation', { name: '物种分面分页' }).getByRole('button', { name: '下一页' }).click();
  await expect(chart.getByText('本页 3–4 / 4 个物种', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '自定义物种', exact: true }).click();
  const candidates = page.getByRole('list', { name: '候选物种' });
  await candidates.getByRole('button', { name: '添加到对象池 Blautia_fixture' }).click();
  await page.getByRole('button', { name: '应用选择', exact: true }).click();
  await expect(panel.getByText('当前图表 1 个物种', { exact: true })).toBeVisible();
  await expect(chart.getByText('单物种：组间共用纵轴', { exact: true })).toBeVisible();
  const pending = page.waitForEvent('download');
  await chart.getByRole('button', { name: '导出当前页 SVG', exact: true }).click();
  const download = await pending;
  const svg = await readFile(await download.path(), 'utf8');
  expect(svg).toContain('AD (n=4)');
  expect(svg).toContain('NC (n=4)');
  expect(svg).toContain('Blautia_fixture');
  await candidates.getByRole('button', { name: '添加到对象池 Lactobacillus_fixture' }).click();
  await page.getByRole('button', { name: '应用选择', exact: true }).click();
  await expect(panel.getByText('当前图表 2 个物种', { exact: true })).toBeVisible();
  await chart.getByRole('button', { name: '共享纵轴总览', exact: true }).click();
  const overviewPending = page.waitForEvent('download');
  await chart.getByRole('button', { name: '导出全部物种总览 SVG', exact: true }).click();
  const overview = await readFile(await (await overviewPending).path(), 'utf8');
  expect(overview).toContain('Blautia_fixture');
  expect(overview).toContain('Lactobacillus_fixture');
});

// Controlled summaries exercise rendering bounds; the source fixture is untouched.
function visualItems(template) {
  return Array.from({ length: 13 }, (_, index) => ({ ...template,
    featureId: `visual-${index}`, shortName: `Synthetic_species_${index}_with_a_complete_name`,
    fullName: `k__Bacteria|g__Synthetic|s__Synthetic_species_${index}_with_a_complete_name`,
    groupStats: Object.fromEntries(['AD', 'NC'].map(group => [group, { sampleCount: 20, validCount: 20, missingCount: 0,
      detectedCount: index === 0 ? 1 : 16, zeroCount: index === 0 ? 19 : 4, detectionRate: index === 0 ? 0.05 : 0.8 }])),
    values: Object.fromEntries(['AD', 'NC'].map(group => [group, Object.fromEntries(['raw', 'sqrt', 'log'].map(key => {
      const scale = index === 2 ? 0.000001 : index + 1;
      const transform = value => key === 'sqrt' ? Math.sqrt(value) : key === 'log' ? Math.log10(value + 1) : value;
      const box = (index === 0 ? [0, 0, 0, 0, 0] : [0, 1, 2, 3, 4].map(value => value * scale)).map(transform);
      const value = transform(index === 0 ? 80 : 100 * scale);
      return [key, { box, outliers: [value], outlierPoints: [{ sample: `${group}-high-${index}`, value }] }];
    }))])),
  }));
}

function storedZipEntries(buffer) {
  const entries = [];
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const start = offset + 30 + nameLength + extraLength;
    entries.push({ name: buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8'),
      bytes: buffer.subarray(start, start + size),
      svg: buffer.subarray(start, start + size).toString('utf8') });
    offset = start + size;
  }
  return entries;
}

test('focused facets disclose high values and zero boxes and export every styled page in one ZIP', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1100 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await page.route('**/projections/boxplot', async route => {
    const response = await route.fetch();
    const body = await response.json();
    body.payload.items = visualItems(body.payload.items[0]);
    body.payload.defaultValueTransform = 'raw';
    body.payload.featureSelection.selectedCount = 13;
    Object.assign(body.projection, { sourceFeatureCount: 13, returnedFeatureCount: 13, sampleCount: 40, groupCounts: { AD: 20, NC: 20 } });
    body.projection.featureSelection.selectedCount = 13;
    await route.fulfill({ response, json: body });
  });
  await page.goto(URL);
  const chart = page.locator('.selection-workspace__chart');
  await chart.getByRole('combobox', { name: '每页物种数' }).selectOption('2');
  await chart.getByRole('combobox', { name: '箱线图视野' }).selectOption('focus');
  await expect(chart.getByText(/视野外共 24 个离群样本点/)).toBeVisible();
  await chart.getByText(/查看视野外样本/).click();
  await expect(chart.getByRole('cell', { name: 'AD-high-1', exact: true })).toBeVisible();
  await chart.getByText(/查看视野外样本/).click();
  await chart.getByRole('switch', { name: '中位数值', exact: true }).click();
  await chart.getByRole('button', { name: '更多设置', exact: true }).click();
  await expect(chart.getByRole('switch', { name: '图例', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await chart.getByRole('combobox', { name: '箱线图导出内容' }).selectOption('all');
  const pending = page.waitForEvent('download');
  await chart.getByRole('button', { name: '导出全部分面 ZIP', exact: true }).click();
  const download = await pending;
  await download.saveAs(testInfo.outputPath('all-facets.zip'));
  const entries = storedZipEntries(await readFile(await download.path()));
  expect(entries).toHaveLength(3);
  expect(entries[0].svg).toContain('视野外 AD 1 / NC 1');
  expect(entries[0].svg).toContain('箱须为零');
  expect(entries[0].svg).toContain('纵轴独立');
  expect(entries[0].svg).toContain('>12</text>'); // median for species 5, on its own grid
  expect(entries[2].svg).toContain('Synthetic_species_12');
  await chart.getByRole('combobox', { name: '分面纵轴' }).selectOption('shared');
  await chart.getByRole('button', { name: '恢复完整范围' }).click();
  await expect(chart.getByRole('combobox', { name: '箱线图视野' })).toHaveValue('full');
  await chart.getByRole('combobox', { name: '分面纵轴' }).selectOption('independent');
  await chart.getByRole('combobox', { name: '箱线图视野' }).selectOption('focus');
  await chart.locator('.boxplot-chart').screenshot({ path: testInfo.outputPath('focused-facets.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: '跳到当前分析结果' }).click();
  await page.getByRole('button', { name: '收起对象池', exact: true }).click();
  expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const axe = await new AxeBuilder({ page }).include('.selection-workspace').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(axe.violations.filter(v => ['moderate', 'serious', 'critical'].includes(v.impact)).map(v => v.id)).toEqual([]);
  await chart.locator('.boxplot-chart').screenshot({ path: testInfo.outputPath('focused-mobile.png') });
  expect(errors).toEqual([]);
});

function csvRecords(text) {
  // Export cells are quoted. This fixture has no embedded line breaks.
  const rows = text.replace(/^\uFEFF/, '').split('\r\n').map(line => line.slice(1, -1).split('","').map(value => value.replaceAll('""', '"')));
  return rows.slice(1).map(row => Object.fromEntries(rows[0].map((key, index) => [key, row[index]])));
}

test('scientific exports preserve scoped zeros, all selected data and real PNG dimensions', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1600, height: 1100 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const responseFor = mode => page.waitForResponse(response => response.url().endsWith('/projections/boxplot') && response.ok()
    && response.request().postDataJSON()?.scope?.mode === mode);
  const initial = responseFor('cohort');
  await page.goto(URL);
  const projection = await (await initial).json();
  const chart = page.locator('.selection-workspace__chart');
  await chart.getByRole('button', { name: '输入丰度', exact: true }).click();
  const details = chart.locator('details[aria-label="分组统计与复核数据"]');
  await details.locator('summary').first().click();
  await expect(details.getByRole('columnheader', { name: '检出数 / 有效数（比例）', exact: true })).toBeVisible();
  await expect(details.getByRole('row')).toHaveCount(9);
  const dataButton = details.getByRole('button', { name: '下载全部已选对象复核数据 ZIP', exact: true });
  const downloadData = async () => {
    const pending = page.waitForEvent('download');
    await dataButton.click();
    const download = await pending;
    const entries = storedZipEntries(await readFile(await download.path()));
    return { download, entries, metadata: JSON.parse(entries.find(entry => entry.name === 'metadata.json').svg),
      samples: csvRecords(entries.find(entry => entry.name === 'sample-abundance.csv').svg),
      stats: csvRecords(entries.find(entry => entry.name === 'group-statistics.csv').svg) };
  };
  const full = await downloadData();
  await full.download.saveAs(testInfo.outputPath('cohort-review.zip'));
  expect(full.entries).toHaveLength(4);
  expect(full.metadata.projectionKey).toBe(projection.projectionKey);
  expect(full.samples).toHaveLength(32);
  expect(full.stats).toHaveLength(24);
  expect(full.metadata.samples).toHaveLength(8);
  expect(full.samples.some(row => row.storedValue === '0' && row.status === 'zero')).toBe(true);
  expect(full.metadata.displayMultiplier).toBe(1); // fixture units are unknown, never invent percentages
  for (const item of projection.payload.items) {
    for (const group of ['AD', 'NC']) {
      const samples = full.samples.filter(row => row.featureId === item.featureId && row.group === group);
      expect(samples).toHaveLength(4);
      expect(samples.filter(row => Number(row.storedValue) > 0)).toHaveLength(item.groupStats[group].detectedCount);
      const values = samples.map(row => Number(row.rawDisplayValue)).sort((a, b) => a - b);
      expect((values[1] + values[2]) / 2).toBeCloseTo(item.values[group].raw.box[2], 12);
    }
  }
  await details.screenshot({ path: testInfo.outputPath('research-statistics.png') });
  await chart.getByRole('combobox', { name: '每页物种数' }).selectOption('2');
  await chart.getByRole('combobox', { name: '箱线图图像格式' }).selectOption('png');
  await chart.getByRole('switch', { name: '中位数值', exact: true }).click();
  await chart.getByRole('switch', { name: '离群点', exact: true }).click();
  let pending = page.waitForEvent('download');
  await chart.getByRole('button', { name: '导出当前页 PNG', exact: true }).click();
  const png = await pending;
  await png.saveAs(testInfo.outputPath('current-page.png'));
  const image = await readFile(await png.path());
  expect(image.subarray(1, 4).toString()).toBe('PNG');
  expect([image.readUInt32BE(16), image.readUInt32BE(20)]).toEqual([2200, 972]);
  await chart.getByRole('checkbox', { name: '附带复核数据 ZIP', exact: true }).check();
  pending = page.waitForEvent('download');
  await chart.getByRole('button', { name: '导出当前页与复核数据 ZIP', exact: true }).click();
  const bundle = await pending;
  await bundle.saveAs(testInfo.outputPath('figure-with-review.zip'));
  const bundled = storedZipEntries(await readFile(await bundle.path()));
  expect(bundled).toHaveLength(5);
  expect(bundled.filter(entry => entry.name.endsWith('.png'))).toHaveLength(1);
  const bundledMeta = JSON.parse(bundled.find(entry => entry.name === 'metadata.json').svg);
  expect(bundledMeta.currentFigure).toMatchObject({ format: 'png', exportScope: 'current-page', styles: { medianLabels: true } });
  expect(bundledMeta.currentFigure.exportedPages).toMatchObject([{ page: 1, width: 1100, height: 486, pixelRatio: 2,
    sourcePage: 1, pageSize: 2, view: 'facets', featureIds: projection.payload.items.slice(0, 2).map(item => item.featureId) }]);
  expect(csvRecords(bundled.find(entry => entry.name === 'sample-abundance.csv').svg)).toHaveLength(32);
  await chart.getByRole('combobox', { name: '箱线图图像格式' }).selectOption('svg');
  pending = page.waitForEvent('download');
  await chart.getByRole('button', { name: '导出当前页与复核数据 ZIP', exact: true }).click();
  const vectorBundle = storedZipEntries(await readFile(await (await pending).path()));
  const vector = vectorBundle.find(entry => entry.name.endsWith('.svg')).svg;
  expect(vector).toContain('输入单位未提供');
  expect(vector).toContain('1.5×IQR');
  const panel = page.getByRole('complementary', { name: '研究对象工作区' });
  const adResponse = responseFor('group');
  await panel.getByRole('button', { name: 'AD 组', exact: true }).click();
  await adResponse;
  await expect(details.getByRole('row')).toHaveCount(5);
  const ad = await downloadData();
  expect(ad.samples).toHaveLength(16);
  expect(new Set(ad.samples.map(row => row.group))).toEqual(new Set(['AD']));
  const subsetResponse = responseFor('subset');
  await panel.getByRole('button', { name: '自定义子集', exact: true }).click();
  const subset = panel.locator('.projection-subset-picker');
  await subset.getByRole('checkbox').nth(0).check();
  await subset.getByRole('checkbox').nth(4).check();
  await subset.getByRole('button', { name: '应用范围', exact: true }).click();
  const subsetProjection = await (await subsetResponse).json();
  await expect(details.getByRole('row')).toHaveCount(9);
  const scoped = await downloadData();
  await scoped.download.saveAs(testInfo.outputPath('subset-review.zip'));
  expect(scoped.samples).toHaveLength(8);
  expect(new Set(scoped.samples.map(row => row.sampleCode))).toEqual(new Set(subsetProjection.scope.sampleCodes));
  expect(scoped.metadata.projectionKey).toBe(subsetProjection.projectionKey);
  // Server conflicts surface as an error; no partial archive is downloaded.
  await page.route('**/projections/boxplot/review-data', route => route.fulfill({ status: 409, json: { detail: '图表与导出参数不一致，请刷新后重试' } }));
  await panel.getByRole('button', { name: '全部样本', exact: true }).click();
  await expect(chart.locator('.chart-frame__disclosure')).toContainText('全部样本');
  await dataButton.click();
  await expect(details.getByRole('alert')).toContainText('图表与导出参数不一致');
  await page.unroute('**/projections/boxplot/review-data');
  const recovered = await downloadData();
  expect(recovered.metadata.projectionKey).toBe(projection.projectionKey);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: '跳到当前分析结果' }).click();
  await page.getByRole('button', { name: '收起对象池', exact: true }).click();
  expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  const accessibility = await new AxeBuilder({ page }).include('.selection-workspace').withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(accessibility.violations.filter(violation => ['moderate', 'serious', 'critical'].includes(violation.impact)).map(violation => violation.id)).toEqual([]);
  await details.screenshot({ path: testInfo.outputPath('research-mobile.png') });
  expect(errors.filter(error => !error.includes('409'))).toEqual([]);
});
