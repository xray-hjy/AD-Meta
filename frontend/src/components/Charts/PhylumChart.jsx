import { useMemo, useState } from 'react';
import PhylumGroupedChart from './PhylumGroupedChart';
import HeatmapEChart from './HeatmapEChart';
import './CartesianEChart';
import BoxPlot from './BoxPlot';
import ChartViewport from './ChartViewport';
import ChartSupplement from './ChartSupplement';
import DataTableViewport from '../data-display/DataTableViewport';
import ResultDisclosure from '../data-display/ResultDisclosure';
import PaginationControls from '../data-display/PaginationControls';
import { buildPhylumOption, PHYLUM_VIEWS, precise, shownSamples } from './phylumViews';
import './phylum-workspace.css';

const EMPTY = [];

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function downloadCompositionCsv(rows, fileName) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const csv = '\ufeff' + [keys.map(csvCell).join(','), ...rows.map(row => keys.map(key => typeof row[key] === 'number' ? String(row[key]) : csvCell(row[key])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
function Schematic({ type }) {
  return <svg viewBox="0 0 160 70" aria-hidden="true">
    <path d="M12 8V58H150" fill="none" stroke="#b6c2d2" />
    {type === 'heatmap' ? Array.from({ length: 30 }, (_, i) => <rect key={i} x={20 + i % 10 * 12} y={12 + Math.floor(i / 10) * 14} width="10" height="12" fill={i % 3 === 0 ? '#2563eb' : '#bfdbfe'} />)
      : type === 'difference' ? Array.from({ length: 5 }, (_, i) => <circle key={i} cx={35 + i * 20} cy={18 + i % 3 * 13} r="4" fill="#0072B2" />)
        : type === 'box' ? [30, 85].map((x, i) => <g key={x}><path d={`M${x + 12} 10V54`} stroke="#64748b" /><rect x={x} y={22 + i * 5} width="25" height="20" fill={i ? '#60a5fa' : '#fb923c'} /><path d={`M${x} 32H${x + 25}`} stroke="#475569" /></g>)
          : Array.from({ length: type === 'samples' ? 10 : 5 }, (_, i) => <g key={i}><rect x={20 + i * (type === 'samples' ? 12 : 25)} y={18 + i % 3 * 4} width={type === 'samples' ? 9 : 16} height={40 - i % 3 * 4} fill="#60a5fa" /><rect x={20 + i * (type === 'samples' ? 12 : 25)} y="40" width={type === 'samples' ? 9 : 16} height="18" fill="#fb923c" /></g>)}
    <text x="120" y="68" fontSize="9" fill="#64748b">示意</text>
  </svg>;
}
export default function PhylumChart({ data, featureKind = 'taxonomy', initialView = 'overview', projection }) {
  const [view, setView] = useState(initialView);
  const [accessible, setAccessible] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [fontSize, setFontSize] = useState(11);
  const [sort, setSort] = useState('sample');
  const [heatTransform, setHeatTransform] = useState('raw');
  const [chosen, setChosen] = useState('');
  const [focus, setFocus] = useState(false);
  const [focusPercent, setFocusPercent] = useState(1);
  const [format, setFormat] = useState('svg');
  const [tableOpen, setTableOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const legacy = Array.isArray(data);
  const series = data?.series || EMPTY;
  const items = data?.items || EMPTY;
  const samples = data?.samples || EMPTY;
  const relative = data?.semantics?.abundanceScale === 'relative_abundance';
  const selectedPhylum = items.some(item => item.feature === chosen) ? chosen : items[0]?.feature || '';
  const dual = series.some(item => item.key === 'AD') && series.some(item => item.key === 'NC');
  const hasSamples = samples.length > 0;
  const option = useMemo(() => legacy ? null : buildPhylumOption(data || {}, view,
    { accessible, showLegend, showLabels, fontSize, heatTransform, sort, selectedPhylum }),
  [data, legacy, view, accessible, showLegend, showLabels, fontSize, heatTransform, sort, selectedPhylum]);
  const tableRows = useMemo(() => {
    if (['samples', 'heatmap'].includes(view)) return shownSamples(data || {}, sort, selectedPhylum).flatMap(sample => items.map(item => ({ sample: sample.sample, group: sample.group, feature: item.feature, value: sample.values[item.feature] })));
    if (view === 'box') return samples.map(sample => ({ sample: sample.sample, group: sample.group, feature: selectedPhylum, value: sample.values[selectedPhylum] }));
    return items.map(item => ({ feature: item.feature, ...Object.fromEntries(series.map(group => [group.key, item.values[group.key]])), ...(dual ? { difference: item.values.AD - item.values.NC } : {}) }));
  }, [data, view, sort, selectedPhylum, items, samples, series, dual]);
  const filtered = tableRows.filter(row => Object.values(row).some(value => String(value).toLowerCase().includes(query.toLowerCase())));
  const columns = Object.keys(tableRows[0] || {});
  const pageCount = Math.max(1, Math.ceil(filtered.length / 50));
  const visiblePage = Math.min(page, pageCount);
  const unit = relative ? '%' : '源丰度（单位未声明）';
  const display = value => typeof value === 'number' ? `${precise(value * (relative ? 100 : 1))}${relative ? '%' : ''}` : value;
  const availability = key => ['samples', 'heatmap', 'box'].includes(key) && !hasSamples ? '缺少逐样本数据' : key === 'difference' && !dual ? '当前范围需同时包含 AD 和 NC' : null;
  const activeUnavailable = availability(view);
  const overFocus = focus ? items.reduce((n, item) => n + Object.values(item.values).filter(value => value > focusPercent / 100).length, 0) : 0;
  const changeView = next => { setView(next); setPage(1); setQuery(''); setTableOpen(false); };
  const exportFull = level => {
    const provenance = { datasetRevision: projection?.datasetRevision || '', projectionKey: projection?.projectionKey || '',
      abundanceScale: data.semantics?.abundanceScale, aggregation: 'species_to_phylum_no_closure', scope: JSON.stringify(projection?.scope || {}) };
    const rows = level === 'sample' ? (data.sourceSamples || []).flatMap(sample => Object.entries(sample.values).map(([phylum, value]) => ({ ...provenance, level: 'sample', sample: sample.sample, group: sample.group, phylum, value })))
      : (data.sourceItems || items).flatMap(item => series.map(group => ({ ...provenance, level: 'group_mean_in_selected_scope', group: group.group || group.key, seriesLabel: group.label, phylum: item.feature, value: item.values[group.key] })));
    downloadCompositionCsv(rows, `phylum-complete-${level}.csv`);
  };
  if (legacy) return <PhylumGroupedChart data={data} featureKind={featureKind} />;
  return <div className="phylum-workspace">
    <nav className="phylum-view-switch" aria-label="门级图形切换">
      <button type="button" className={view === 'overview' ? 'is-active' : ''} aria-pressed={view === 'overview'} onClick={() => changeView('overview')}>总览</button>
      {PHYLUM_VIEWS.map(item => <button type="button" key={item.key} className={view === item.key ? 'is-active' : ''} aria-pressed={view === item.key} onClick={() => changeView(item.key)}>{item.name}</button>)}
    </nav>
    <p className="phylum-workspace__semantics">由种级输入汇总至门；{data.semantics?.sampleCount ?? samples.length} 个样本，{Object.entries(data.semantics?.groupCounts || {}).map(([group, count]) => `${group} ${count}`).join(' · ')}。单位：{unit}。先对每个样本求门内物种之和，再按组取算术平均（含零值），不重新归一化。样本门级合计 {display(data.semantics?.sampleTotalMinimum ?? 0)}–{display(data.semantics?.sampleTotalMaximum ?? 0)}；缺少门注释的物种归入 Unclassified，不补造未检测丰度。</p>
    <p className="phylum-workspace__semantics">{data.merge?.members?.length ? `已主动合并 ${data.merge.members.length} 个门：${data.merge.members.join('、')}；规则为当前样本平均相对丰度严格小于 ${precise(data.merge.minimumMeanRelativeAbundance * 100)}%。` : '当前未发生合并，显示全部可用门。'}原始数据和完整下载始终保留未合并的门。</p>
    {view === 'overview' ? <div className="phylum-overview" role="region" aria-label="可视化总览">
      {PHYLUM_VIEWS.map(item => <button key={item.key} type="button" className="phylum-overview__card" onClick={() => changeView(item.key)}>
        <Schematic type={item.key} /><strong>{item.name}</strong><span>{item.use}</span><small>{availability(item.key) || '可用 · 点击进入'} · 缩略图仅为示意</small>
      </button>)}
    </div> : <>
      {focus && view !== 'grouped' ? <p className="phylum-workspace__semantics">低丰度聚焦仅适用于分组条形图；当前图使用完整范围，返回条形图时保留聚焦设置。</p> : null}
      {activeUnavailable ? <p role="status">{activeUnavailable}；当前样本范围和筛选条件保持不变。可切换其他图形或调整样本范围。</p> : <>
        {view === 'grouped' ? <>
          {relative ? <div className="phylum-view-controls"><label><input type="checkbox" checked={focus} onChange={event => setFocus(event.target.checked)} />低丰度聚焦</label>
            {focus ? <><label>横轴上限（%）<input type="number" aria-label="横轴上限（%）" min="0.000001" max="100" step="0.1" value={focusPercent} onChange={event => setFocusPercent(Math.max(0.000001, Math.min(100, Number(event.target.value) || 1)))} /></label><span role="status">当前范围 0–{focusPercent}%；{overFocus} 个组均值超出范围。原始数值保留，可取消聚焦恢复全图；图像导出沿用该范围。</span></> : null}
          </div> : null}
          <PhylumGroupedChart data={data} focusMax={focus && relative ? focusPercent / 100 : null} showDataTable={false} />
        </> : view === 'box' ? <>
          <label>选择门<select aria-label="选择门" value={selectedPhylum} onChange={event => setChosen(event.target.value)}>{items.map(item => <option key={item.feature}>{item.feature}</option>)}</select></label>
          <BoxPlot data={{ ...data.distributions, items: (data.distributions?.items || []).filter(item => item.featureId === selectedPhylum) }} featureLabel="门" groupCounts={data.semantics?.groupCounts} />
        </> : <>
          <div className="phylum-view-controls">
            <label><input type="checkbox" checked={accessible} onChange={event => setAccessible(event.target.checked)} />色觉友好配色</label>
            <label><input type="checkbox" checked={showLegend} onChange={event => setShowLegend(event.target.checked)} />图例</label>
            <label><input type="checkbox" checked={showLabels} onChange={event => setShowLabels(event.target.checked)} />数值标签</label>
            <label>字号<input aria-label="图表字号" type="number" min="9" max="18" value={fontSize} onChange={event => setFontSize(Math.min(18, Math.max(9, Number(event.target.value) || 11)))} /></label>
            {['samples', 'heatmap'].includes(view) ? <><label>样本排序<select aria-label="样本排序" value={sort} onChange={event => setSort(event.target.value)}><option value="sample">组别、样本编号</option><option value="abundance">组别、指定门丰度降序</option></select></label><label>排序门<select aria-label="排序门" value={selectedPhylum} onChange={event => setChosen(event.target.value)}>{items.map(item => <option key={item.feature}>{item.feature}</option>)}</select></label><span>分组标记位于样本标签；使用底部滑块浏览全部样本。</span></> : null}
            {view === 'heatmap' ? <label>颜色尺度<select aria-label="颜色尺度" value={heatTransform} onChange={event => setHeatTransform(event.target.value)}><option value="raw">原始丰度</option><option value="log">log10(1 + 显示丰度)</option></select></label> : null}
            <label>导出格式<select aria-label="导出格式" value={format} onChange={event => setFormat(event.target.value)}><option value="svg">SVG</option><option value="png">PNG</option></select></label>
          </div>
          <p className="phylum-workspace__semantics">{view === 'difference' ? '均值差仅描述方向和幅度，不代表统计显著性。' : view === 'heatmap' ? `颜色表示${heatTransform === 'log' ? 'log10(1 + 显示丰度)' : '原始丰度'}，未进行行标准化；悬停始终显示原始数值。` : '柱高保留实际丰度合计，不强制补齐至 100%。'} 窄屏可左右滚动画布。图像导出包含全部当前门和全部样本，保留当前配色、图例选择及变换。</p>
          <ChartViewport minHeight={520} preferredHeight={600} maxHeight={800} minWidth={view === 'heatmap' ? 720 : 640} ariaLabel="门级图形画布，窄屏可左右滚动">
            <HeatmapEChart option={option} style={{ height: '100%', width: '100%' }} notMerge showDataTable={false} frameActions
              exportConfig={{ fileName: `phylum-${view}-complete`, title: '导出完整门级图像', format, fullDataZoom: true,
                minWidth: ['samples', 'heatmap'].includes(view) ? Math.max(1200, samples.length * 18 + 240) : 1200,
                maxWidth: 12000, minHeight: view === 'heatmap' || view === 'difference' ? Math.max(650, items.length * 26 + 220) : 650,
                prepareOption: (current, { size }) => ({ ...current,
                  legend: (Array.isArray(current.legend) ? current.legend : [current.legend]).filter(Boolean).map(legend => ({ ...legend, type: 'plain', top: 52, width: size.width - 40 })),
                  grid: (Array.isArray(current.grid) ? current.grid : [current.grid]).map(grid => ({ ...grid,
                    top: showLegend && ['samples', 'stacked'].includes(view) ? 100 + Math.ceil(items.length / Math.max(1, Math.floor(size.width / 180))) * 24 : grid.top })),
                }) }} />
          </ChartViewport>
        </>}
      </>}
      <ChartSupplement><ResultDisclosure title="当前图表数据（只读）" summary={`${PHYLUM_VIEWS.find(item => item.key === view)?.name} · ${activeUnavailable ? '当前图不可用' : `${filtered.length} 条记录 · ${unit}`}`} open={tableOpen} onToggle={event => setTableOpen(event.currentTarget.open)}>
        {tableOpen && !activeUnavailable ? <>
          <div className="phylum-view-controls"><label>图表数据搜索<input aria-label="图表数据搜索" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>
            <button type="button" onClick={() => downloadCompositionCsv(tableRows.map(row => ({ unit: relative ? 'percent' : 'source_unknown',
              ...Object.fromEntries(Object.entries(row).map(([key, value]) => [key === 'difference' && relative ? 'difference_pp' : key, typeof value === 'number' && relative ? value * 100 : value])) })), `phylum-${view}-chart-data.csv`)}>导出当前图表全部数据 CSV</button>
          </div>
          <DataTableViewport ariaLabel="门级图表只读数据" pageKey={visiblePage}>
            <thead><tr>{columns.map(key => <th key={key}>{({ sample: '样本', group: '分组', feature: '门', value: `丰度（${unit}）`, difference: relative ? 'AD − NC（pp）' : 'AD − NC（源丰度差）' })[key] || key}</th>)}</tr></thead>
            <tbody>{filtered.slice((visiblePage - 1) * 50, visiblePage * 50).map((row, index) => <tr key={index}>{columns.map(key => <td key={key}>{key === 'difference' ? `${precise(row[key] * (relative ? 100 : 1))}${relative ? ' pp' : ''}` : display(row[key])}</td>)}</tr>)}</tbody>
          </DataTableViewport>
          <PaginationControls page={visiblePage} pageCount={pageCount} onPageChange={setPage} ariaLabel="门级图表数据分页" />
        </> : activeUnavailable ? <p>{activeUnavailable}，未生成当前图表数据。</p> : null}
      </ResultDisclosure></ChartSupplement>
    </>}
    {view !== 'overview' ? <ChartSupplement><ResultDisclosure title="完整门级结果下载（独立于图形与合并）" summary="当前样本范围 · 原始未合并门 · CSV">
      <p>下载包含当前范围内所有样本和全部门，不受图形、视野、颜色变换和合并设置影响；数值保留输入尺度。全数据集种级结果查询位于下方“完整结果查询与下载”。</p>
      <button type="button" onClick={() => exportFull('sample')}>下载完整样本级门丰度 CSV</button>
      <button type="button" onClick={() => exportFull('group')}>下载完整组汇总门丰度 CSV</button>
    </ResultDisclosure></ChartSupplement> : null}
  </div>;
}
