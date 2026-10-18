import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createStartupCache, frontendRoot, removeStartupCache, withStartupServer } from './startup-harness.mjs';

const api = process.env.EVIDENCE_API_URL || 'http://127.0.0.1:18100';
process.env.VITE_API_PROXY_TARGET = api;
const output = path.join(frontendRoot, '../.tmp/gmrepo-evidence-qa');
function validateExport(file) {
  const result = spawnSync(process.execPath, ['scripts/backend-python.mjs', '-X', 'utf8', '-m', 'app.cli.validate_gmrepo_evaluation', path.join(output, file)],
    { cwd: path.resolve(frontendRoot, '..'), encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, `Independent exported-package readback failed: ${result.stderr || result.stdout}`);
  return JSON.parse(result.stdout);
}
await mkdir(output, { recursive: true });
const json = async endpoint => {
  const response = await fetch(api + endpoint);
  assert.equal(response.status, 200, `${endpoint}: HTTP ${response.status}`);
  return response.json();
};
const catalog = await json('/api/references/gmrepo/catalog');
const revision = catalog.provenance.fingerprint;
const resources = await json(`/api/references/gmrepo/resources?revision=${revision}`);
const evaluation = await json(`/api/references/gmrepo/evidence-summary?genus=NCBI:816&revision=${revision}`);
assert.equal(resources.counts.installedProjects, 13);
assert.equal(evaluation.summary.plotCohorts, 5);
assert.equal(evaluation.summary.testableCohorts, 2);
assert.equal(evaluation.familySize, 322);
assert.equal(evaluation.summary.replicationStatus, 'not_established');
assert.equal(resources.researchLedger.counts.registeredProjects, 18);
assert.equal(resources.researchLedger.counts.discoveredNotInstalled, 5);
assert.equal(resources.protocol.discoveryStatus, 'partial');
assert.equal(resources.researchLedger.scientificReviewStatus, 'pending');
assert.equal(resources.researchLedger.registryFingerprint, evaluation.researchLedger.registryFingerprint);
assert.match(evaluation.evaluationId, /^[0-9a-f]{64}$/);
assert.equal(evaluation.snapshotStatus.status, 'current');
assert(resources.researchLedger.sourceChecks.length >= 57);
assert(resources.researchLedger.sourceChecks.every(source => source.availability === 'verified'));
assert(resources.researchLedger.records.filter(row => row.installed).every(row => row.fields.projectTitle.value));
assert.equal(resources.discovery.coverage.keywordScope.projectsScreened, 1238);
assert.equal(resources.discovery.coverage.keywordScope.notReturnedProjects, 111);
assert.equal(resources.primaryContext.status, 'source_bound');
assert.equal(resources.primaryContext.participantIdsAvailable, 0);
assert.equal(resources.primaryContext.rowwiseParticipantVerification, false);
assert.deepEqual(resources.primaryContext.groupCounts, { AD: 122, NC: 63 });
assert.deepEqual(resources.researchLedger.records.filter(r => r.screening.status === 'outside_scope').map(r => r.projectId).sort(), ['PRJNA373876', 'PRJNA807473']);
assert.equal(resources.researchLedger.relationships.pairs.length, 21);
assert.equal(resources.researchLedger.relationships.primaryStatus, 'registered_scope_matched');
assert.equal(resources.researchLedger.relationships.independentReplicationCount, null);
assert.equal(evaluation.wgsReference.catalog.sourceProvider, 'original_study');
assert.deepEqual(evaluation.wgsReference.catalog.groupCounts, { preclinical_AD: 49, biomarker_negative_CN: 115 });
const pilot = resources.researchLedger.records.find(row => row.projectId === 'PRJEB77146');
assert.equal(pilot.screening.status, 'stage_reference');
assert.match(pilot.screening.note, /排除.*痴呆/);
assert.equal(pilot.fields.country.value, '智利，Santiago 社区 GERO 基线队列');
assert.equal(pilot.installed, false);
assert(resources.researchLedger.records.every(row => row.screening.status !== 'pending'));
const fixedPackage = await json(`/api/references/gmrepo/evaluation-package?evaluationId=${evaluation.evaluationId}`);
assert.equal(fixedPackage.payload.evaluation.generatedAt, evaluation.generatedAt);
assert.deepEqual(fixedPackage.payload.evaluation.claims, evaluation.claims);
await writeFile(path.join(output, 'fixed-evaluation-package.json'), JSON.stringify(fixedPackage, null, 2));
assert.equal(validateExport('fixed-evaluation-package.json').evaluationId, evaluation.evaluationId);
for (const row of evaluation.cohorts) {
  assert.deepEqual(row.researchRecord.capabilities, resources.items.find(item => item.projectId === row.projectId).researchRecord.capabilities);
  assert.equal(row.audit.allRunSetSha256, row.researchRecord.comparison.allRunSetSha256);
}
const stale = await fetch(`${api}/api/references/gmrepo/evidence-summary?genus=NCBI:816&revision=obsolete`);
assert.equal(stale.status, 409);
await writeFile(path.join(output, 'bacteroides-evaluation.json'), JSON.stringify(evaluation, null, 2));
const report = await fetch(`${api}/api/references/gmrepo/report?genus=NCBI:816&evaluationId=${evaluation.evaluationId}`);
assert.equal(report.status, 200);
const reportText = await report.text();
assert(reportText.includes(resources.researchLedger.registryFingerprint));
assert(reportText.includes('INDEPENDENCE_UNREVIEWED'));
assert(reportText.includes(evaluation.evaluationId));
await writeFile(path.join(output, 'bacteroides-evaluation.md'), reportText);

const cache = await createStartupCache();
const results = { referenceRevision: revision, counts: resources.counts, discovery: resources.discovery.scopes,
  primaryStatus: evaluation.primary.status, status: 'running', tests: [], screenshots: [] };
await writeFile(path.join(output, 'verification.json'), JSON.stringify(results, null, 2));
try {
  await withStartupServer(cache, async (_server, base) => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/reference/gmrepo`);
      await page.getByRole('heading', { name: 'GMrepo 参考资源', exact: true }).waitFor();
      await page.getByRole('heading', { name: '研究目录', exact: true }).waitFor();
      assert.equal(await page.locator('.evaluation-directory-table tbody tr').count(), 13);
      const evidenceTheme = await page.evaluate(() => {
        const header = getComputedStyle(document.querySelector('.app-topbar'));
        const panel = getComputedStyle(document.querySelector('.evaluation-registry'));
        return { header: header.backgroundImage, panelBorder: panel.borderTopColor, panelRadius: panel.borderRadius,
          panelShadow: panel.boxShadow, font: getComputedStyle(document.body).fontFamily,
          accent: getComputedStyle(document.querySelector('.gmrepo-page')).getPropertyValue('--workspace-accent').trim(),
          brandColor: getComputedStyle(document.querySelector('.app-title')).color };
      });
      assert.equal(await page.locator('aside').count(), 0);
      await page.screenshot({ path: path.join(output, 'reference-desktop.png'), fullPage: true });
      results.screenshots.push('reference-desktop.png');
      results.tests.push('真实 13 项研究目录、无侧栏、质量与方法分离');
      await page.getByRole('button', { name: /^补充发现/ }).click();
      await page.getByRole('button', { name: 'PRJEB77146', exact: true }).waitFor();
      await page.getByRole('button', { name: 'PRJEB77146', exact: true }).click();
      const pilotRow = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'PRJEB77146', exact: true }) });
      await pilotRow.getByText('未接入，尚无本地分母', { exact: true }).waitFor();
      const pendingRecord = page.getByRole('region', { name: 'PRJEB77146 研究依据与适用范围' });
      await pendingRecord.getByText(/证据适用限制/).click();
      assert(await pendingRecord.locator('.reference-blocker-list article').count() > 0);
      await pendingRecord.getByText(/认知主诉人群/).first().waitFor();
      await pendingRecord.getByText('研究字段与依据', { exact: true }).click();
      await pendingRecord.locator('.reference-research-fields dd').filter({ hasText: '智利，Santiago 社区 GERO 基线队列' }).waitFor();
      assert.equal(await page.getByRole('link', { name: '质量与样本 →', exact: true }).count(), 0);
      await page.screenshot({ path: path.join(output, 'reference-discovered-ledger.png'), fullPage: true });
      await page.getByRole('button', { name: /^已接入项目/ }).click();
      results.tests.push('18 项台账与报告状态一致；补充发现可核查缺项，不虚构分母和检验');
      results.tests.push('字段/原件校验、18 项处理去向、认知主诉队列不冒充临床 AD/NC');
      await page.setViewportSize({ width: 2552, height: 1274 });
      assert((await page.locator('.reference-workspace .gmrepo-main').boundingBox()).width > 1750, 'wide library should use the available workspace');
      await page.screenshot({ path: path.join(output, 'reference-wide.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile library page overflow');
      await page.screenshot({ path: path.join(output, 'reference-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole('button', { name: /^分布可用/ }).click();
      await page.waitForFunction(() => document.querySelectorAll('.evaluation-directory-table tbody tr').length === 5);
      assert.equal(await page.locator('.evaluation-directory-table tbody tr').count(), 5);
      await page.getByRole('button', { name: 'PRJEB51982', exact: true }).click();
      await page.getByRole('heading', { name: 'PRJEB51982 · 队列详情' }).waitFor();
      const registeredRecord = page.getByRole('region', { name: 'PRJEB51982 研究依据与适用范围' });
      await registeredRecord.getByText('研究字段与依据', { exact: true }).click();
      await registeredRecord.getByText(/证据适用限制/).click();
      await registeredRecord.getByText('比较范围与版本依据', { exact: true }).click();
      assert.equal(await registeredRecord.getByText(/复核人员：|签署日期：|下一步：/).count(), 0);
      await page.screenshot({ path: path.join(output, 'reference-study-detail.png'), fullPage: true });
      await page.getByRole('link', { name: '选择菌属查看分布 →', exact: true }).click();
      await page.getByRole('heading', { name: '参考菌属目录', exact: true }).waitFor();
      await page.screenshot({ path: path.join(output, 'reference-genera-directory.png'), fullPage: true });
      await page.getByRole('searchbox', { name: '检索菌属、旧名或 TaxID' }).fill('Bacteroides');
      await page.screenshot({ path: path.join(output, 'reference-genera.png'), fullPage: true });
      await page.getByRole('link', { name: '评估 Bacteroides', exact: true }).click();
      await page.getByRole('heading', { name: 'Bacteroides', exact: true, level: 1 }).waitFor();
      await page.locator('.gmrepo-distribution-heading').getByText('PRJEB51982', { exact: false }).waitFor();
      assert.equal(new URL(page.url()).searchParams.get('analysisCohort'), 'PRJEB51982');
      results.tests.push('队列筛选 → 就地研究详情 → 菌属检索 → 同一队列真实分布；宽屏/移动端资源页通过');
      await page.goto(`${base}/reference/gmrepo`);
      await page.getByRole('searchbox', { name: '检索研究项目' }).waitFor();
      await page.getByRole('searchbox', { name: '检索研究项目' }).fill('PRJEB51982');
      await page.waitForFunction(() => document.querySelectorAll('.evaluation-directory-table tbody tr').length === 1);
      assert.equal(await page.locator('.evaluation-directory-table tbody tr').count(), 1);
      await page.getByRole('link', { name: '数据质量', exact: true }).click();
      await page.getByRole('heading', { name: '各队列 AD/NC 可用记录', exact: true }).waitFor();
      await page.locator('.gmrepo-chart-host svg').first().waitFor();
      await page.screenshot({ path: path.join(output, 'reference-quality.png'), fullPage: true });
      results.screenshots.push('reference-quality.png');
      await page.getByRole('link', { name: '来源与方法', exact: true }).click();
      await page.getByRole('heading', { name: '来源范围与接入方法', exact: true }).waitFor();
      await page.locator('[aria-label="来源目录覆盖说明"]').getByText(/1238.*1349/).waitFor();
      await page.getByText('本项目主队列的纳入与受试者依据', { exact: true }).click();
      await page.getByText(/公开受试者 ID 覆盖：0 \/ 185/).waitFor();
      await page.getByText(/未完成逐受试者 ID 的重复采样核验/).waitFor();
      await page.getByText(/来源获取回执与本地读回校验/).click();
      assert.equal(await page.getByText(/本地原件哈希一致/).count(), resources.researchLedger.acquisitions.filter(row => row.availability === 'verified').length);
      await page.screenshot({ path: path.join(output, 'reference-methods.png'), fullPage: true });
      results.screenshots.push('reference-methods.png');
      results.tests.push('研究检索、原质量图表、来源核查记录均可使用');
      await page.getByRole('link', { name: 'WGS 扩展', exact: true }).click();
      await page.getByRole('heading', { name: 'WGS 扩展参考', exact: true }).waitFor();
      await page.getByLabel('特征层级', { exact: true }).selectOption('species');
      await page.getByLabel('查找原研究特征', { exact: true }).fill('Bacteroides uniformis');
      const wgsPicker = page.getByLabel('选择特征', { exact: true });
      await wgsPicker.locator('option').filter({ hasText: 'Bacteroides uniformis' }).waitFor({ state: 'attached' });
      const wgsFeature = await wgsPicker.locator('option').filter({ hasText: 'Bacteroides uniformis' }).first().getAttribute('value');
      await wgsPicker.selectOption(wgsFeature);
      await page.getByRole('heading', { name: 'Bacteroides uniformis', exact: true }).waitFor();
      await page.locator('.reference-wgs table tbody tr').first().waitFor();
      await page.getByRole('img', { name: 'Bacteroides uniformis 临床前阶段 WGS 相对丰度分布', exact: true }).locator('canvas, svg').first().waitFor();
      await page.screenshot({ path: path.join(output, 'reference-wgs.png'), fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.querySelector('.reference-wgs [role="img"] canvas, .reference-wgs [role="img"] svg')?.getBoundingClientRect().width < 390);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'WGS/mobile page overflow');
      await page.screenshot({ path: path.join(output, 'reference-wgs-mobile.png'), fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
      results.tests.push('真实 WGS 164 名参与者、49/115 阶段分组、物种分布与 390px；不混入 GMrepo AD/NC');
      await page.getByRole('link', { name: '来源与方法', exact: true }).click();
      await page.getByRole('heading', { name: '来源范围与接入方法', exact: true }).waitFor();
      assert.equal(await page.getByText(/科研待审与资料补交|下载科研待审包|复核人员：|签署日期：/).count(), 0);
      results.tests.push('单一产品页面保留来源与适用范围，不展示人员签署、补交任务或待审入口');
      await page.goto(`${base}/reference/gmrepo/evidence/NCBI%3A816?revision=${revision}`);
      await page.getByRole('heading', { name: 'Bacteroides', exact: true, level: 1 }).waitFor();
      await page.getByRole('heading', { name: '外部队列比较', exact: true }).waitFor();
      await page.getByText('固定评估与当前用途状态', { exact: true }).click();
      await page.getByText(/页面与两种导出使用同一固定评估/).waitFor();
      const fixedHref = await page.getByRole('link', { name: '导出评估报告', exact: true }).getAttribute('href');
      assert.match(new URL(fixedHref, base).searchParams.get('evaluationId'), /^[0-9a-f]{64}$/);
      await page.getByText('固定评估与当前用途状态', { exact: true }).click();
      results.tests.push('对象解释引用实际结果；页面、JSON 和报告绑定同一固定评估 ID');
      const cohortBox = await page.getByRole('region', { name: '外部队列证据比较', exact: true }).boundingBox();
      assert(cohortBox.y < 650, 'cohort evidence must begin in the desktop first fold');
      await page.getByRole('heading', { name: '菌属分布 · 同一队列 AD / NC', exact: true }).waitFor();
      await page.locator('svg').first().waitFor();
      assert.equal(await page.locator('aside').count(), 0);
      await page.screenshot({ path: path.join(output, 'evidence-desktop.png'), fullPage: true });
      await page.screenshot({ path: path.join(output, 'evidence-fold.png') });
      results.screenshots.push('evidence-desktop.png');
      results.tests.push('真实五队列汇总、分布与报告、固定参考版本');
      await page.locator('.evaluation-export summary').click();
      const evidenceDownload = page.waitForEvent('download');
      await page.getByRole('button', { name: '完整证据 JSON', exact: true }).click();
      await (await evidenceDownload).saveAs(path.join(output, 'browser-evidence-export.json'));
      assert.equal(validateExport('browser-evidence-export.json').evaluationId, new URL(fixedHref, base).searchParams.get('evaluationId'));
      const replayDownload = page.waitForEvent('download');
      await page.getByRole('link', { name: '参考队列离线复算包', exact: true }).click();
      const replayZip = path.join(output, 'browser-reference-replay.zip');
      await (await replayDownload).saveAs(replayZip);
      const replayRoot = await mkdtemp(path.join(output, 'replay-'));
      const runPython = args => spawnSync(process.execPath, ['scripts/backend-python.mjs', ...args], { cwd: path.resolve(frontendRoot, '..'), encoding: 'utf8', timeout: 60000 });
      const extracted = runPython(['-I', '-m', 'zipfile', '-e', replayZip, replayRoot]);
      assert.equal(extracted.status, 0, extracted.stderr);
      const replayed = runPython(['-I', path.join(replayRoot, 'replay.py'), replayRoot]);
      assert.equal(replayed.status, 0, replayed.stderr || replayed.stdout);
      const replayResult = JSON.parse(replayed.stdout);
      assert.equal(replayResult.evaluationId, new URL(fixedHref, base).searchParams.get('evaluationId'));
      assert.equal(replayResult.cohorts.filter(row => row.computedFeatures === 322).length, 2);
      assert.equal(replayResult.wgs, 'selected_stage_distribution_recomputed_from_extracted_author_tables');
      await writeFile(path.join(output, 'standalone-replay-result.json'), JSON.stringify(replayResult, null, 2));
      results.tests.push('浏览器下载包在 Python -I 独立目录从输入重算：两队列完整 322 属、三描述队列及 WGS 阶段分布通过');
      await page.locator('.evaluation-export summary').click();
      results.tests.push('浏览器实际 JSON 导出通过独立 Python CLI 校验；重序列化数值不破坏评估 ID/哈希');
      const chosenCohort = evaluation.cohorts.at(-1).projectId;
      await page.getByRole('button', { name: `查看 ${chosenCohort} 分布`, exact: true }).click();
      await page.locator('.gmrepo-distribution-heading').getByText(new RegExp(chosenCohort)).waitFor();
      assert(new URL(page.url()).searchParams.get('analysisCohort') === chosenCohort);
      results.tests.push('队列表选择与下方真实分布联动，研究菌属不被默认替换');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(output, 'evidence-mobile.png'), fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile page overflow');
      results.screenshots.push('evidence-mobile.png');
      results.tests.push('390px 无页面横向溢出');
      await page.setViewportSize({ width: 1440, height: 1000 });
      const archiveId = new URL(fixedHref, base).searchParams.get('evaluationId');
      await page.goto(`${base}/reference/gmrepo/evidence?evaluationId=${archiveId}`);
      await page.getByRole('heading', { name: 'Bacteroides', exact: true, level: 1 }).waitFor();
      await page.getByRole('heading', { name: '外部队列比较', exact: true }).waitFor();
      const archiveHref = await page.getByRole('link', { name: '导出评估报告', exact: true }).getAttribute('href');
      assert.equal(new URL(archiveHref, base).searchParams.get('evaluationId'), archiveId);
      await page.getByRole('region', { name: '当前对象的 WGS 阶段参考', exact: true }).waitFor();
      results.tests.push('按 evaluationId 读回页面、报告及冻结 WGS 背景，不重新生成替代评估');
      await page.goto(`${base}/reference/gmrepo/evidence?subjectType=species&subjectId=1&sourceRevision=obsolete&revision=${revision}`);
      await page.getByText(/固定版本中没有该物种记录|主对象数据暂不可读取/).waitFor();
      assert.equal(await page.getByRole('heading', { name: '外部队列比较', exact: true }).count(), 0);
      results.tests.push('不可读主版本不回退默认菌属');

      if (evaluation.primary.status === 'available') {
        await page.goto(`${base}/analysis/abundance?dataset=ad-nc-species&chart=boxplot`);
        const picker = page.getByRole('combobox', { name: /评估图中物种/ });
        await picker.waitFor({ timeout: 60000 });
        const mainTheme = await page.evaluate(() => {
          const header = getComputedStyle(document.querySelector('.app-topbar'));
          const panel = getComputedStyle(document.querySelector('.chart-frame'));
          return { header: header.backgroundImage, panelBorder: panel.borderTopColor, panelRadius: panel.borderRadius,
            panelShadow: panel.boxShadow, font: getComputedStyle(document.body).fontFamily,
            accent: getComputedStyle(document.querySelector('.app')).getPropertyValue('--workspace-accent').trim(),
            brandColor: getComputedStyle(document.querySelector('.app-title')).color };
        });
        assert.deepEqual(evidenceTheme, mainTheme, 'external evidence must share the main workspace visual theme');
        results.visualTheme = { evidence: evidenceTheme, main: mainTheme };
        results.tests.push('主分析与外部证据的实际顶栏、面板、字体、主题色一致');
        await page.screenshot({ path: path.join(output, 'main-analysis-style.png') });
        const options = await picker.locator('option').evaluateAll(nodes => nodes.map(n => ({ id: n.value, name: n.textContent })).filter(n => n.id));
        let chosen;
        for (const candidate of options.slice(0, 30)) {
          const mapped = await json(`/api/references/gmrepo/resolve-subject?subjectType=species&subjectId=${encodeURIComponent(candidate.id)}&sourceRevision=${encodeURIComponent(evaluation.primary.datasetRevision)}&revision=${revision}`);
          if (mapped.status === 'mapped') { chosen = { ...candidate, mapping: mapped }; break; }
        }
        assert(chosen, 'no mapped real species among chart candidates');
        await picker.selectOption(chosen.id);
        await page.locator('.boxplot-chart').getByRole('link', { name: '外部证据评估' }).click();
        await page.getByRole('heading', { name: chosen.mapping.subjectName, exact: true }).waitFor();
        await page.getByRole('heading', { name: '外部队列比较', exact: true }).waitFor();
        await page.screenshot({ path: path.join(output, 'species-evidence.png') });
        await page.getByRole('navigation', { name: '外部证据导航' }).getByRole('link', { name: '参考资源', exact: true }).click();
        await page.getByRole('region', { name: '当前研究对象', exact: true }).getByText(chosen.mapping.subjectName, { exact: true }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get('sourceRevision'), evaluation.primary.datasetRevision);
        await page.getByRole('link', { name: '来源与方法', exact: true }).click();
        await page.getByRole('heading', { name: '来源范围与接入方法', exact: true }).waitFor();
        await page.screenshot({ path: path.join(output, 'reference-object-context.png') });
        await page.getByRole('link', { name: '继续对象评估 →', exact: true }).click();
        await page.getByRole('heading', { name: chosen.mapping.subjectName, exact: true }).waitFor();
        results.tests.push('主物种 → 资源目录/方法 → 继续评估：对象、主版本与原分析入口保持不变');
        assert(page.url().includes(`subjectId=${chosen.id}`));
        await page.getByRole('link', { name: '返回主分析', exact: true }).click();
        await picker.waitFor({ timeout: 60000 });
        assert.equal(await picker.inputValue(), chosen.id);
        results.tests.push(`真实主物种 ${chosen.id}：原箱线图 → 固定版本评估 → 返回并恢复对象`);
        results.speciesCase = chosen.mapping;
        const fullResults = page.locator('.complete-results');
        if (await fullResults.getAttribute('open') === null) await fullResults.locator('summary').click();
        await fullResults.getByRole('textbox', { name: '完整结果搜索' }).fill(chosen.id);
        const searchResponse = page.waitForResponse(response => response.url().includes('/results?')
          && new URL(response.url()).searchParams.get('query') === chosen.id, { timeout: 60000 });
        await fullResults.getByRole('button', { name: '查询完整结果', exact: true }).click();
        assert.equal((await searchResponse).status(), 200);
        const resultLink = page.locator('.complete-results').getByRole('link', { name: '外部证据评估', exact: true }).first();
        try { await resultLink.waitFor({ timeout: 60000 }); }
        catch (error) {
          await writeFile(path.join(output, 'complete-results-diagnostic.html'), await fullResults.evaluate(node => node.outerHTML));
          await page.screenshot({ path: path.join(output, 'complete-results-failure.png'), fullPage: true });
          console.error(await fullResults.innerText());
          throw error;
        }
        const resultUrl = new URL(await resultLink.getAttribute('href'), base);
        assert.equal(resultUrl.searchParams.get('subjectId'), chosen.id);
        const resultSubject = await json(`/api/references/gmrepo/resolve-subject?${resultUrl.searchParams}`);
        await resultLink.click();
        await page.getByRole('heading', { name: resultSubject.subjectName, exact: true }).waitFor();
        if (resultSubject.status === 'mapped') await page.getByRole('heading', { name: '外部队列比较', exact: true }).waitFor();
        else await page.getByText(resultSubject.reasons[0], { exact: true }).waitFor();
        await page.getByRole('link', { name: '返回主分析', exact: true }).click();
        await resultLink.waitFor({ timeout: 60000 });
        assert.equal(await fullResults.getByRole('textbox', { name: '完整结果搜索' }).inputValue(), chosen.id);
        results.tests.push('真实完整物种结果行 → 固定对象评估 → 返回并恢复查询条件及展开区域');
      } else {
        results.tests.push('主数据库当前不可读，真实物种浏览器贯通待核验；对象版本隔离由单元测试覆盖');
      }
      const magOverview = await json('/api/mag/overview');
      const magRevision = magOverview.provenance.dataFingerprint;
      await page.goto(`${base}/analysis/abundance?domain=mag`);
      const rows = page.locator('.mag-feature-table button.analysis-text-button');
      await rows.first().waitFor({ timeout: 60000 });
      const magId = await rows.first().textContent();
      await rows.first().click();
      const drawer = page.getByRole('dialog');
      await drawer.getByRole('tab', { name: '分类证据', exact: true }).click();
      await drawer.getByRole('link', { name: '外部证据评估', exact: true }).click();
      await page.getByRole('heading', { name: magId, exact: true }).waitFor();
      const magResult = await json(`/api/references/gmrepo/resolve-subject?subjectType=mag&subjectId=${encodeURIComponent(magId)}&sourceRevision=${magRevision}&revision=${revision}`);
      if (magResult.status === 'mapped') {
        await page.getByRole('heading', { name: '外部队列比较', exact: true }).waitFor();
      } else {
        await page.getByText(magResult.reasons[0], { exact: true }).waitFor();
        assert.equal(await page.getByRole('heading', { name: '外部队列比较', exact: true }).count(), 0);
      }
      await page.getByRole('link', { name: '返回主分析', exact: true }).click();
      await page.getByRole('dialog').getByRole('tab', { name: '分类证据', exact: true }).waitFor({ timeout: 60000 });
      assert.equal(await page.getByRole('dialog').getByRole('tab', { name: '分类证据', exact: true }).getAttribute('aria-selected'), 'true');
      results.magCase = magResult;
      results.tests.push(`真实 MAG ${magId}：分类详情 → ${magResult.status} → 返回并恢复详情页签`);
      assert.deepEqual(errors, [], 'browser runtime errors');
    } finally { await browser.close(); }
  });
  results.status = 'passed';
} catch (error) {
  results.status = 'failed';
  results.error = error.message;
  throw error;
} finally {
  await removeStartupCache(cache);
  await writeFile(path.join(output, 'verification.json'), JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results, null, 2));
