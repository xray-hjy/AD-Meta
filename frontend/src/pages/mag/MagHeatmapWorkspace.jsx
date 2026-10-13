import StyledSelect from '../../components/ui/StyledSelect';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMagHeatmap, magDownloadUrl } from '../../api/mag';
import ChartFrame from '../../components/Charts/ChartFrame';
import ChartStyleToolbar from '../../components/Charts/ChartStyleToolbar';
import useChartStylePreferences from '../../components/Charts/useChartStylePreferences';
import CollapsibleResultSection from '../../components/data-display/CollapsibleResultSection';
import DataTableViewport from '../../components/data-display/DataTableViewport';
import PaginationControls from '../../components/data-display/PaginationControls';
import LoadingState from '../../components/ui/LoadingState';
import { MagChartExportMenu, MagHeatmapCountControl } from './MagToolbar';
import MagSearchInput, { MagCandidateInput } from './MagSearchInput';
import { HEATMAP_PALETTE_OPTIONS, HEATMAP_STYLE_DEFAULTS, ROW_Z_PALETTE_OPTIONS, heatmapColors } from './magHeatmapOption';
import './mag-heatmap.css';
import { treeMaximum } from './magDendrogram';

const MagChart = lazy(() => import('./MagCharts'));
export const DEFAULT_HEATMAP_SETTINGS = { heatmapMode: 'abundance', candidateKind: 'statistics', heatmapQuery: '', heatmapIds: '', topN: 20,
  minMean: 0, sampleThreshold: 0, minSamplePercent: 0, minCompleteness: '', maxContamination: '', maxQ: 0.05, minEffect: 0,
  sampleOrder: 'group', rowOrder: 'rank', colorMode: 'abundance' };
const choices = items => items.map(([value, label]) => ({ value, label }));
const STYLE_FIELDS = [
  { key: 'transposed', label: '交换横纵轴', type: 'toggle', description: '切换样本 / MAG 的显示方向；丰度与按 MAG 标准化保持不变' },
  { key: 'palette', label: '配色', type: 'palette', options: HEATMAP_PALETTE_OPTIONS, description: '连续色系 · 左侧低丰度，右侧高丰度' },
  { key: 'annotations', label: '注释条', type: 'switch' },
  { key: 'labels', label: '标签', type: 'switch' },
  { key: 'borders', label: '单元格边界', type: 'switch', more: true },
  { key: 'demographics', label: '年龄 / 性别注释', type: 'switch', more: true },
  { key: 'dendrograms', label: '聚类树', type: 'switch', more: true, description: '显示已启用的样本 / MAG 聚类分支，不改变聚类或丰度' },
  { key: 'font', label: '标签字号', more: true, options: choices([['small', '小'], ['standard', '标准'], ['large', '大']]) },
];
const fmt = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 4 });
const SELECTION_FIELDS = ['heatmapMode', 'candidateKind', 'heatmapQuery', 'heatmapIds', 'minMean', 'sampleThreshold',
  'minSamplePercent', 'minCompleteness', 'maxContamination', 'maxQ', 'minEffect'];
function readSettings(key, initialMagId) {
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(key) || localStorage.getItem(key)); } catch { /* Optional storage. */ }
  const settings = { ...DEFAULT_HEATMAP_SETTINGS, ...(saved?.settings || {}) };
  if (initialMagId) {
    settings.heatmapMode = 'candidate'; settings.candidateKind = 'manual';
    settings.heatmapIds = [...new Set([...settings.heatmapIds.split(/[,;\s]+/).filter(Boolean), initialMagId])].join('\n');
  }
  return settings;
}
function downloadJson(value, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function MagHeatmapWorkspace({ params, overview, onSelect, initialMagId = '' }) {
  const storageKey = `admeta:mag:heatmap:${overview.provenance.dataFingerprint}`;
  const [applied, setApplied] = useState(() => readSettings(storageKey, initialMagId));
  const [draft, setDraft] = useState(applied);
  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ settings: applied })); } catch { /* Optional storage. */ }
  }, [storageKey, applied]);
  const [tablePage, setTablePage] = useState(1);
  const [format, setFormat] = useState('svg');
  const [size, setSize] = useState('standard');
  const [saveMessage, setSaveMessage] = useState('');
  const [zoomToolbarTarget, setZoomToolbarTarget] = useState(null);
  const preferences = useChartStylePreferences('mag-heatmap');
  const style = { ...HEATMAP_STYLE_DEFAULTS, ...preferences.values };
  if (!HEATMAP_PALETTE_OPTIONS.some(p => p.value === style.palette)) style.palette = HEATMAP_STYLE_DEFAULTS.palette;
  if (!ROW_Z_PALETTE_OPTIONS.some(p => p.value === style.divergingPalette)) style.divergingPalette = HEATMAP_STYLE_DEFAULTS.divergingPalette;
  const request = { ...params, ...applied };
  const query = useQuery({ queryKey: ['mag', 'heatmap', request], queryFn: ({ signal }) => getMagHeatmap(request, { signal }) });
  const data = query.data;
  const field = key => ({ value: draft[key], onChange: event => setDraft(current => ({ ...current, [key]: event.target.value })) });
  const apply = event => { event.preventDefault(); setApplied({ ...draft }); setTablePage(1); setSaveMessage(''); };
  const controls = <form className="mag-heatmap-settings" onSubmit={apply}>
    <div className="mag-heatmap-settings__main">
      <label>选行方式<StyledSelect aria-label="选行方式" {...field('heatmapMode')}><option value="abundance">丰度概览</option><option value="variance">变化模式</option><option value="candidate">候选对比</option></StyledSelect></label>
      <MagHeatmapCountControl value={draft.topN}
        sourceCount={data?.selectionAudit?.sourceCount ?? overview.provenance.magCount}
        matchedCount={data?.selectionAudit?.matchedCount} sampleCount={data?.samples.length ?? 0}
        pendingFilters={SELECTION_FIELDS.some(key => String(draft[key]) !== String(applied[key]))} loading={query.isFetching}
        onChange={topN => setDraft(current => ({ ...current, topN }))} />
      <label>颜色含义<StyledSelect aria-label="颜色含义" {...field('colorMode')}><option value="abundance">丰度 · log10(1 + %)</option><option value="rowZ">按 MAG 标准化 · Z-score</option></StyledSelect></label>
      <label>样本排列<StyledSelect aria-label="样本排列" {...field('sampleOrder')}><option value="group">AD/NC · 批次 · ID</option><option value="withinGroup">各组内部聚类</option><option value="cluster">全部样本聚类</option></StyledSelect></label>
      <label>MAG 排列<StyledSelect aria-label="MAG 排列" {...field('rowOrder')}><option value="rank">保留选行排序</option><option value="cluster">MAG 聚类</option></StyledSelect></label>
      <label>MAG ID / 分类搜索<MagSearchInput revision={params.revision} label="MAG ID / 分类搜索" value={draft.heatmapQuery}
        onChange={value => setDraft(current => ({ ...current, heatmapQuery: value }))} placeholder="输入 ID 或分类名称" /></label>
    </div>
    {draft.heatmapMode === 'candidate' && <div className="mag-heatmap-settings__candidate">
      <label>候选来源<StyledSelect aria-label="候选来源" {...field('candidateKind')}><option value="statistics">q 值 / 效应量条件</option><option value="manual">手动 MAG 清单</option></StyledSelect></label>
      {draft.candidateKind === 'manual' ? <div className="mag-heatmap-settings__ids"><MagCandidateInput revision={params.revision} value={draft.heatmapIds} onChange={value => setDraft(current => ({ ...current, heatmapIds: value }))} />
        <label>完整 MAG ID 清单<textarea aria-label="完整 MAG ID 清单" {...field('heatmapIds')} rows={3} placeholder="每行一个完整 MAG ID，也可用逗号分隔" /></label></div>
        : <><label>BH-FDR q ≤<input type="number" min="0" max="1" step="any" required {...field('maxQ')} /></label>
          <label>|秩效应量| ≥<input type="number" min="0" max="1" step="any" required {...field('minEffect')} /></label></>}
    </div>}
    <details><summary>高级 MAG 筛选</summary><div className="mag-heatmap-settings__advanced">
      <label>平均丰度至少（%）<input type="number" min="0" max="100" step="any" required {...field('minMean')} /></label>
      <label>样本丰度阈值（%）<input type="number" min="0" max="100" step="any" required {...field('sampleThreshold')} /></label>
      <label>超过阈值的样本至少（%）<input type="number" min="0" max="100" step="any" required {...field('minSamplePercent')} /></label>
      <label>完整度至少（%）<input type="number" min="0" max="100" step="any" placeholder="不限制" disabled={!overview.capabilities?.quality} {...field('minCompleteness')} /></label>
      <label>污染率至多（%）<input type="number" min="0" max="100" step="any" placeholder="不限制" disabled={!overview.capabilities?.quality} {...field('maxContamination')} /></label>
    </div><p className="mag-muted">丰度严格大于阈值才计入比例；该条件不定义生物学检出。质量条件只选择上游已筛选的代表 MAG 子集。</p></details>
    <div className="mag-heatmap-settings__footer"><div><button className="analysis-button analysis-button--primary" type="submit">应用设置</button>
      <button className="analysis-button" type="button" onClick={() => { setDraft({ ...DEFAULT_HEATMAP_SETTINGS }); setApplied({ ...DEFAULT_HEATMAP_SETTINGS }); setTablePage(1); }}>恢复默认</button></div>
      <button className="analysis-button" type="button" onClick={() => { try { localStorage.setItem(storageKey, JSON.stringify({ settings: applied })); setSaveMessage('已保存当前已应用配置'); } catch { setSaveMessage('浏览器暂不支持保存配置'); } }}>保存配置</button>
      <span role="status">{saveMessage || (JSON.stringify(draft) !== JSON.stringify(applied) ? '设置待应用，图表仍为上次结果' : '设置已应用')}</span></div>
  </form>;
  const empty = Boolean(data && (!data.samples.length || !data.magIds.length));
  const summary = data?.selectionAudit;
  const features = data?.features;
  // Changing a graphical preference must not reconcile thousands of unchanged
  // table cells during the transpose animation's first frame.
  const tableBody = useMemo(() => <tbody>{(features || []).slice((tablePage - 1) * 300, tablePage * 300).map(r => <tr key={r.magId}>
    <td><button className="analysis-text-button" onClick={() => onSelect(r.magId)}>{r.magId}</button></td><td>{r.taxonomyName || '未解析'}</td>
    {['meanPercent', 'adMeanPercent', 'ncMeanPercent', 'rankBiserial', 'qValue', 'completenessPercent', 'contaminationPercent'].map(k => <td key={k}>{fmt(r[k])}</td>)}
  </tr>)}</tbody>, [features, tablePage, onSelect]);
  const toolbar = <ChartStyleToolbar fields={STYLE_FIELDS.map(f => f.key === 'palette' && applied.colorMode === 'rowZ'
    ? { ...f, key: 'divergingPalette', options: ROW_Z_PALETTE_OPTIONS, description: '发散色系 · 左侧负值，中心零，右侧正值' } : f)} values={style}
    onChange={preferences.update} onReset={preferences.reset} label="热图样式" />;
  return <ChartFrame title="样本丰度热图" subtitle="根据研究目的选取 MAG，查看丰度大小或样本间变化；每个单元格对应一个样本中的一个 MAG。"
    layout="document" controls={controls} loading={query.isPending} loadingState={<LoadingState message="正在筛选 MAG 并生成热图…" />}
    error={query.error?.message} onRetry={query.refetch}>
    {data && <>
      <CollapsibleResultSection title="MAG 样本丰度热图" storageKey="admeta:mag:heatmap:fold" actions={toolbar}
        renderChartActions={actions => <MagChartExportMenu actions={actions} format={format} size={size} onFormatChange={setFormat} onSizeChange={setSize}
          pngLabel="PNG（2× 高清）" note="完整矩阵自适应所选画布，标签按空间疏排，树枝与字号保持可读；不含导航面板。SVG 可无损放大查看全部单元格。" />}>
        <div className="mag-heatmap-navigation" ref={setZoomToolbarTarget} />
        {data.warnings?.map(w => <p className="mag-inline-notice" key={w}>{w}</p>)}
        {!empty ? <Suspense fallback={<LoadingState />}><MagChart view="heatmap" data={data} format={format} size={size} onSelect={onSelect} heatmapStyle={style} toolbarTarget={zoomToolbarTarget} /></Suspense>
          : <p className="mag-heatmap-empty" role="status">{data.samples.length ? '没有符合当前条件的 MAG。请调整筛选条件；不会自动补入其他 MAG。' : '当前样本范围为空，请调整样本筛选。'}</p>}
        <div className="mag-heatmap-footer">
          <div className="mag-heatmap-summary"><strong>{summary?.sourceCount ?? data.provenance.magCount} 个代表 MAG → 匹配 {summary?.matchedCount ?? data.magIds.length} 个 → 展示集合 {data.magIds.length} 个</strong>
            <span>{data.samples.length} 个样本 · AD {data.provenance.groupCounts.AD} / NC {data.provenance.groupCounts.NC}</span></div>
          <div className="mag-heatmap-legend">{style.annotations && <><span><i style={{ background: '#ef4c3e' }} />AD</span><span><i style={{ background: '#2acb70' }} />NC</span><span>批次：1 棕 · 2 紫 · 3 绿 · 4 蓝 · 5 灰</span>{style.demographics && <span>年龄：浅至深由低到高 · 性别：F 紫 / M 青</span>}</>}<span>灰色单元格表示缺失，缺失与零值分开</span></div>
          <div className="mag-heatmap-clustering" aria-label="当前热图聚类方法">
            <strong>聚类与排列</strong>
            <span>样本：{data.methods?.sampleOrder || ({ group: 'AD/NC · 批次 · ID 排序，未聚类', withinGroup: 'AD、NC 各组内部聚类', cluster: '全部样本共同聚类' }[data.settings?.sampleOrder || 'group'])}；MAG：{data.settings?.rowOrder === 'cluster' ? '层次聚类' : '保留选行排序，未聚类'}。</span>
            <span>{data.settings?.sampleOrder === 'withinGroup' || data.settings?.sampleOrder === 'cluster' || data.settings?.rowOrder === 'cluster' ? '当前采用' : '启用聚类时采用'}凝聚型层次聚类 · 平均连接法（average linkage）· 欧氏距离（Euclidean）。</span>
            <span>聚类输入：{data.settings?.colorMode === 'rowZ' ? 'log10(1 + 丰度%) 后按每个 MAG 作 Z-score' : 'log10(1 + 丰度%)'}；仅使用当前展示集合与所选样本，零值保留。</span>
            {(data.settings?.sampleOrder === 'withinGroup' || data.settings?.sampleOrder === 'cluster' || data.settings?.rowOrder === 'cluster') && <span>{style.dendrograms === false ? '聚类树已隐藏，聚类顺序保留。' : '树枝合并高度表示聚类距离，合并位置越靠近单元格，模式越相似；每个轴独立缩放距离。'}{data.settings?.sampleOrder === 'withinGroup' ? ' AD、NC 分别成树，两组之间没有合并分支。' : ''}</span>}
            {(data.dendrograms?.mags?.merges?.length || data.dendrograms?.samples?.some(tree => tree.merges.length)) ? <span>距离尺度：{data.dendrograms.samples?.some(tree => tree.merges.length) ? `样本树 0–${fmt(treeMaximum(data.dendrograms.samples))}` : ''}{data.dendrograms.mags?.merges?.length ? `${data.dendrograms.samples?.some(tree => tree.merges.length) ? '；' : ''}MAG 树 0–${fmt(treeMaximum([data.dendrograms.mags]))}` : ''}。</span> : null}
          </div>
        </div>
        <details className="mag-heatmap-methods"><summary>筛选明细与绘图方法</summary>
          <p>横轴：{style.transposed ? 'MAG' : '样本'}；纵轴：{style.transposed ? '样本' : 'MAG'}。轴切换只改变显示方向，Z-score 始终按每个 MAG 在所选样本间的变化计算。</p>
          <p>{data.selection}</p><p>变异指标：log10(1 + 丰度%) 的总体标准差；不是差异显著性。</p>
          <p>{data.methods?.colorTransform}。{applied.sampleOrder !== 'group' || applied.rowOrder === 'cluster' ? data.methods?.clustering : '当前未聚类。'}</p>
          <p>检验族 {data.provenance.testedFeatureCount} 个 MAG；{data.methods?.testFamily}。组间检验未做协变量校正。</p>
          <ul>{summary?.exclusions.map(item => <li key={item.reason}>{item.reason}：排除 {item.count} 个</li>)}<li>仅因显示数量未展示：{summary?.omittedCount || 0} 个</li></ul>
        </details>
      </CollapsibleResultSection>
      <CollapsibleResultSection title="热图 MAG 数据列表" storageKey="admeta:mag:heatmap-table:fold" className="result-section--table"
        actions={<><a className="analysis-button" href={magDownloadUrl('heatmap', request)} download>展示集合原始矩阵</a>
          <a className="analysis-button" href={magDownloadUrl('matrix', params)} download>所选样本 × 全部 MAG</a>
          <button type="button" className="analysis-button" onClick={() => downloadJson({ provenance: data.provenance, settings: data.settings,
            methods: data.methods, selectionAudit: summary, magIds: data.magIds, sampleIds: data.samples.map(s => s.sampleId),
            warnings: data.warnings, projectionFingerprint: data.projectionFingerprint, style,
            colorPalette: heatmapColors(style, applied.colorMode === 'rowZ'),
            dendrograms: data.dendrograms, renderingVersion: 'mag-heatmap-v5', chartNavigation: { mode: 'continuous', initialView: 'fit', minimap: true, xAxis: style.transposed ? 'MAG' : 'sample', yAxis: style.transposed ? 'sample' : 'MAG' }, imageExport: { format, size, scope: 'entire displayed MAG collection' } }, `ADMeta-heatmap-${data.projectionFingerprint?.slice(0, 12) || 'config'}.json`)}>下载配置与溯源</button></>}>
        <DataTableViewport ariaLabel="热图 MAG 数据列表，可横向滚动" resizable pageKey={tablePage}
          description="列表对应热图展示集合；列表换页不改变热图视野、样本顺序或 q 值。"
          pagination={features?.length > 300 ? <PaginationControls page={tablePage} pageCount={Math.ceil(features.length / 300)} onPageChange={setTablePage} ariaLabel="热图 MAG 列表分页" /> : null}>
          <thead><tr>{['MAG ID（查看分布）', 'GTDB 分类', '平均丰度 %', 'AD 均值 %', 'NC 均值 %', '秩效应量', 'BH-FDR q', '完整度 %', '污染率 %'].map(s => <th key={s}>{s}</th>)}</tr></thead>
          {tableBody}
        </DataTableViewport>
      </CollapsibleResultSection>
    </>}
  </ChartFrame>;
}
