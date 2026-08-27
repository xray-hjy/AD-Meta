import TaxonomyEChart from '../TaxonomyEChart';

function flattenLegendItems(items) {
  return (items || []).flatMap(item => [
    item,
    ...(item.children || []),
  ]);
}

function buildSunburstExportOption(option, legendItems, hasMergedPhyla) {
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
      style: { text: '真实丰度比例', fill: '#64748b', font: '600 12px sans-serif', textAlign: 'right' },
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
            text: `${(ratio * 100).toFixed(ratio * 100 < 1 ? 2 : 1)}%`,
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
    center: ['38%', '50%'],
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
          exportConfig={{
            fileName: `taxonomy-sunburst-${view}`,
            format: 'svg',
            minWidth: size + 360,
            minHeight: size,
            toolbox: { right: 8, top: 8 },
            prepareOption: exportedOption => buildSunburstExportOption(
              exportedOption,
              legendItems,
              hasMergedPhyla,
            ),
          }}
          style={{ width: size, height: size }}
        />
      </div>
      <div className="taxonomy-phylum-panel">
        <div className="taxonomy-phylum-panel__header">
          <span>门级占比</span>
          <span>真实丰度比例</span>
        </div>
        <div className="taxonomy-phylum-list">{legendContent}</div>
        {hasMergedPhyla ? (
          <div className="taxonomy-phylum-note">
            旭日图中 &lt;1% 的门级合并为 Others；列表保留真实占比。
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RadialTreeRenderer({ option, size }) {
  return (
    <TaxonomyEChart
      className="taxonomy-chart-surface"
      option={option}
      opts={{ renderer: 'svg' }}
      exportConfig={{
        fileName: 'taxonomy-radial-tree',
        format: 'svg',
        minWidth: size,
        minHeight: size,
      }}
      style={{ width: size, height: size }}
    />
  );
}

export function SankeyRenderer({ option, opts, height, constraints, onReady }) {
  return (
    <div className="taxonomy-sankey-scroll">
      <TaxonomyEChart
        className="taxonomy-chart-surface taxonomy-chart-surface--sankey"
        option={option}
        opts={opts}
        autoResize={false}
        onChartReady={onReady}
        exportConfig={{
          fileName: 'taxonomy-sankey',
          format: 'png',
          pixelRatio: 2,
          minWidth: constraints.minWidth,
          minHeight: height,
          maxWidth: constraints.maxWidth,
          toolbox: { right: 10, top: 8 },
        }}
        style={{
          width: `clamp(${constraints.minWidth}px, 100%, ${constraints.maxWidth}px)`,
          height,
        }}
      />
    </div>
  );
}

export function TreemapRenderer({ option, size, onReady, onFinished }) {
  return (
    <div
      className="taxonomy-treemap-panel"
      style={{ width: size.width || '100%', height: size.height }}
    >
      <TaxonomyEChart
        className="taxonomy-chart-surface taxonomy-chart-surface--treemap"
        option={option}
        onChartReady={onReady}
        onEvents={{ finished: onFinished }}
        exportConfig={{
          fileName: 'taxonomy-treemap',
          format: 'svg',
          minWidth: 1200,
          minHeight: size.height,
        }}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
