import TaxonomyEChart from '../TaxonomyEChart';
import FloatingTaxonomyLegend from './FloatingTaxonomyLegend';
import { preciseTaxonomy } from '../taxonomyExploration';

function flattenLegendItems(items) {
  return (items || []).flatMap(item => [
    item,
    ...(item.children || []),
  ]);
}

function buildSunburstExportOption(option, legendItems, hasMergedPhyla, size = { width: 1400, height: 1000 }) {
  const rows = flattenLegendItems(legendItems);
  const rowHeight = 27;
  const children = [
    {
      type: 'text',
      left: 0,
      top: 0,
      style: { text: '门级占比', fill: '#334155', font: '600 13px sans-serif' },
    },
    {
      type: 'text',
      right: 0,
      top: 0,
      style: { text: '占完整范围总和', fill: '#64748b', font: '600 12px sans-serif', textAlign: 'right' },
    },
    ...rows.flatMap((item, index) => {
      const y = 31 + index * rowHeight;
      const depth = Number(item.depth || 0);
      const ratio = Number(item.ratio || 0);
      return [
        {
          type: 'circle',
          shape: { cx: 7 + depth * 14, cy: y + 6, r: depth ? 4 : 5 },
          style: { fill: item.color || '#94a3b8' },
        },
        {
          type: 'text',
          left: 18 + depth * 14,
          top: y,
          style: {
            text: String(item.name || ''),
            fill: depth ? '#64748b' : '#334155',
            font: `${depth ? 11 : 12}px sans-serif`,
            width: 128 - depth * 14,
            overflow: 'truncate',
            ellipsis: '...',
          },
        },
        {
          type: 'rect',
          shape: { x: 154, y: y + 3, width: 82, height: 6, r: 3 },
          style: { fill: '#eef2f7' },
        },
        {
          type: 'rect',
          shape: { x: 154, y: y + 3, width: Math.max(ratio > 0 ? 2 : 0, Math.min(82, ratio * 82)), height: 6, r: 3 },
          style: { fill: item.color || '#94a3b8' },
        },
        {
          type: 'text',
          right: 0,
          top: y - 1,
          style: {
            text: `${preciseTaxonomy(ratio * 100)}%`,
            fill: '#64748b',
            font: '11px sans-serif',
            textAlign: 'right',
          },
        },
      ];
    }),
  ];
  if (hasMergedPhyla) {
    children.push({
      type: 'text',
      left: 0,
      top: 40 + rows.length * rowHeight,
      style: {
        text: '旭日图中 <1% 的门级合并为 Others；\n列表保留真实占比。',
        fill: '#64748b',
        font: '11px sans-serif',
        lineHeight: 18,
      },
    });
  }

  const series = (Array.isArray(option.series) ? option.series : [option.series]).map(item => ({
    ...item,
    center: [(size.width - 360) / 2, size.height / 2],
    radius: [30, Math.max(100, Math.min((size.width - 360) / 2 - 150, size.height / 2 - 150))],
  }));
  const existingGraphic = option.graphic == null
    ? []
    : Array.isArray(option.graphic) ? option.graphic : [option.graphic];
  return {
    ...option,
    series,
    graphic: [
      ...existingGraphic,
      {
        type: 'group',
        right: 34,
        top: 'middle',
        bounding: 'raw',
        width: 292,
        height: Math.max(120, 72 + rows.length * rowHeight),
        children,
      },
    ],
  };
}

function withExportNote(option, note) {
  if (!note) return option;
  const graphic = option.graphic == null ? [] : Array.isArray(option.graphic) ? option.graphic : [option.graphic];
  return { ...option, graphic: [...graphic, { type: 'text', left: 18, bottom: 10,
    style: { text: note, fill: '#475569', font: '11px sans-serif', width: 1100, overflow: 'break', lineHeight: 16 } }] };
}

export function SunburstRenderer({
  chartRef,
  option,
  size,
  view,
  onReady,
  onClick,
  onRootToNode,
  legendContent,
  legendItems,
  hasMergedPhyla,
  exportNote,
  legendVisible,
  onLegendVisibleChange,
}) {
  return (
    <div className="taxonomy-sunburst-layout">
      <div className="taxonomy-sunburst-visual">
        <TaxonomyEChart
          key={`sunburst-${view}`}
          ref={chartRef}
          className="taxonomy-chart-surface"
          option={option}
          onChartReady={onReady}
          onEvents={{ click: onClick, sunburstRootToNode: onRootToNode }}
          frameActions
          exportConfig={{
            fileName: `taxonomy-sunburst-${view}`,
            format: 'svg',
            minWidth: Math.max(1200, size + 360),
            minHeight: Math.max(size, flattenLegendItems(legendItems).length * 27 + 200),
            prepareOption: (exportedOption, context) => withExportNote(buildSunburstExportOption(
              exportedOption,
              legendItems,
              hasMergedPhyla,
              context?.size,
            ), exportNote),
          }}
          style={{ width: size, height: size }}
        />
      </div>
      <FloatingTaxonomyLegend resetKey={view} visible={legendVisible} onVisibleChange={onLegendVisibleChange}>
      <div className="taxonomy-phylum-panel">
        <div className="taxonomy-phylum-panel__header">
          <span>门级占比</span>
          <span>占完整范围总和</span>
        </div>
        <div className="taxonomy-phylum-list">{legendContent}</div>
        {hasMergedPhyla ? (
          <div className="taxonomy-phylum-note">
            旭日图中 &lt;1% 的门级合并为 Others；列表保留真实占比。
          </div>
        ) : null}
      </div>
      </FloatingTaxonomyLegend>
    </div>
  );
}

export function RadialTreeRenderer({ option, size, onReady, onClick, exportNote }) {
  return (
    <TaxonomyEChart
      className="taxonomy-chart-surface"
      option={option}
      opts={{ renderer: 'svg' }}
      onChartReady={onReady} onEvents={{ click: onClick }}
      frameActions
      exportConfig={{
        fileName: 'taxonomy-radial-tree',
        format: 'svg', prepareOption: current => withExportNote({ ...current,
          series: current.series.map(series => ({ ...series, zoom: 1, center: undefined })) }, exportNote),
        minWidth: size,
        minHeight: size,
      }}
      style={{ width: size, height: size }}
    />
  );
}

export function SankeyRenderer({ option, opts, height, constraints, onReady, onClick, exportNote }) {
  return (
    <div className="taxonomy-sankey-scroll">
      <TaxonomyEChart
        className="taxonomy-chart-surface taxonomy-chart-surface--sankey"
        option={option}
        opts={opts}
        autoResize={false}
        onChartReady={onReady}
        onEvents={{ click: onClick }}
        frameActions
        exportConfig={{
          fileName: 'taxonomy-sankey',
          title: '导出完整桑基图 PNG',
          format: 'png', prepareOption: current => withExportNote(current, exportNote),
          pixelRatio: 2,
          minWidth: constraints.minWidth,
          minHeight: height,
          maxWidth: constraints.maxWidth,
        }}
        style={{
          width: constraints.width,
          height,
        }}
      />
    </div>
  );
}

export function TreemapRenderer({ option, size, onReady, onFinished, onClick, exportNote }) {
  return (
    <div
      className="taxonomy-treemap-panel"
      style={{ width: size.width || '100%', height: size.height }}
    >
      <TaxonomyEChart
        className="taxonomy-chart-surface taxonomy-chart-surface--treemap"
        option={option}
        onChartReady={onReady}
        onEvents={{ finished: onFinished, click: onClick }}
        frameActions
        exportConfig={{
          fileName: 'taxonomy-treemap',
          format: 'svg', prepareOption: current => withExportNote(current, exportNote),
          minWidth: 1200,
          minHeight: size.height,
        }}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
