import { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { AriaComponent } from 'echarts/components';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';
import { useColorVision } from '../../context/ColorVisionContext';
import ClientDataTable from '../data-display/ClientDataTable';
import ResultDisclosure from '../data-display/ResultDisclosure';
import ChartSupplement from './ChartSupplement';
import { exportEChart, withChartExport } from './chartExport';
import { useChartFrameActions, useChartFrameToolbarTarget } from './ChartFrameActionsContext';
import BarStyleToolbar from './BarStyleToolbar';
import BoxStyleToolbar from './BoxStyleToolbar';
import useChartStylePreferences from './useChartStylePreferences';
import { applyBarStyle } from './barStyle';
import { applyBoxStyle } from './boxStyle';

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

export function chartRowsFromOption(option, limit = Infinity) {
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
    barStyleConfig = null,
    boxStyleConfig = null,
    style,
    ...props
  },
  ref
) {
  const chartRef = useRef(null);
  const { colorBlindFriendly } = useColorVision();
  const [tableOpen, setTableOpen] = useState(false);
  const [seriesMode, setSeriesMode] = useState(null);
  const styleConfig = barStyleConfig || boxStyleConfig;
  const preferences = useChartStylePreferences(styleConfig?.key);
  const toolbarTarget = useChartFrameToolbarTarget();
  const interactionRef = useRef(null);
  const styledOption = useMemo(() => {
    const styled = barStyleConfig ? applyBarStyle(option, preferences.values, barStyleConfig)
      : boxStyleConfig ? applyBoxStyle(option, preferences.values, boxStyleConfig) : option;
    const interaction = interactionRef.current?.source === option ? interactionRef.current : null;
    return {
      ...styled,
      ...(seriesMode ? { series: styled.series.map(series => ({ ...series, type: seriesMode })) } : {}),
      ...(interaction?.dataZoom ? { dataZoom: interaction.dataZoom } : {}),
      ...(interaction?.legend && styled.legend ? { legend: (Array.isArray(styled.legend) ? styled.legend : [styled.legend])
        .map((legend, index) => ({ ...legend, selected: interaction.legend[index]?.selected })) } : {}),
    };
  }, [option, preferences.values, barStyleConfig, boxStyleConfig, seriesMode]);
  const rememberInteraction = () => {
    const current = chartRef.current?.getEchartsInstance?.()?.getOption?.();
    interactionRef.current = current ? {
      source: option,
      dataZoom: current.dataZoom?.map((zoom, index) => ({ ...(Array.isArray(option.dataZoom) ? option.dataZoom[index] : option.dataZoom),
        start: zoom.start, end: zoom.end, ...(zoom.startValue == null ? {} : { startValue: zoom.startValue }),
        ...(zoom.endValue == null ? {} : { endValue: zoom.endValue }) })),
      legend: current.legend?.map((legend, index) => ({ ...(Array.isArray(option.legend) ? option.legend[index] : option.legend), selected: legend.selected })),
    } : null;
  };
  const accessibleOption = useMemo(() => ({
    ...styledOption,
    aria: {
      enabled: true,
      decal: { show: colorBlindFriendly },
      ...(styledOption?.aria || {}),
    },
  }), [colorBlindFriendly, styledOption]);
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
    const series = Array.isArray(option?.series) ? option.series : [];
    if (!series.length) return;
    setSeriesMode(type);
  }, [option?.series]);
  const restoreChart = useCallback(() => {
    const instance = chartRef.current?.getEchartsInstance?.();
    instance?.dispatchAction?.({ type: 'restore' });
    interactionRef.current = null;
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
    () => hasDataTable ? { ...style, height: '100%' } : {
      height: 300, ...style,
      ...(styleConfig && style?.height === '100%' ? { height: 'var(--echart-context-height, 300px)' } : {}),
    },
    [hasDataTable, style, styleConfig]
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

  const StyleToolbar = barStyleConfig ? BarStyleToolbar : BoxStyleToolbar;
  const styleToolbar = styleConfig && seriesMode !== 'line' ? (
    <StyleToolbar option={option} preferences={preferences.values} config={styleConfig}
      onChange={(key, value) => { rememberInteraction(); preferences.update(key, value); }}
      onReset={() => { rememberInteraction(); preferences.reset(); }} />
  ) : null;
  const decorateChart = content => styleConfig ? (
    <div className="styled-chart">
      {frameActions && toolbarTarget ? createPortal(styleToolbar, toolbarTarget) : styleToolbar}
      {content}
    </div>
  ) : content;

  if (!hasDataTable) return decorateChart(chart);

  return decorateChart(
    <div className="echart-layout" style={layoutStyle}>
      {chart}
      <ChartSupplement><ResultDisclosure
        title="查看当前图表数据"
        summary={`${tableModel.rows.length.toLocaleString()} 条图表记录`}
        className="chart-data-table result-section--table"
        open={tableOpen}
        onToggle={event => setTableOpen(event.currentTarget.open)}
      >
        {tableOpen ? (
          <ClientDataTable
            ariaLabel={tableModel.ariaLabel || '当前图表数据，可滚动'}
            footer={tableModel.footer || null}
            rows={tableModel.rows}
            renderRow={(row, index) => (
              <tr key={tableModel.rowKey?.(row, index) ?? index}>
                {tableModel.columns.map(column => {
                  const value = column.format
                    ? column.format(row[column.key], row)
                    : printableValue(row[column.key]);
                  return <td key={column.key}>{value}</td>;
                })}
              </tr>
            )}
          >
            <thead>
              <tr>
                {tableModel.columns.map(column => (
                  <th scope="col" key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
          </ClientDataTable>
        ) : null}
      </ResultDisclosure></ChartSupplement>
    </div>
  );
});

export default EChartBase;
