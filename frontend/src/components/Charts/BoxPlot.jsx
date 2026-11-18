import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SegmentedControl from '../ui/SegmentedControl';
import CartesianEChart from './CartesianEChart';
import ChartViewport from './ChartViewport';
import ChartEvidencePicker from '../evidence/ChartEvidencePicker';
import PaginationControls from '../data-display/PaginationControls';
import ClientDataTable from '../data-display/ClientDataTable';
import { boxplotRanges, boxplotTable, buildBoxplotView, facetHeight, facetLayout, formatAbundance, outsidePoints } from './boxplotView';
import './boxplot-view.css';
import { getBoxplotReviewData } from '../../api/analysisRuns';
import { buildReviewFiles } from './boxplotResearch';
import { downloadChartArchive } from './chartExport';
import BoxplotResearchPanel from './BoxplotResearchPanel';

const FALLBACK_SERIES = [
  { key: 'AD', label: 'AD', color: '#e74c3c' },
  { key: 'NC', label: 'NC', color: '#2ecc71' },
];

const DEFAULT_TRANSFORMS = [
  { key: 'raw', label: '输入丰度', formula: 'x' },
  { key: 'sqrt', label: 'sqrt(丰度)', formula: 'sqrt(max(x, 0))' },
  { key: 'log', label: 'log10(丰度 + 1)', formula: 'log10(max(x, 0) + 1)' },
];

function normalizeOutlierPoints(points, values) {
  if (Array.isArray(points)) {
    return points.map(point => ({
      sample: point?.sample ? String(point.sample) : null,
      value: Number(point?.value ?? 0),
    }));
  }
  return Array.isArray(values)
    ? values.map(value => ({ sample: null, value: Number(value) }))
    : [];
}

function summary(box, outliers, outlierPoints) {
  return {
    box: Array.isArray(box) ? box : null,
    outliers: Array.isArray(outliers) ? outliers : [],
    outlierPoints: normalizeOutlierPoints(outlierPoints, outliers),
  };
}

function normalizeBoxplot(data) {
  if (Array.isArray(data?.series) && data.items?.some(item => item.values)) {
    return {
      series: data.series,
      items: data.items,
      transforms: Array.isArray(data.valueTransforms) && data.valueTransforms.length
        ? data.valueTransforms
        : DEFAULT_TRANSFORMS,
      defaultTransform: data.defaultValueTransform || 'log',
      transformNote: data.valueTransformNote || '',
    };
  }
  const items = Array.isArray(data?.items) ? data.items.map(item => ({
    featureId: item.featureId || item.fullName,
    fullName: item.fullName,
    shortName: item.shortName,
    total: item.total,
    detectedInScope: item.detectedInScope !== false,
    groupStats: item.groupStats,
    values: {
      AD: {
        raw: summary(item.adBox, item.adOutliers, item.adOutlierPoints),
        sqrt: summary(item.adSqrtBox || item.adBox, item.adSqrtOutliers, item.adSqrtOutlierPoints),
        log: summary(item.adLogBox || item.adBox, item.adLogOutliers, item.adLogOutlierPoints),
      },
      NC: {
        raw: summary(item.ncBox, item.ncOutliers, item.ncOutlierPoints),
        sqrt: summary(item.ncSqrtBox || item.ncBox, item.ncSqrtOutliers, item.ncSqrtOutlierPoints),
        log: summary(item.ncLogBox || item.ncBox, item.ncLogOutliers, item.ncLogOutlierPoints),
      },
    },
  })) : [];
  return {
    series: FALLBACK_SERIES,
    items,
    transforms: data?.valueTransforms || DEFAULT_TRANSFORMS,
    defaultTransform: data?.defaultValueTransform || 'log',
    transformNote: data?.valueTransformNote || '数值变换仅用于箱线图展示，不改变物种选择。',
  };
}

function visibleItemCount(width, total) {
  if (!total) return 0;
  const estimated = Math.floor((Math.max(width, 720) - 110) / 112);
  return Math.min(total, Math.max(8, Math.min(15, estimated)));
}

function BoxPlot({ data, featureLabel = '物种', featureSelectionConfig = {}, groupCounts = {}, projection = null }) {
  const hostRef = useRef(null);
  const chartRef = useRef(null);
  const reviewCacheRef = useRef(null);
  const normalized = useMemo(() => normalizeBoxplot(data), [data]);
  const available = normalized.items;
  const [transformKey, setTransformKey] = useState(normalized.defaultTransform);
  const [width, setWidth] = useState(1100);
  const [view, setView] = useState('facets');
  const [axisMode, setAxisMode] = useState('independent');
  const [focus, setFocus] = useState(false);
  const [offset, setOffset] = useState(0);
  const [pageSizeChoice, setPageSizeChoice] = useState('auto');
  const [exportScope, setExportScope] = useState('page');
  const [exportFormat, setExportFormat] = useState('svg');
  const [pixelRatio, setPixelRatio] = useState(2);
  const [includeReview, setIncludeReview] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState(null);
  const warningThreshold = Number(featureSelectionConfig?.warningThreshold) || 30;
  const strongWarningThreshold = Number(featureSelectionConfig?.strongWarningThreshold) || 100;
  const itemIdentity = available.map(item => item.featureId || item.fullName).join('|');

  useEffect(() => {
    if (normalized.transforms.some(item => item.key === normalized.defaultTransform)) {
      setTransformKey(normalized.defaultTransform);
    }
  }, [itemIdentity, normalized.defaultTransform, normalized.transforms]);

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return undefined;
    const update = nextWidth => { if (nextWidth > 0) setWidth(Math.round(nextWidth)); };
    update(element.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      update(entry?.contentRect?.width || element.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [available.length]);

  const activeTransform = normalized.transforms.find(item => item.key === transformKey)
    || normalized.transforms[0]
    || DEFAULT_TRANSFORMS[0];

  useEffect(() => { setOffset(0); }, [itemIdentity]);

  const series = useMemo(() => normalized.series.map(group => ({ ...group,
    label: ['AD', 'NC'].includes(group.key) ? group.key : group.label,
  })), [normalized.series]);
  const responsive = facetLayout(width);
  const columns = available.length === 1 ? 1 : responsive.columns;
  const pageSize = pageSizeChoice === 'auto' ? responsive.pageSize : Number(pageSizeChoice);
  const pageCount = Math.max(1, Math.ceil(available.length / pageSize));
  const page = Math.min(pageCount, Math.floor(offset / pageSize) + 1);
  const overview = view === 'overview' && available.length > 1;
  const visibleCount = visibleItemCount(width, available.length);
  const pageItems = available.slice((page - 1) * pageSize, page * pageSize);
  const chartHeight = overview ? 550 : facetHeight(pageItems.length, columns, width);
  const unitNote = projection && (!projection.dataSemantics?.abundanceScale || projection.dataSemantics.abundanceScale === 'unknown') ? '输入单位未提供' : '';
  const model = useMemo(() => ({
    available, series, activeTransform, visibleCount, groupCounts,
    view, axisMode, focus, page, pageSize, columns, width, unitNote,
  }), [available, series, activeTransform, visibleCount, groupCounts, view, axisMode, focus, page, pageSize, columns, width, unitNote]);
  const option = useMemo(() => buildBoxplotView(model), [model]);
  const ranges = useMemo(() => boxplotRanges(available, series, activeTransform.key,
    overview ? 'shared' : axisMode, focus), [available, series, activeTransform.key, overview, axisMode, focus]);
  const outside = useMemo(() => available.flatMap((item, index) => outsidePoints(item, series, activeTransform.key, ranges[index])),
    [available, series, activeTransform.key, ranges]);
  const tableModel = useMemo(() => boxplotTable(available, series, activeTransform, ranges), [available, series, activeTransform, ranges]);
  const canReview = Boolean(projection?.projectionKey && projection.projectionRequest);
  const reviewFiles = useCallback(async (sourceOption, output) => {
    if (!canReview) throw new Error('当前结果未提供精确导出参数，请重新计算图表。');
    if (reviewCacheRef.current?.key !== projection.projectionKey) {
      const promise = getBoxplotReviewData(projection.runKey, projection.artifactKey,
        { ...projection.projectionRequest, projectionKey: projection.projectionKey });
      reviewCacheRef.current = { key: projection.projectionKey, promise };
      promise.catch(() => {
        if (reviewCacheRef.current?.promise === promise) reviewCacheRef.current = null;
      });
    }
    const review = await reviewCacheRef.current.promise;
    return buildReviewFiles(projection, model, review, sourceOption, output);
  }, [canReview, projection, model]);
  const downloadReview = async () => {
    setDownloadStatus({ busy: true, message: '正在读取当前图表对应的逐样本数据…' });
    try {
      const sourceOption = chartRef.current?.getEchartsInstance?.()?.getOption?.() || {};
      const files = await reviewFiles(sourceOption, { kind: 'data-only', exportScope: 'all-selected', format: 'csv+json' });
      downloadChartArchive(files, `${featureLabel}-boxplot-review-${projection.projectionKey.slice(0, 12)}`);
      setDownloadStatus({ busy: false, message: '全部已选对象的复核数据已下载' });
    } catch (error) {
      setDownloadStatus({ busy: false, error: true, message: error.message || '下载失败，请重试' });
    }
  };
  const exportConfig = useMemo(() => {
    const fileName = `${featureLabel}-boxplot-${activeTransform.key}-${overview ? 'overview' : axisMode}-${focus ? 'focus' : 'full'}`;
    const bundled = includeReview && canReview;
    const common = { format: exportFormat, pixelRatio,
      ...(bundled ? { attachments: ({ sourceOption, pages }) => reviewFiles(sourceOption,
        { kind: 'figure-and-data', exportScope: overview || exportScope === 'all' ? 'all-selected' : 'current-page',
          format: exportFormat, exportedPages: pages }) } : {}),
    };
    if (overview) return { ...common, fileName, title: bundled ? '导出总览与复核数据 ZIP' : `导出全部物种总览 ${exportFormat.toUpperCase()}`, fullDataZoom: true,
      widthPerCategory: 112, horizontalPadding: 180, maxWidth: 14000,
      pageMetadata: { sourcePage: 1, pageSize: available.length, view: 'overview', featureIds: available.map(item => String(item.featureId)) },
      buildOption: ({ size }) => buildBoxplotView({ ...model, width: size.width, visibleCount: available.length }),
    };
    const settings = (exportPage, exportPageSize, columns) => {
      const count = Math.min(exportPageSize, available.length - (exportPage - 1) * exportPageSize);
      const exportWidth = columns === 2 ? 1100 : 640;
      const height = facetHeight(count, columns, exportWidth);
      return { fileName: `${fileName}-page-${exportPage}`, minWidth: exportWidth, maxWidth: exportWidth,
        minHeight: height, maxHeight: height,
        pageMetadata: { sourcePage: exportPage, pageSize: exportPageSize, columns, view: 'facets',
          featureIds: available.slice((exportPage - 1) * exportPageSize, exportPage * exportPageSize).map(item => String(item.featureId)) },
        buildOption: ({ size }) => buildBoxplotView({ ...model, page: exportPage, pageSize: exportPageSize, columns, width: size.width }),
      };
    };
    return exportScope === 'all' ? {
      ...common, fileName: `${fileName}-all-facets`, title: bundled ? '导出全部分面与复核数据 ZIP' : '导出全部分面 ZIP',
      pages: Array.from({ length: Math.ceil(available.length / 6) }, (_, index) => settings(index + 1, 6, 2)),
    } : { ...common, ...settings(page, pageSize, columns), title: bundled ? '导出当前页与复核数据 ZIP' : `导出当前页 ${exportFormat.toUpperCase()}` };
  }, [featureLabel, activeTransform.key, overview, axisMode, focus, model, available, exportScope, page, pageSize, columns,
    exportFormat, pixelRatio, includeReview, canReview, reviewFiles]);

  const densityMessage = available.length > strongWarningThreshold
    ? `共 ${available.length} 个${featureLabel}，分面仅绘制当前页；导出可选择全部分面。`
    : available.length > warningThreshold
      ? `共 ${available.length} 个${featureLabel}，可分页比较或切换总览。`
      : `共 ${available.length} 个${featureLabel}。`;
  const undetectedCount = available.filter(item => item.detectedInScope === false).length;

  return (
    <div ref={hostRef} className="chart-plain boxplot-chart">
      <div className="boxplot-chart__toolbar">
        <div className="chart-control-strip" aria-label="箱线图数值变换">
          <span>{densityMessage}</span>
          {undetectedCount ? (
            <span className="boxplot-chart__scope-note">其中 {undetectedCount} 个在当前范围未检出</span>
          ) : null}
          <SegmentedControl className="boxplot-chart__transforms" role="group" aria-label="数值变换">
            {normalized.transforms.map(transform => (
              <button
                type="button"
                key={transform.key}
                className={`chart-chip ${activeTransform.key === transform.key ? 'chart-chip--active' : ''}`}
                aria-pressed={activeTransform.key === transform.key}
                onClick={() => setTransformKey(transform.key)}
                title={transform.formula || transform.label}
              >
                {transform.label}
              </button>
            ))}
          </SegmentedControl>
          {normalized.transformNote ? (
            <span className="boxplot-chart__transform-note">{normalized.transformNote}</span>
          ) : null}
          <span className="boxplot-chart__transform-note">每种尺度均使用变换后的样本值计算分位数和离群点；切换尺度时离群点归属可能变化。n 为有效样本数；有效数与组内总数不同时显示“有效/组内”。</span>
        </div>
      </div>
      <div className="boxplot-view-controls">
        {available.length > 1 ? <SegmentedControl role="group" aria-label="展示方式">
          {[['facets', '物种分面'], ['overview', '共享纵轴总览']].map(([key, label]) => <button type="button" key={key}
            className={`chart-chip ${view === key ? 'chart-chip--active' : ''}`} aria-pressed={view === key}
            onClick={() => setView(key)}>{label}</button>)}
        </SegmentedControl> : <span>单物种：组间共用纵轴</span>}
        {!overview && available.length > 1 ? <label>分面纵轴 <select aria-label="分面纵轴" value={axisMode} onChange={event => setAxisMode(event.target.value)}>
          <option value="independent">各物种独立</option><option value="shared">所有物种统一</option>
        </select></label> : null}
        <label>视野 <select aria-label="箱线图视野" value={focus ? 'focus' : 'full'} onChange={event => setFocus(event.target.value === 'focus')}>
          <option value="full">完整范围</option><option value="focus">主体分布放大</option>
        </select></label>
        {!overview && available.length > 1 ? <label>每页 <select aria-label="每页物种数" value={pageSizeChoice}
          onChange={event => setPageSizeChoice(event.target.value)}>
          <option value="auto">自动（{responsive.pageSize} 个）</option>{[2, 4, 6].map(count => <option key={count} value={count}>{count} 个</option>)}
        </select></label> : null}
        {!overview ? <label>导出内容 <select aria-label="箱线图导出内容" value={exportScope} onChange={event => setExportScope(event.target.value)}>
          <option value="page">当前页图形</option><option value="all">全部分面 ZIP（每页 {exportFormat.toUpperCase()}）</option>
        </select></label> : <span>导出包含全部 {available.length} 个{featureLabel}</span>}
        <label>图像格式 <select aria-label="箱线图图像格式" value={exportFormat} onChange={event => setExportFormat(event.target.value)}>
          <option value="svg">SVG（矢量）</option><option value="png">PNG（位图）</option>
        </select></label>
        {exportFormat === 'png' ? <label>PNG 清晰度 <select aria-label="箱线图 PNG 清晰度" value={pixelRatio} onChange={event => setPixelRatio(Number(event.target.value))}>
          {[1, 2, 3].map(value => <option key={value} value={value}>{value}×</option>)}
        </select></label> : null}
        <label><input type="checkbox" checked={includeReview} disabled={!canReview} onChange={event => setIncludeReview(event.target.checked)} />附带复核数据 ZIP</label>
      </div>
      <p className="boxplot-view-note">
        {overview ? `总览使用共享纵轴；可拖动底部滑块浏览。` : available.length === 1 ? `同一物种的 ${series.map(group => group.label).join(' / ')} 并排展示，使用共同纵轴。`
          : axisMode === 'independent' ? '各物种使用独立纵轴，仅在同一分面内比较 AD / NC；请勿用跨物种箱体高度比较丰度。'
            : '所有物种及所有分页使用相同纵轴范围，可比较跨物种丰度。'}
        {' '}箱须为 1.5×IQR 范围内的最远观测值；箱体退化为零时仍显示真实统计。
      </p>
      {focus ? <div className="boxplot-focus-note" role="status">
        <p>当前为主体分布放大：纵轴上限参考当前尺度的各组上须及箱体上界，箱线统计及离群点数据未改变。全部已选{featureLabel}中，视野外共 {outside.length} 个离群样本点。
          {ranges.some(range => range.focusFallback) ? ' 部分物种箱须均为零，已保留完整范围。' : ''}</p>
        <button type="button" className="chart-chip" onClick={() => setFocus(false)}>恢复完整范围</button>
        {outside.length ? <details><summary>查看视野外样本（{outside.length} 个点，全部已选{featureLabel}）</summary>
          <ClientDataTable rows={outside} ariaLabel="视野外离群样本，可滚动" renderRow={(point, index) => <tr key={index}>
            <td>{point.feature}</td><td>{point.group}</td><td>{point.sample}</td><td>{formatAbundance(point.value)}</td>
            <td>{point.direction}</td><td>{formatAbundance(point.min)}–{formatAbundance(point.max)}</td>
          </tr>}><thead><tr>{['完整名称', '组别', '样本编号', activeTransform.label, '方向', '视野范围'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead></ClientDataTable>
        </details> : null}
      </div> : null}
      {!overview && available.length > 1 ? <div className="boxplot-pagination">
        <span aria-live="polite">本页 {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, available.length)} / {available.length} 个{featureLabel}</span>
        <PaginationControls page={page} pageCount={pageCount} onPageChange={next => setOffset((next - 1) * pageSize)} ariaLabel="物种分面分页" />
      </div> : null}
      <ChartEvidencePicker items={available} />
      {available.length && normalized.series.length ? (
        <ChartViewport variant="data" minHeight={chartHeight} preferredHeight={chartHeight} maxHeight={chartHeight}>
          <CartesianEChart
            ref={chartRef}
            option={option}
            ariaLabel={`${featureLabel}箱线图，${overview ? '共享纵轴总览' : `第 ${page} 页分面`}，${activeTransform.label}，${focus ? '主体分布放大，有视野外数据时请查看明细' : '完整范围'}`}
            boxStyleConfig={{ key: 'species-boxplot', pointLabel: '离群点', pointDescription: '显示或隐藏箱须范围外的离群样本点；不改变箱线统计', formatValue: formatAbundance }}
            dataTableModel={tableModel}
            exportConfig={exportConfig}
            frameActions
            notMerge
            opts={{ renderer: 'canvas' }}
            style={{ width: '100%', height: '100%' }}
          />
        </ChartViewport>
      ) : (
        <div className="placeholder"><p>当前选择没有可展示的{featureLabel}</p></div>
      )}
      {available.length ? <BoxplotResearchPanel model={model} projection={projection} onDownload={downloadReview} downloadStatus={downloadStatus} /> : null}
    </div>
  );
}

export default BoxPlot;
