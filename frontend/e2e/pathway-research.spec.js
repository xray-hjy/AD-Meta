import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('real pathways preserve pool across modules, distinguish search and scope, and export selected evidence',async({page})=>{
  test.skip(!process.env.AD_META_E2E_DITING_ROOT,'Real isolated DiTing fixture required');test.setTimeout(150000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))errors.push(m.text());});
  await page.setViewportSize({width:1600,height:1100});
  const response=page.waitForResponse(r=>r.url().endsWith('/diting/pathways'));
  await page.goto('/analysis/abundance?dataset=ad-nc-ko-abundance&chart=ditingOverview');
  const payload=await(await response).json();expect(payload.items).toHaveLength(95);
  expect(payload.items.filter(r=>r.values.every(v=>v===0))).toHaveLength(24);
  const context=page.getByRole('region',{name:'通路研究范围与对象状态'});
  await expect(context).toContainText('固定分析队列 185 人：AD 122、NC 63');
  await expect(page.getByText('自定义子集',{exact:true})).toHaveCount(0);
  await page.locator('.diting-selection summary').click();await page.getByRole('button',{name:'清空对象池',exact:true}).click();await expect(context).toContainText('对象池已选 0 项');
  await page.getByLabel('搜索通路候选').fill('Fermentation');
  const fermentation=payload.items.filter(r=>r.name.includes('Fermentation')).slice(0,3);expect(fermentation).toHaveLength(3);
  for(const [index,item] of fermentation.entries()) { const box=page.getByRole('checkbox',{name:`选择 ${item.name}`,exact:true}); await box.click(); await expect(box).toBeChecked(); await expect(context).toContainText(`对象池已选 ${index+1} 项`); }
  await expect(context).toContainText('对象池已选 3 项');
  const selected=()=>new URL(page.url()).searchParams.get('pathways').split(',').sort();
  expect(selected()).toEqual(fermentation.map(r=>r.id).sort());
  for(const label of ['组间效应','样本分布','概览']){
    await page.getByRole('button',{name:`同一对象池：${label}`,exact:true}).click();
    await expect(context).toContainText('当前图 3 项');expect(selected()).toEqual(fermentation.map(r=>r.id).sort());
  }
  await page.getByRole('button',{name:'同一对象池：样本分布',exact:true}).click();
  await page.getByLabel('搜索通路候选').fill('NO_MATCH_zzzz');await expect(context).toContainText('候选匹配 0 项');await expect(context).toContainText('仍展示已选对象');
  await page.getByRole('button',{name:'清空搜索',exact:true}).click();await expect(context).toContainText('候选匹配 95 项');
  const recordEvent=page.waitForEvent('download');await page.getByRole('button',{name:'导出通路分析说明 JSON',exact:true}).click();
  const record=JSON.parse(await readFile(await(await recordEvent).path(),'utf8'));expect(record.selectedIds.sort()).toEqual(fermentation.map(r=>r.id).sort());
  expect(record.samples).toHaveLength(185);
  await page.getByRole('combobox',{name:'通路显示分组',exact:true}).click();await page.locator('[role="option"][data-select-value="AD"]').click();
  await page.getByRole('button',{name:'ECDF',exact:true}).click();await expect(context).toContainText('当前可见组：AD；统计比较始终基于完整 AD/NC 队列');
  const sampleEvent=page.waitForEvent('download');await page.getByRole('button',{name:'导出当前所见样本原值',exact:true}).click();
  const csv=await readFile(await(await sampleEvent).path(),'utf8');expect(csv.trim().split('\r\n')).toHaveLength(367);expect(csv).not.toContain('"NC"');
  const chosenEvent=page.waitForEvent('download');await page.getByRole('button',{name:'导出当前已选通路统计',exact:true}).click();expect((await readFile(await(await chosenEvent).path(),'utf8')).trim().split('\r\n')).toHaveLength(4);
  await page.locator('.research-chart-surface').screenshot({path:'/private/tmp/opt010-ad-distribution.png'});
  await page.locator('.diting-focused-summary').screenshot({path:'/private/tmp/opt010-focus.png'});
  const first7=payload.items.slice(0,7), url=new URL(page.url());url.searchParams.set('pathways',first7.map(r=>r.id).join(','));url.searchParams.set('pathway',first7[0].id);url.searchParams.set('pathwayPage','0');url.searchParams.delete('pathwayGroup');
  await page.goto(url.toString());await expect(context).toContainText('当前图 6 项');
  await page.getByRole('button',{name:'下一页',exact:true}).click();await expect(context).toContainText('当前图 1 项');await expect(page.getByRole('combobox',{name:'选择研究通路',exact:true})).toContainText(first7[6].name);
  await page.getByRole('combobox',{name:'选择研究通路',exact:true}).click();await page.locator(`[role="option"][data-select-value="${first7[1].id}"]`).click();await expect(context).toContainText('对象池已选 7 项');await expect(context).toContainText('当前图 6 项');
  const svgEvent=page.waitForEvent('download');await page.getByRole('button',{name:'导出全部已选通路 SVG',exact:true}).click();const downloadedSvg=await svgEvent; await downloadedSvg.saveAs('/private/tmp/opt010-selected7.svg'); const svg=await readFile(await downloadedSvg.path(),'utf8');for(const item of first7) expect(svg).toContain(item.name.replaceAll('&','&amp;').replaceAll('>','&gt;'));
  await context.screenshot({path:'/private/tmp/opt010-pool.png'});
  const zero=payload.items.find(r=>r.values.every(v=>v===0));const zeroUrl=new URL(page.url());zeroUrl.searchParams.set('pathways',zero.id);zeroUrl.searchParams.set('pathway',zero.id);zeroUrl.searchParams.set('pathwayPage','0');await page.goto(zeroUrl.toString());
  await expect(page.getByText(/全部样本为零：显示实际观测值/)).toBeVisible();await page.locator('.diting-selection summary').click();await page.getByRole('button',{name:'清空对象池',exact:true}).click();await expect(page.getByText('通路对象池为空，请从候选列表加入通路。')).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);expect(errors).toEqual([]);
});
