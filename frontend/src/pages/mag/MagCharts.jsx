import { useMemo } from 'react';
import CartesianEChart from '../../components/Charts/CartesianEChart';
import MagZoomableHeatmap from './MagZoomableHeatmap';
import ChartViewport from '../../components/Charts/ChartViewport';
import { GROUP_COLORS } from '../../components/Charts/groupPalette';
import { buildGroupedBarOption } from '../../components/Charts/GroupedBarChart';
import ZoomableGroupedBarChart from '../../components/Charts/ZoomableGroupedBarChart';
import BoxScatterChart, { buildBoxScatterOption } from '../../components/Charts/BoxScatterChart';
import { buildMagHeatmapOption } from './magHeatmapOption';
import MagResearchChart from './MagResearchChart';
import { mappingResearchOption } from './magResearchOptions';

export const number = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 4 });
const shortMag = id => id.replace(/__(CRR\d+)_cleanbin_/, ' · ');
const tooltip = { trigger: 'item', renderMode: 'richText', confine: true };
// Live rendering is vector-based regardless of the chosen download format.
const chartInitOptions = { renderer: 'svg' };
const barStyles = {
  features: { key: 'mag-abundance', suffix: '%' },
  taxonomy: { key: 'mag-taxonomy', integerValues: true },
};
const distributionStyle = { key: 'mag-boxplot', pointLabel: '样本点', allowLegend: false,
  pointDescription: '显示或隐藏所选范围内的全部样本点；零丰度样本仍参与统计' };

function comparisonModel(items) {
  return {
    title: 'MAG 丰度条形图', featureLabel: 'MAG',
    items: items.map(row => ({ id: row.magId, label: row.taxonomyName ? `${row.taxonomyName} · ${shortMag(row.magId)}` : shortMag(row.magId),
      fullName: row.taxonomyName ? `${row.taxonomyName} · ${row.magId}` : row.magId, values: { AD: row.adMeanPercent, NC: row.ncMeanPercent } })),
    series: ['AD', 'NC'].map(group => ({ key: group, label: `${group} 均值`, color: GROUP_COLORS[group] })),
    barWidth: 11, rowGap: 10, showValues: true, tooltipAppearance: 'light', pointer: 'line',
    axisName: '平均相对丰度（%）', formatValue: value => value == null ? '未提供' : `${number(value)}%`,
    formatAxis: value => String(value), abbreviateLabel: label => label,
    grid: { left: 305, right: 70 },
  };
}

export function comparisonOption(items) {
  return buildGroupedBarOption(comparisonModel(items));
}

function distributionModel(data) {
  return {
    layout: 'groups', scatterMode: 'all', boxWidth: [35, 90], tooltipAppearance: 'light',
    activeTransform: { key: 'raw', label: '相对丰度（%）' }, groupCounts: data.provenance.groupCounts,
    formatValue: value => value == null || value === '-' ? '未提供' : `${number(value)}%`,
    series: ['AD', 'NC'].map(group => ({ key: group, label: group, color: GROUP_COLORS[group] })),
    available: [{ featureId: data.feature?.magId || '', shortName: data.feature?.magId || 'MAG',
      values: Object.fromEntries(['AD', 'NC'].map(group => [group, { raw: {
        box: data.boxes.find(box => box.group === group)?.values,
        samplePoints: data.samples.filter(sample => sample.disease === group).map(sample => ({ sample: sample.sampleId, value: sample.abundancePercent })),
      } }])) }],
  };
}

export function distributionOption(data) {
  return buildBoxScatterOption(distributionModel(data));
}

export function heatmapOption(data, preferences, window) {
  return buildMagHeatmapOption(data, preferences, window);
}

export function mappingOption(data) {
  return {
    animation: false,
    tooltip: { ...tooltip, formatter: p => `${p.name}\n映射 ${number(p.value[0])}%\n超过丰度阈值 ${p.value[1]} 个 MAG` },
    legend: { top: 0 }, grid: { left: 70, right: 30, top: 46, bottom: 48 },
    xAxis: { type: 'value', min: 0, max: 100, name: '映射到代表 MAG 的比例（%）', nameLocation: 'middle', nameGap: 30 },
    yAxis: { type: 'value', name: '超过丰度阈值的 MAG 数', min: 0, max: data.provenance.magCount },
    series: ['AD', 'NC'].map(group => ({ name: group, type: 'scatter', symbolSize: 8,
      itemStyle: { color: GROUP_COLORS[group] },
      data: data.items.filter(s => s.disease === group).map(s => ({
        name: `${s.sampleId} · ${group} · Batch ${s.batch}`, value: [s.mappedPercent, s.aboveThresholdMagCount],
      })) })),
  };
}

export function taxonomyOption(data) {
  return {
    animation: false,
    aria: { enabled: true, decal: { show: false } },
    tooltip: { ...tooltip, formatter: p => `${p.name}\n${p.value.toLocaleString('en-US')} 个 MAG\n${number(p.data.percent)}%` },
    grid: { left: 210, right: 45, top: 24, bottom: 54 },
    xAxis: { type: 'value', min: 0, name: 'MAG 数量', nameLocation: 'middle', nameGap: 32, minInterval: 1 },
    yAxis: { type: 'category', inverse: true, data: data.items.map(item => item.label), axisLabel: { width: 190, overflow: 'truncate' } },
    series: [{
      name: 'MAG 数量',
      type: 'bar',
      barMaxWidth: 24,
      itemStyle: { color: '#357e96', borderColor: '#164965', borderWidth: 0.8 },
      label: { show: true, position: 'right', color: '#334155', formatter: p => p.value.toLocaleString('en-US') },
      data: data.items.map(item => ({ value: item.count, name: item.label, percent: item.percent })),
    }],
  };
}

export function qualityOption(data) {
  const point = item => ({
    name: item.magId,
    value: [item.completenessPercent, item.contaminationPercent],
    details: item,
  });
  const reference = data.items.filter(item => item.inReferenceBand).map(point);
  const remaining = data.items.filter(item => !item.inReferenceBand).map(point);
  const tooltipFormatter = p => {
    const item = p.data.details;
    return `${item.magId}\n完整度 ${number(item.completenessPercent)}%\n污染率 ${number(item.contaminationPercent)}%\nN50 ${item.contigN50Bp.toLocaleString('en-US')} bp\nContigs ${item.totalContigs.toLocaleString('en-US')}\n基因组 ${item.genomeSizeBp.toLocaleString('en-US')} bp`;
  };
  return {
    animation: false,
    aria: { enabled: true, decal: { show: true } },
    tooltip: { ...tooltip, formatter: tooltipFormatter },
    legend: { top: 0 },
    grid: { left: 70, right: 35, top: 58, bottom: 58 },
    xAxis: { type: 'value', min: 0, max: Math.max(100, ...data.items.map(item => item.completenessPercent)), name: '完整度（%）', nameLocation: 'middle', nameGap: 34 },
    yAxis: { type: 'value', min: 0, max: Math.max(10, ...data.items.map(item => item.contaminationPercent)), name: '污染率（%）' },
    series: [
      {
        name: '完整度≥90% 且污染率≤5%',
        type: 'scatter',
        symbol: 'circle',
        symbolSize: 7,
        itemStyle: { color: '#357e96', opacity: 0.7, borderColor: '#164965', borderWidth: 0.6 },
        data: reference,
        markArea: { silent: true, itemStyle: { color: '#368a8910' }, data: [[{ xAxis: 90, yAxis: 0 }, { xAxis: 100, yAxis: 5 }]] },
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: '#475569', type: 'dashed', width: 1 },
          label: { color: '#475569', fontSize: 10 },
          data: [
            { xAxis: 90, label: { formatter: '完整度 90%' } },
            { yAxis: 5, label: { formatter: '污染率 5%' } },
          ],
        },
      },
      {
        name: '其余已筛选代表 MAG',
        type: 'scatter',
        symbol: 'emptyCircle',
        symbolSize: 7,
        itemStyle: { color: '#b7863c', opacity: 0.8, borderColor: '#7a5625', borderWidth: 1 },
        data: remaining,
      },
    ],
  };
}

export default function MagChart({ view, data, format, size, onSelect, heatmapStyle, toolbarTarget, onBrush, selected }) {
  const model = useMemo(() => view === 'features' ? comparisonModel(data.items)
    : view === 'distribution' ? distributionModel(data) : null, [view, data]);
  const option = useMemo(() => {
    if (view === 'distribution' || view === 'features' || view === 'heatmap') return null;
    if (view === 'taxonomy') return taxonomyOption(data);
    if (view === 'quality') return qualityOption(data);
    if (view === 'mapping') return mappingOption(data);
    return null;
  }, [view, data]);
  const exportConfig = useMemo(() => {
    const isHeatmap = view === 'heatmap';
    const width = size === 'large' ? 1800 : 1100;
    const height = size === 'large' ? 1000 : 640;
    return {
      fileName: `ADMeta-${data.provenance.version}-${view}-${(data.projectionFingerprint || data.provenance.requestFingerprint).slice(0, 12)}${view === 'distribution' ? `-${data.feature.magId}` : view === 'heatmap' ? `-${data.settings?.colorMode || 'abundance'}-${data.magIds.length}MAGs${heatmapStyle?.transposed ? '-transposed' : ''}` : view === 'features' ? `-${data.sortBy}-top${data.items.length}-${data.query || 'all'}` : ''}`,
      format, minWidth: width, minHeight: height,
      ...(isHeatmap ? {
        maxHeight: height, maxWidth: width, rasterizeSvg: true,
        // Bound PNG dimensions/memory while retaining every selected cell.
        pixelRatio: Math.min(2, 16384 / width, 16384 / height, Math.sqrt(32000000 / (width * height))),
        prepareOption: (_option, context) => ({ ...heatmapOption(data, heatmapStyle,
          { fit: true, width: context?.size.width || width, height: context?.size.height || height }),
          backgroundColor: '#ffffff', tooltip: { show: false } }),
      } : {}),
      fullDataZoom: true, title: `导出 ${format.toUpperCase()} 图形`,
    };
  }, [data, format, size, view, heatmapStyle]);
  if (view === 'heatmap') return <div className="mag-chart"><MagZoomableHeatmap data={data} heatmapStyle={heatmapStyle} exportConfig={exportConfig} onSelect={onSelect} toolbarTarget={toolbarTarget} /></div>;
  if (view === 'features') return <div className="mag-chart"><ZoomableGroupedBarChart model={model} barStyleConfig={barStyles.features} exportConfig={exportConfig} onSelect={onSelect} toolbarTarget={toolbarTarget} /></div>;
  if (['taxonomy', 'quality', 'mapping'].includes(view)) return <MagResearchChart key={view} kind={view} data={data}
    buildOption={view === 'taxonomy' ? taxonomyOption : view === 'quality' ? qualityOption : mappingResearchOption}
    exportConfig={exportConfig} onSelect={onSelect} onBrush={onBrush} selected={selected}
    height={view === 'taxonomy' ? Math.max(430, data.items.length * 28 + 100) : 480} />;
  const Chart = view === 'distribution' ? BoxScatterChart : CartesianEChart;
  const height = view === 'features' ? Math.max(430, data.items.length * 34 + 104)
    : view === 'taxonomy' ? Math.max(500, data.items.length * 28 + 120)
        : view === 'quality' ? 560 : 430;
  const minWidth = 680;
  return <div className="mag-chart"><ChartViewport variant="data" minHeight={height + 18} minWidth={minWidth}
    ariaLabel="MAG 图表，可横向滚动">
    <Chart {...(model ? { model, ...(view === 'features' ? { onSelect } : {}) } : { option })} barStyleConfig={barStyles[view]}
      boxStyleConfig={view === 'distribution' ? distributionStyle : null} opts={chartInitOptions} notMerge frameActions showDataTable={false} exportConfig={exportConfig}
      ariaLabel={`MAG ${view} 图表`} style={{ height }} />
  </ChartViewport></div>;
}
