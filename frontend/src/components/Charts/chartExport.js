import * as echarts from 'echarts/core';

const DOWNLOAD_ICON = 'path://M3 19h18v2H3v-2zm8-18h2v11.17l3.59-3.58L18 10l-6 6-6-6 1.41-1.41L11 12.17V1z';

function cloneOption(value) {
  if (Array.isArray(value)) return value.map(cloneOption);
  if (!value || typeof value !== 'object') return value;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneOption(item)]));
}

function asList(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function withoutTransientInteraction(option, { fullDataZoom = false } = {}) {
  const exported = cloneOption(option || {});
  exported.animation = false;
  exported.stateAnimation = { duration: 0 };
  exported.backgroundColor = '#ffffff';

  if (exported.toolbox) {
    exported.toolbox = asList(exported.toolbox).map(item => ({ ...item, show: false }));
  }
  if (exported.tooltip) {
    exported.tooltip = asList(exported.tooltip).map(item => ({ ...item, show: false }));
  }
  if (exported.axisPointer) {
    exported.axisPointer = asList(exported.axisPointer).map(item => ({ ...item, show: false }));
  }
  if (exported.brush) {
    exported.brush = asList(exported.brush).map(item => ({ ...item, toolbox: [] }));
  }
  if (exported.dataZoom) {
    exported.dataZoom = asList(exported.dataZoom).map(item => {
      const next = {
        ...item,
        show: false,
        showDetail: false,
        brushSelect: false,
        disabled: true,
      };
      if (fullDataZoom) {
        next.start = 0;
        next.end = 100;
        delete next.startValue;
        delete next.endValue;
      }
      return next;
    });
  }
  if (exported.visualMap) {
    exported.visualMap = asList(exported.visualMap).map(item => ({
      ...item,
      calculable: false,
      hoverLink: false,
    }));
  }
  if (exported.series) {
    exported.series = asList(exported.series).map(series => ({
      ...series,
      selectedMode: false,
    }));
  }
  return exported;
}

function resolveChart(chartRefOrInstance) {
  const value = chartRefOrInstance?.current ?? chartRefOrInstance;
  return value?.getEchartsInstance?.() ?? value ?? null;
}

function safeFileName(value) {
  return String(value || 'admeta-chart')
    .replace(/\.[a-z0-9]+$/i, '')
    .split('')
    .map(character => character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '-' : character)
    .join('')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'admeta-chart';
}

function dateStamp() {
  const date = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function categoryCount(option) {
  const axes = asList(option?.xAxis);
  return Math.max(0, ...axes.map(axis => Array.isArray(axis?.data) ? axis.data.length : 0));
}

function exportSize(chart, option, config) {
  const currentWidth = Math.max(640, chart.getWidth?.() || 0);
  const currentHeight = Math.max(420, chart.getHeight?.() || 0);
  const count = categoryCount(option);
  const widthPerCategory = Number(config.widthPerCategory) || 0;
  const calculatedWidth = widthPerCategory && count
    ? count * widthPerCategory + (Number(config.horizontalPadding) || 180)
    : currentWidth;
  return {
    width: Math.min(Number(config.maxWidth) || 12000, Math.max(currentWidth, calculatedWidth, Number(config.minWidth) || 0)),
    height: Math.max(currentHeight, Number(config.minHeight) || 0),
  };
}

function withExportGrid(option, gridOverrides) {
  if (!gridOverrides || !option?.grid) return option;
  const grid = asList(option.grid).map(item => ({ ...item, ...gridOverrides }));
  return {
    ...option,
    grid: Array.isArray(option.grid) ? grid : grid[0],
  };
}

function triggerDownload(url, fileName) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function waitForChart(chart) {
  return new Promise(resolve => {
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      chart.off?.('finished', finish);
      resolve();
    };
    chart.on?.('finished', finish);
    requestAnimationFrame(() => requestAnimationFrame(finish));
  });
}

export async function exportEChart(chartRefOrInstance, config = {}) {
  const sourceChart = resolveChart(chartRefOrInstance);
  if (!sourceChart || typeof document === 'undefined') return false;

  const format = config.format === 'png' ? 'png' : 'svg';
  const sourceOption = sourceChart.getOption?.() || {};
  const sanitizedOption = withoutTransientInteraction(sourceOption, config);
  const layoutOption = withExportGrid(sanitizedOption, config.grid);
  const size = exportSize(sourceChart, layoutOption, config);
  const preparedOption = typeof config.prepareOption === 'function'
    ? config.prepareOption(layoutOption, { sourceChart, size })
    : layoutOption;
  const option = preparedOption || layoutOption;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  Object.assign(host.style, {
    position: 'fixed',
    left: '-100000px',
    top: '0',
    width: `${size.width}px`,
    height: `${size.height}px`,
    pointerEvents: 'none',
    background: '#ffffff',
  });
  document.body.appendChild(host);

  let exportChart;
  try {
    exportChart = echarts.init(host, null, { renderer: format === 'svg' ? 'svg' : 'canvas' });
    exportChart.setOption(option, { notMerge: true, lazyUpdate: false });
    await waitForChart(exportChart);
    const url = exportChart.getDataURL({
      type: format,
      pixelRatio: format === 'png' ? (Number(config.pixelRatio) || 2) : 1,
      backgroundColor: '#ffffff',
      excludeComponents: ['toolbox', 'dataZoom', 'brush'],
    });
    triggerDownload(url, `${safeFileName(config.fileName)}-${dateStamp()}.${format}`);
    return true;
  } catch (error) {
    console.error('Export chart failed:', error);
    return false;
  } finally {
    exportChart?.dispose?.();
    host.remove();
  }
}

export function withChartExport(option, chartRef, config) {
  if (!config || !option) return option;
  const toolbox = Array.isArray(option.toolbox) ? option.toolbox[0] || {} : option.toolbox || {};
  const feature = { ...(toolbox.feature || {}) };
  delete feature.saveAsImage;
  feature.myExport = {
    show: true,
    title: config.title || '导出图形',
    icon: DOWNLOAD_ICON,
    onclick: () => { void exportEChart(chartRef, config); },
  };
  return {
    ...option,
    toolbox: {
      show: true,
      right: 18,
      top: 4,
      itemSize: 16,
      iconStyle: { borderColor: '#94a3b8', borderWidth: 1.2 },
      emphasis: { iconStyle: { borderColor: '#475569' } },
      ...toolbox,
      ...(config.toolbox || {}),
      feature,
    },
  };
}

export { withoutTransientInteraction, withExportGrid };
