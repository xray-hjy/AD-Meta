import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.skip(process.env.AD_META_E2E_PHYLUM !== '1', 'Run with AD_META_E2E_PHYLUM=1 to prepare the declared relative-abundance fixture.');

const URL = '/analysis/abundance?dataset=ad-nc-species&chart=phylum';
const views = ['分组条形图', '分组堆叠柱状图', '样本堆叠柱状图', '门级丰度热图', '分布箱线图', '均值差点图'];

test('phylum overview, all six views, matching exports and responsive details', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1550, height: 1100 });
  await page.goto(URL);
  await expect(page).toHaveURL(/chart=phylum/);
  await expect(page).toHaveTitle(/微脑|AD|Meta/i);
  await expect(page.getByRole('region', { name: '可视化总览' })).toBeVisible();
  await expect(page.locator('.phylum-overview__card')).toHaveCount(6);
  await expect(page.getByText(/当前未发生合并，显示全部可用门/)).toBeVisible();
  await expect(page.getByLabel('显示组成项')).toHaveCount(0);
  await page.locator('.phylum-workspace').screenshot({ path: '/private/tmp/opt003-overview.png' });
  const nav = page.getByRole('navigation', { name: '门级图形切换' });
  for (const name of views) {
    await nav.getByRole('button', { name, exact: true }).click();
    await expect(nav.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('当前图表数据（只读）', { exact: true })).toBeVisible();
    if (name !== '分组条形图') await expect(page.locator('.phylum-workspace canvas').first()).toBeVisible();
  }
  await nav.getByRole('button', { name: '样本堆叠柱状图', exact: true }).click();
  await page.getByText('当前图表数据（只读）', { exact: true }).click();
  const table = page.getByRole('region', { name: '门级图表只读数据' });
  await expect(table).toBeVisible();
  await expect(table.getByText('Rare fixture', { exact: true }).first()).toBeVisible();
  const csvEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出当前图表全部数据 CSV' }).click();
  const csv = await readFile(await (await csvEvent).path(), 'utf8');
  expect(csv.split('\r\n')).toHaveLength(41); // 8 samples × 5 phyla + header
  expect(csv).toContain('1e-8'); // nonzero percentage, not rounded to 0
  const svgEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整门级图像', exact: true }).click();
  const svg = await readFile(await (await svgEvent).path(), 'utf8');
  expect(svg).toContain('<svg');
  expect(svg).toContain('CRR900001');
  expect(svg).toContain('CRR900008');
  await page.getByRole('combobox', { name: '导出格式', exact: true }).selectOption('png');
  const pngEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出完整门级图像', exact: true }).click();
  const png = await readFile(await (await pngEvent).path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  await page.getByText('查看筛选与合并明细', { exact: true }).click();
  await expect(page.getByRole('tab', { name: '合并明细', exact: true })).toBeVisible();
  await page.getByText('查看参与样本（8）', { exact: true }).click();
  await page.getByRole('combobox', { name: '参与样本分组', exact: true }).selectOption('NC');
  await expect(page.locator('.projection-samples__meta')).toContainText('共 4 个');
  await page.getByRole('searchbox', { name: '搜索参与样本' }).fill('900008');
  await expect(page.locator('.projection-samples__meta')).toContainText('共 1 个');
  await page.locator('.projection-audit--composition').screenshot({ path: '/private/tmp/opt003-details.png' });
  await nav.getByRole('button', { name: '门级丰度热图', exact: true }).click();
  await page.getByRole('combobox', { name: '颜色尺度' }).selectOption('log');
  await expect(page.getByText(/颜色表示log10/)).toBeVisible();
  await page.locator('.phylum-workspace').screenshot({ path: '/private/tmp/opt003-heatmap.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.phylum-workspace canvas').first()).toBeVisible();
  const scroll = await page.getByRole('region', { name: '门级图形画布，窄屏可左右滚动' }).evaluate(element => ({ width: element.clientWidth, content: element.scrollWidth }));
  expect(scroll.content).toBeGreaterThan(scroll.width);
  await page.locator('.phylum-workspace').screenshot({ path: '/private/tmp/opt003-mobile.png' });
  expect(errors).toEqual([]);
});

test('explicit merge restores completely and single-group incompatibility is explained', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('combobox', { name: '合并低丰度项', exact: true }).click();
  // StyledSelect implements the shared listbox.
  await page.getByRole('option', { name: '主动合并：样本平均相对丰度 <0.01%', exact: true }).click();
  await expect(page.getByText(/已主动合并 2 个门/)).toBeVisible();
  const nav = page.getByRole('navigation', { name: '门级图形切换' });
  await nav.getByRole('button', { name: '样本堆叠柱状图', exact: true }).click();
  await page.getByText('完整门级结果下载（独立于图形与合并）', { exact: true }).click();
  const fullEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载完整样本级门丰度 CSV', exact: true }).click();
  const full = await readFile(await (await fullEvent).path(), 'utf8');
  expect(full).toContain('Rare fixture');
  expect(full).toContain('Unclassified');
  expect(full.split('\r\n')).toHaveLength(41);
  await page.getByRole('combobox', { name: '合并低丰度项', exact: true }).click();
  await page.getByRole('option', { name: '不合并（显示全部门）', exact: true }).click();
  await expect(page.getByText(/当前未发生合并，显示全部可用门/)).toBeVisible();
  await page.getByRole('button', { name: 'AD 组', exact: true }).click();
  await expect(page.locator('.phylum-workspace__semantics').first()).toContainText('4 个样本');
  await nav.getByRole('button', { name: '均值差点图', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '当前范围需同时包含 AD 和 NC' })).toBeVisible();
  await nav.getByRole('button', { name: '分组条形图', exact: true }).click();
  await page.getByRole('checkbox', { name: '低丰度聚焦', exact: true }).check();
  await expect(page.getByRole('status').filter({ hasText: '当前范围 0–1%' })).toBeVisible();
  await nav.getByRole('button', { name: '门级丰度热图', exact: true }).click();
  await expect(page.getByText(/低丰度聚焦仅适用于分组条形图/)).toBeVisible();
});

test('185-sample browsing and export include the complete matrix', async ({ page }) => {
  // Controlled rendering load; deliberately labelled synthetic, not a research cohort.
  await page.route('**/projections/composition', async route => {
    const response = await route.fetch();
    const body = await response.json();
    const source = body.payload.sourceSamples;
    const samples = Array.from({ length: 185 }, (_, index) => ({ ...source[index % source.length], sample: `SyntheticLarge_${String(index + 1).padStart(3, '0')}` }));
    const groupCounts = samples.reduce((counts, row) => ({ ...counts, [row.group]: (counts[row.group] || 0) + 1 }), {});
    body.payload.samples = samples;
    body.payload.sourceSamples = samples;
    body.payload.semantics.sampleCount = 185;
    body.payload.semantics.groupCounts = groupCounts;
    for (const item of [...body.payload.items, ...body.payload.sourceItems]) {
      for (const group of Object.keys(groupCounts)) item.values[group] = samples.filter(row => row.group === group).reduce((sum, row) => sum + row.values[item.feature], 0) / groupCounts[group];
    }
    Object.assign(body.projection, { sampleCount: 185, groupCounts });
    await route.fulfill({ response, json: body });
  });
  await page.setViewportSize({ width: 1500, height: 1100 });
  await page.goto(URL);
  const nav = page.getByRole('navigation', { name: '门级图形切换' });
  await nav.getByRole('button', { name: '样本堆叠柱状图', exact: true }).click();
  await expect(page.locator('.phylum-workspace canvas').first()).toBeVisible();
  await page.getByText('完整门级结果下载（独立于图形与合并）', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载完整样本级门丰度 CSV', exact: true }).click();
  const csv = await readFile(await (await download).path(), 'utf8');
  expect(csv.split('\r\n')).toHaveLength(926);
  expect(csv).toContain('SyntheticLarge_185');
  await nav.getByRole('button', { name: '门级丰度热图', exact: true }).click();
  await expect(page.locator('.phylum-workspace canvas').first()).toBeVisible();
  await page.locator('.phylum-workspace').screenshot({ path: '/private/tmp/opt003-large-synthetic.png' });
});
