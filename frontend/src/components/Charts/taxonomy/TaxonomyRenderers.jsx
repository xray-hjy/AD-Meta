import TaxonomyEChart from '../TaxonomyEChart';

export function SunburstRenderer({
  chartRef,
  option,
  size,
  view,
  onReady,
  onClick,
  onRootToNode,
  legendContent,
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
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
