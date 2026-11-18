import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('real-source zero, exploratory, single candidate and prespecified sensitivity share recorded statistics', async ({ page }) => {
  test.skip(!process.env.AD_META_E2E_SPECIES_INPUT, 'Requires the isolated real-source species input.');
  test.setTimeout(120_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  const result = () => page.waitForResponse(response => response.url().endsWith('/projections/heatmap') && response.request().method() === 'POST');
  const change = async (name, value) => {
    const pending = result();
    await page.getByRole('combobox', { name, exact: true }).click();
    await page.locator(`[role="option"][data-select-value="${value}"]`).click();
    const response = await pending;
    expect(response.ok(), await response.text()).toBe(true);
    return (await response.json()).payload;
  };
  await page.setViewportSize({ width: 1600, height: 1100 });
  const pending = result();
  await page.goto('/analysis/abundance?dataset=ad-nc-species&chart=heatmap');
  await expect(page).toHaveTitle(/AD-Meta/);
  const response = await pending;
  expect(response.ok(), await response.text()).toBe(true);
  const initial = await response.json(), zero = initial.payload;
  expect(zero.summary).toMatchObject({ sourceFeatureCount: 1828, testedFeatureCount: 1828, rawPLt005Count: 94, qPassCount: 0, bothPassCount: 0 });
  expect(zero.summary.minQ).toBeCloseTo(.0742236997, 8);
  await expect(page.getByText('本次统计筛选为零候选，丰度数据仍可查看')).toBeVisible();
  await expect(page.locator('.heatmap-panel canvas')).toHaveCount(0);
  const key = zero.analysisRecord.analysisKey, storage = zero.analysisRecord.storageId;
  await page.locator('.heatmap-analysis').screenshot({ path: test.info().outputPath('opt007-zero-result.png') });

  await page.getByRole('button', { name: '查看完整统计结果', exact: true }).click();
  await expect(page.locator('details.projection-audit')).toHaveAttribute('open', '');
  await expect(page.locator('.projection-audit table tbody tr').first()).toBeVisible();

  const jsonEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载分析记录 JSON' }).click();
  const record = JSON.parse(await readFile(await (await jsonEvent).path(), 'utf8'));
  expect(record.analysisRecord.samples).toHaveLength(185);
  expect(record.analysisRecord.datasetRevision).toBe(initial.datasetRevision);
  expect(record.analysisRecord.foldChangePseudocount).toBe(1e-9);

  const csvEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载完整统计 CSV', exact: true }).click();
  const csv = await readFile(await (await csvEvent).path(), 'utf8');
  expect(csv.trim().split('\r\n')).toHaveLength(1829);
  expect(csv).toContain(key);
  expect(csv).toContain('log2FCAtEps1e10');
  expect(csv).toContain('prevalenceAD');
  expect(csv).toContain('0.07422369970306368');

  const exploreEvent = result();
  await page.getByRole('button', { name: '查看探索性丰度热图', exact: true }).click();
  const exploratory = (await (await exploreEvent).json()).payload;
  expect(exploratory.analysisRecord.analysisKey).toBe(key);
  expect(exploratory.analysisRecord.storageId).toBe(storage);
  expect(exploratory.summary.bothPassCount).toBe(0);
  expect(exploratory.stats).toHaveLength(50);
  await expect(page.getByText('探索性丰度热图 · 不代表显著差异')).toBeVisible();
  await expect(page.locator('.heatmap-panel canvas')).toHaveCount(4);
  let changed = await change('热图颜色值', 'log');
  expect(changed.analysisRecord.analysisKey).toBe(key);
  expect(changed.filter.colorMin).toBeLessThan(0);
  // Negative log values are valid visual values, not missing/zero cells.
  await expect.poll(() => page.locator('.heatmap-panel canvas').first().evaluate(canvas => {
    const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const colors = new Set();
    for (let y = 100; y < canvas.height - 70; y += 9) for (let x = 140; x < canvas.width - 100; x += 11) {
      const index = (y * canvas.width + x) * 4; colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
    }
    return colors.size;
  })).toBeGreaterThan(20);
  changed = await change('样本与物种排序', 'grouped');
  expect(changed.dendrograms.rows.merges).toHaveLength(0);
  expect(changed.analysisRecord.storageId).toBe(storage);
  await page.getByRole('button', { name: /AD 组丰度热图，按回车放大/ }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('opt007-exploratory-real.png') });
  const imageEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出AD 组丰度热图', exact: true }).click();
  const image = await imageEvent;
  expect(image.suggestedFilename()).toContain('exploratory-log');
  expect((await readFile(await image.path())).subarray(1, 4).toString()).toBe('PNG');
  changed = await change('热图颜色值', 'zscore');
  expect(changed.analysisRecord.storageId).toBe(storage);
  expect(changed.valueTransformNote).toContain('不能跨物种');
  changed = await change('探索排序', 'q_value');
  expect(changed.analysisRecord.analysisKey).toBe(key);
  expect(changed.stats[0].qValue).toBeCloseTo(zero.summary.minQ, 12);
  await expect(page.getByText(/按 q 值排序使用了 AD\/NC 标签/)).toBeVisible();

  await change('FDR q 值上限', '0.1');
  const single = await change('查看方式', 'differential');
  expect(single.stats).toHaveLength(1);
  expect(single.analysisRecord.storageId).toBe(storage);
  expect(single.adLabels).toHaveLength(122); expect(single.ncLabels).toHaveLength(63);
  await expect(page.getByRole('region', { name: '单物种样本分布' })).toBeVisible();
  await expect(page.getByText(/AD 检出 67\/122/)).toBeVisible();
  await page.locator('.heatmap-single-feature').screenshot({ path: test.info().outputPath('opt007-single-real.png') });

  const filtered = await change('检验前预筛', 'prevalence');
  expect(filtered.summary.testedFeatureCount).toBe(499);
  expect(filtered.analysisRecord.analysisKey).not.toBe(key);
  const thresholded = await change('检验前预筛', 'abundance_prevalence');
  expect(thresholded.summary.testedFeatureCount).toBe(349);
  expect(thresholded.summary.excludedFeatureCount).toBe(1479);
  const excludedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载完整统计 CSV', exact: true }).click();
  const excludedCSV = await readFile(await (await excludedDownload).path(), 'utf8');
  expect(excludedCSV.trim().split('\r\n')).toHaveLength(1829);
  expect(excludedCSV).toContain('below_pooled_prevalence');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('region', { name: '热图分析记录与结果解释' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('opt007-mobile.png') });
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});
