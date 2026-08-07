import { forwardRef, useMemo, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { AriaComponent } from 'echarts/components';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';
import { useColorVision } from '../../context/ColorVisionContext';

echarts.use([AriaComponent, CanvasRenderer, SVGRenderer]);

export { echarts };

function printableValue(value) {
  if (Array.isArray(value)) return value.map(printableValue).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value);
  if (value == null) return '—';
  return String(value);
}

function cssLength(value, fallback) {
  if (value == null) return fallback;
  return typeof value === 'number' ? `${value}px` : value;
}

export function chartRowsFromOption(option, limit = 200) {
  const rows = [];
  const seriesList = Array.isArray(option?.series) ? option.series : option?.series ? [option.series] : [];
  const xCategories = option?.xAxis?.data || option?.xAxis?.[0]?.data || [];
  const yCategories = option?.yAxis?.data || option?.yAxis?.[0]?.data || [];

  const push = (series, item, value) => {
    if (rows.length < limit) rows.push({ series, item, value: printableValue(value) });
  };

  const visit = (entries, seriesName, prefix = '') => {
    if (!Array.isArray(entries) || rows.length >= limit) return;
    entries.forEach((entry, index) => {
      if (rows.length >= limit) return;
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const name = entry.name ?? entry.id ?? xCategories[index] ?? `项目 ${index + 1}`;
        push(seriesName, prefix ? `${prefix} / ${name}` : name, entry.value);
        if (Array.isArray(entry.children)) visit(entry.children, seriesName, prefix ? `${prefix} / ${name}` : name);
        return;
      }
      if (Array.isArray(entry) && entry.length >= 3 && xCategories.length && yCategories.length) {
        push(
          seriesName,
          `${xCategories[entry[0]] ?? entry[0]} / ${yCategories[entry[1]] ?? entry[1]}`,
          entry[2],
        );
        return;
      }
      push(seriesName, xCategories[index] ?? `项目 ${index + 1}`, entry);
    });
  };

  seriesList.forEach((series, index) => {
    const seriesName = series?.name || `系列 ${index + 1}`;
    visit(series?.data || series?.nodes, seriesName);
    if (Array.isArray(series?.links)) {
      series.links.forEach(link => push(
        seriesName,
        `${link.source ?? '起点'} → ${link.target ?? '终点'}`,
        link.value,
      ));
    }
  });
  return rows;
}

const EChartBase = forwardRef(function EChartBase(
  {
    option,
    ariaLabel = '交互式数据图表',
    showDataTable = true,
    style,
    ...props
  },
  ref
) {
  const { colorBlindFriendly } = useColorVision();
  const [tableOpen, setTableOpen] = useState(false);
  const accessibleOption = useMemo(() => ({
    ...option,
    aria: {
      enabled: true,
      decal: { show: colorBlindFriendly },
      ...(option?.aria || {}),
    },
  }), [colorBlindFriendly, option]);
  const tableRows = useMemo(() => chartRowsFromOption(option), [option]);
  const hasDataTable = showDataTable && tableRows.length > 0;
  const containerStyle = useMemo(
    () => hasDataTable ? { ...style, height: '100%' } : { height: 300, ...style },
    [hasDataTable, style]
  );
  const layoutStyle = useMemo(() => {
    const requestedHeight = style?.height;
    return {
      '--echart-layout-canvas-height': requestedHeight && requestedHeight !== '100%'
        ? cssLength(requestedHeight, '300px')
        : 'var(--echart-context-height, 300px)',
    };
  }, [style?.height]);

  const chart = (
    <div
      className={hasDataTable ? 'echart-layout__canvas' : undefined}
      role="img"
      aria-label={ariaLabel}
      tabIndex={0}
      style={containerStyle}
      data-colorblind-friendly={colorBlindFriendly}
    >
      <ReactEChartsCore
        ref={ref}
        echarts={echarts}
        option={accessibleOption}
        style={{ width: '100%', height: '100%' }}
        {...props}
      />
    </div>
  );

  if (!hasDataTable) return chart;

  return (
    <div className="echart-layout" style={layoutStyle}>
      {chart}
      <details className="chart-data-table" onToggle={event => setTableOpen(event.currentTarget.open)}>
        <summary>查看当前图表数据</summary>
        {tableOpen ? (
          <div className="chart-data-table__scroll" tabIndex={0} aria-label="当前图表数据，可滚动">
            <table>
              <thead>
                <tr><th scope="col">系列</th><th scope="col">项目</th><th scope="col">数值</th></tr>
              </thead>
              <tbody>
                {tableRows.map((row, index) => (
                  <tr key={`${row.series}-${row.item}-${index}`}>
                    <td>{row.series}</td><td>{row.item}</td><td>{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tableRows.length >= 200 ? <p>为保证页面性能，仅展示前 200 行。</p> : null}
          </div>
        ) : null}
      </details>
    </div>
  );
});

export default EChartBase;
