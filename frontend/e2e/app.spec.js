import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const SPECIES_DATASET = 'ad-nc-species';
const KO_DATASET = 'ad-nc-ko-abundance';

async function expectNoSeriousAccessibilityViolations(page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  const blocking = results.violations.filter(({ impact }) =>
    impact === 'serious' || impact === 'critical'
  );
  expect(blocking).toEqual([]);
}

test('home page opens the analysis workspace and passes the accessibility gate', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'AD-Meta', level: 1 })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  await page.getByRole('link', { name: /进入群落分析/ }).click();
  await expect(page).toHaveURL(/\/analysis\/abundance/);
  await expect(page.getByRole('heading', { name: /Top N (物种|KO)丰度对比/ })).toBeVisible();
});

test('deep links restore all taxonomy modes and dataset switching', async ({ page }) => {
  await page.goto(`/analysis/abundance?dataset=${SPECIES_DATASET}&chart=sunburst`);
  await expect(page.getByRole('heading', { name: '分类层级旭日图' })).toBeVisible();

  const modes = [
    ['矩形树图', 'treemap', '分类层级矩形树图'],
    ['桑基图', 'sankey', '分类层级桑基图'],
    ['放射树图', 'radialtree', '分类层级放射树图'],
    ['旭日图', 'sunburst', '分类层级旭日图'],
  ];
  for (const [label, chart, title] of modes) {
    await page.getByRole('button', { name: new RegExp(`^${label}`) }).click();
    await expect(page).toHaveURL(new RegExp(`chart=${chart}`));
    await expect(page.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.locator('.taxonomy-chart-surface')).toBeVisible();
  }

  await page.getByRole('button', { name: '群落功能 切换数据域' }).click();
  await expect(page).toHaveURL(new RegExp(`dataset=${KO_DATASET}.*chart=species`));
  await expect(page.getByRole('heading', { name: /Top N KO丰度对比/ })).toBeVisible();
});

test('heatmap supports keyboard lightbox and PNG export', async ({ page }) => {
  await page.goto(`/analysis/abundance?dataset=${SPECIES_DATASET}&chart=heatmap`);
  await expect(page.getByRole('heading', { name: '差异丰度热图' })).toBeVisible();

  const firstHeatmap = page.getByRole('button', { name: /^AD 组丰度热图，按回车放大/ });
  await firstHeatmap.press('Enter');
  await expect(page.getByRole('dialog', { name: /AD 组丰度热图 放大预览/ })).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出图片' }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^heatmap_AD-abundance_.*\.png$/);
});
