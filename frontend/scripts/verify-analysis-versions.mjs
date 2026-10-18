import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const base = process.env.ANALYSIS_QA_URL || 'http://127.0.0.1:3000';
const output = new URL('../.tmp/analysis-version-qa/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const response = await page.request.get(`${base}/api/analysis-runs`);
  assert.equal(response.status(), 200);
  const runs = await response.json();
  const visible = runs.filter(run => run.selectorVisible !== false);
  assert.deepEqual(visible.map(run => run.name), ['AD/NC 群落分析', 'AD/NC 群落分析（旧版）']);
  const current = visible.find(run => run.isDefault);
  const old = visible.find(run => !run.isDefault);
  const transition = runs.find(run => run.selectorVisible === false);
  assert.equal(current.artifacts.find(item => item.type === 'species_abundance').datasetRevision, '098416ecb5f143bba49867f26dd470c5');
  assert.equal(current.artifacts.find(item => item.type === 'ko_abundance').datasetRevision, '6b3ffaba9e9647e58b9a07a682a765a6');
  assert.equal(old.artifacts.find(item => item.type === 'species_abundance').datasetRevision, '2005c6a7f1554cebbb47632c81fe3bcb');
  assert.equal(old.artifacts.find(item => item.type === 'ko_abundance').datasetRevision, '89c93c4938e24dc385c9a1713fd71960');

  await page.goto(`${base}/analysis/abundance`);
  const selector = page.getByRole('combobox', { name: '选择分析运行' });
  await selector.filter({ hasText: 'AD/NC 群落分析' }).waitFor();
  await page.waitForURL(url => url.searchParams.get('run') === current.key);
  await selector.click();
  await page.getByRole('option').first().waitFor();
  assert.deepEqual(await page.getByRole('option').allTextContents().then(labels => labels.map(label => label.replace('✓', ''))), visible.map(run => run.name));
  await page.screenshot({ path: fileURLToPath(new URL('two-options.png', output)) });
  await page.keyboard.press('Escape');
  for (const name of [/群落物种/, /群落功能/]) {
    await page.getByRole('button', { name }).click();
    await page.locator('.chart-plain .zoomable-chart__viewport canvas').first().waitFor({ timeout: 60000 });
    assert.equal(new URL(page.url()).searchParams.get('run'), current.key);
    assert.equal(await selector.locator('.styled-select-value').innerText(), 'AD/NC 群落分析');
  }
  console.log('PASS: two exact labels, current default, species/function share the same result');

  await selector.click();
  await page.getByRole('option', { name: old.name, exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('run') === old.key);
  await selector.filter({ hasText: old.name }).waitFor();
  assert.match(await selector.innerText(), /AD\/NC 群落分析（旧版）/);
  console.log('PASS: old result retains its original species and KO revisions');

  await page.goto(`${base}/analysis/abundance?run=${transition.key}&dataset=ad-nc-species&chart=species`);
  await selector.filter({ hasText: transition.name }).waitFor();
  await page.locator('.chart-plain .zoomable-chart__viewport canvas').first().waitFor({ timeout: 60000 });
  assert.equal(new URL(page.url()).searchParams.get('run'), transition.key);
  await selector.click();
  await page.getByRole('option').first().waitFor();
  assert.equal(await page.getByRole('option').count(), 2);
  assert.equal(await page.getByRole('option', { name: transition.name, exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: transition deep link preserved without adding a third choice');
} finally {
  await browser.close();
}
