import { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { AriaComponent } from 'echarts/components';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';
import { useColorVision } from '../../context/ColorVisionContext';
import DataTableViewport from '../data-display/DataTableViewport';
import { exportEChart, withChartExport } from './chartExport';
import { useChartFrameActions } from './ChartFrameActionsContext';

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
    dataTableModel = null,
    showDataTable = true,
    exportConfig = null,
    frameActions = false,
    style,
    ...props
  },
  ref
) {
  const chartRef = useRef(null);
  const { colorBlindFriendly } = useColorVision();
  const [tableOpen, setTableOpen] = useState(false);
  const [seriesMode, setSeriesMode] = useState(null);
  const accessibleOption = useMemo(() => ({
    ...option,
    aria: {
      enabled: true,
      decal: { show: colorBlindFriendly },
      ...(option?.aria || {}),
    },
  }), [colorBlindFriendly, option]);
  const renderedOption = useMemo(() => {
    if (!frameActions) return withChartExport(accessibleOption, chartRef, exportConfig);
    if (!accessibleOption?.toolbox) return accessibleOption;
    const toolbox = Array.isArray(accessibleOption.toolbox)
      ? accessibleOption.toolbox.map(item => ({ ...item, show: false }))
      : { ...accessibleOption.toolbox, show: false };
    return { ...accessibleOption, toolbox };
  }, [accessibleOption, exportConfig, frameActions]);
  const assignChartRef = useCallback(node => {
    chartRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  const fallbackTableRows = useMemo(() => chartRowsFromOption(option), [option]);
  const tableModel = useMemo(() => {
    if (dataTableModel) {
      const rows = Array.isArray(dataTableModel.rows) ? dataTableModel.rows : [];
      const columns = Array.isArray(dataTableModel.columns) ? dataTableModel.columns : [];
      return { ...dataTableModel, columns, rows };
    }
    return {
      ariaLabel: '当前图表数据，可滚动',
      columns: [
        { key: 'series', label: '系列' },
        { key: 'item', label: '项目' },
        { key: 'value', label: '数值' },
      ],
      rows: fallbackTableRows,
      footer: fallbackTableRows.length >= 200 ? '为保证页面性能，仅展示前 200 行。' : null,
    };
  }, [dataTableModel, fallbackTableRows]);
  const hasDataTable = showDataTable && tableModel.columns.length > 0 && tableModel.rows.length > 0;
  const toolbox = Array.isArray(option?.toolbox) ? option.toolbox[0] : option?.toolbox;
  const toolboxFeatures = toolbox?.feature || {};
  const magicTypeList = toolboxFeatures.magicType?.type;
  const supportsLineView = Array.isArray(magicTypeList) && magicTypeList.includes('line');
  const supportsBarView = Array.isArray(magicTypeList) && magicTypeList.includes('bar');
  const supportsRestore = Boolean(toolboxFeatures.restore && toolboxFeatures.restore.show !== false);
  const setSeriesType = useCallback(type => {
    const instance = chartRef.current?.getEchartsInstance?.();
    const series = Array.isArray(option?.series) ? option.series : [];
    if (!instance || !series.length) return;
    instance.setOption({ series: series.map(item => ({ ...item, type })) });
    setSeriesMode(type);
  }, [option?.series]);
  const restoreChart = useCallback(() => {
    const instance = chartRef.current?.getEchartsInstance?.();
    instance?.dispatchAction?.({ type: 'restore' });
    setSeriesMode(null);
  }, []);
  const externalActions = useMemo(() => {
    if (!frameActions) return [];
    const actions = [];
    if (hasDataTable) {
      actions.push({
        id: 'data-table',
        icon: 'table',
        label: tableOpen ? '收起图表数据' : '查看图表数据',
        pressed: tableOpen,
        onClick: () => setTableOpen(value => !value),
      });
    }
    if (supportsLineView) {
      actions.push({
        id: 'line-view',
        icon: 'line',
        label: '切换为折线图',
        pressed: seriesMode === 'line',
        onClick: () => setSeriesType('line'),
      });
    }
    if (supportsBarView) {
      actions.push({
        id: 'bar-view',
        icon: 'bar',
        label: '切换为柱状图',
        pressed: seriesMode === 'bar' || seriesMode == null,
        onClick: () => setSeriesType('bar'),
      });
    }
    if (supportsRestore) {
      actions.push({ id: 'restore', icon: 'restore', label: '重置图表', onClick: restoreChart });
    }
    if (exportConfig) {
      actions.push({
        id: 'export',
        icon: 'export',
        label: exportConfig.title || '导出图形',
        onClick: () => { void exportEChart(chartRef, exportConfig); },
      });
    }
    return actions;
  }, [
    exportConfig,
    frameActions,
    hasDataTable,
    restoreChart,
    seriesMode,
    setSeriesType,
    supportsBarView,
    supportsLineView,
    supportsRestore,
    tableOpen,
  ]);
  useChartFrameActions(externalActions, frameActions);
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
        ref={assignChartRef}
        echarts={echarts}
        option={renderedOption}
        style={{ width: '100%', height: '100%' }}
        {...props}
      />
    </div>
  );

  if (!hasDataTable) return chart;

  return (
    <div className="echart-layout" style={layoutStyle}>
      {chart}
      <details
        className="chart-data-table"
        open={tableOpen}
        onToggle={event => setTableOpen(event.currentTarget.open)}
      >
        <summary>查看当前图表数据</summary>
        {tableOpen ? (
          <DataTableViewport
            ariaLabel={tableModel.ariaLabel || '当前图表数据，可滚动'}
            footer={tableModel.footer || null}
          >
            <thead>
              <tr>
                {tableModel.columns.map(column => (
                  <th scope="col" key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableModel.rows.map((row, index) => (
                <tr key={tableModel.rowKey?.(row, index) || index}>
                  {tableModel.columns.map(column => {
                    const value = column.format
                      ? column.format(row[column.key], row)
                      : printableValue(row[column.key]);
                    return <td key={column.key}>{value}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </DataTableViewport>
        ) : null}
      </details>
    </div>
  );
});

export default EChartBase;
