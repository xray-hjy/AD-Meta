import { groupedBarScale } from './groupedBarScale';
import { escapeTooltipText } from '../../utils/tooltipHtml';

export const MAG_CATEGORY_SIZE = 34;
export const CATEGORY_ZOOM = 'mag-category-zoom';
export const VALUE_ZOOM = 'mag-value-zoom';
export const MAG_ANIMATION_MAX_ITEMS = 400;

export function nativeGroupedBarMotion({ settings, count, range, reducedMotion = false }) {
  const visibleCount = Math.ceil((range.end - range.start) / 100 * count);
  const enabled = settings.animation !== false && !reducedMotion && visibleCount <= MAG_ANIMATION_MAX_ITEMS;
  return { animation: enabled, animationThreshold: MAG_ANIMATION_MAX_ITEMS,
    // Match the official bar example's default baseline-growth entry animation.
    animationDuration: enabled ? 1000 : 0, animationDurationUpdate: enabled ? 320 : 0,
    animationEasing: 'cubicInOut', animationEasingUpdate: 'cubicOut', animationDelay: 0, animationDelayUpdate: 0 };
}

export function categoryZoomRange(visible, transposed, count) {
  const from = (transposed ? visible.x : visible.y) / MAG_CATEGORY_SIZE;
  const to = from + (transposed ? visible.width : visible.height) / MAG_CATEGORY_SIZE;
  return { start: Math.max(0, from / Math.max(1, count) * 100), end: Math.min(100, to / Math.max(1, count) * 100) };
}

export function categoryZoomInterval(zoom, count) {
  if (!Number.isFinite(zoom?.start) || !Number.isFinite(zoom?.end)) return null;
  return [Math.max(0, zoom.start) / 100 * count * MAG_CATEGORY_SIZE,
    Math.min(100, zoom.end) / 100 * count * MAG_CATEGORY_SIZE];
}

// Apache ECharts bar-large patterns, adapted to MAG units and the shared camera.
// Both category zooms target one axis. Value zoom uses `empty` to keep MAG order.
export function nativeGroupedBarOption({ model, option, settings, transposed, lineMode, plot, dimensions, range, valueRange = { start: 0, end: 100 }, accent = '#b65770', colorBlindFriendly, reducedMotion }) {
  const categoryAxis = transposed ? 'xAxis' : 'yAxis', valueAxis = transposed ? 'yAxis' : 'xAxis';
  const ticks = Math.max(2, Math.min(8, Math.floor((transposed ? plot.height : plot.width) / (transposed ? 65 : 100))));
  const dense = (transposed ? plot.width : plot.height) / Math.max(1, (range.end - range.start) / 100 * model.items.length) < 18;
  const motion = nativeGroupedBarMotion({ settings, count: model.items.length, range, reducedMotion });
  const bounds = extent => groupedBarScale([{ values: { low: extent.min, high: extent.max } }],
    [{ key: 'low' }, { key: 'high' }], transposed ? plot.height : plot.width, transposed).scale.domain();
  const valueAxisOption = { ...option[valueAxis][0], id: 'mag-value-axis',
    min: model.axisMin ?? (extent => bounds(extent)[0]), max: model.axisMax ?? (extent => bounds(extent)[1]),
    splitNumber: ticks, nameGap: transposed ? 54 : 35, axisLabel: { ...option[valueAxis][0].axisLabel,
      formatter: model.formatAxis || (value => Number(value.toPrecision(5)).toLocaleString('en-US', { maximumFractionDigits: 8 })) } };
  // Keep ECharts' native handle icons and move grip; only tint them for MAG.
  const sliderStyle = { borderColor: `${accent}33`, backgroundColor: `${accent}04`, fillerColor: `${accent}20`,
    handleSize: '100%', moveHandleSize: 7,
    handleStyle: { color: '#fff', borderColor: `${accent}66` }, moveHandleStyle: { color: accent, opacity: .5 },
    emphasis: { handleStyle: { borderColor: accent }, moveHandleStyle: { color: accent, opacity: .8 } },
    dataBackground: { lineStyle: { color: `${accent}66`, width: .5 }, areaStyle: { color: accent, opacity: .1 } },
    selectedDataBackground: { lineStyle: { color: accent, width: .5 }, areaStyle: { color: accent, opacity: .24 } }, textStyle: { color: '#64748b' } };
  const series = option.series.map((entry, index) => ({ ...entry, id: model.series[index].key,
    // Per-point style preferences must not override density-based visibility.
    data: entry.data.map((point, itemIndex) => {
      if (point == null) return null;
      const item = model.items[itemIndex];
      const datum = typeof point === 'object' ? { ...point } : { value: point };
      if (datum.label) { datum.label = { ...datum.label }; delete datum.label.show; }
      // Stable IDs let ECharts match the same MAG across ranking/data updates.
      return { ...datum, id: String(item.id || item.feature || itemIndex), name: item.fullName || item.label };
    }),
    label: { ...entry.label, show: settings.values !== false && !dense, silent: true },
    ...(lineMode ? { showSymbol: !dense, symbolSize: 5, smooth: false, connectNulls: false }
      : { barWidth: settings.width === 'thin' ? '24%' : settings.width === 'thick' ? '43%' : '36%',
        barMaxWidth: settings.width === 'thin' ? 16 : settings.width === 'thick' ? 30 : 24, barGap: model.overlapSeries ? '-100%' : '0%' }),
    labelLayout: { hideOverlap: true },
    emphasis: { ...entry.emphasis, disabled: !settings.groupHover, focus: settings.groupHover ? 'series' : 'none',
      itemStyle: { color: model.series[index].color, shadowBlur: 0 } },
    blur: { itemStyle: { opacity: .3 }, lineStyle: { opacity: .3 }, label: { opacity: .3 } },
    ...motion,
    // Shape morphing replaces bar growth with a line-to-rectangle transform.
    // Let BarView create each new bar at zero height/width, as in the example.
    universalTransition: { enabled: false }, progressive: 0,
  }));
  return { ...option, series, aria: { enabled: true, decal: { show: colorBlindFriendly } },
    ...motion,
    grid: { left: plot.left, top: plot.top, width: plot.width, height: plot.height, containLabel: false },
    [categoryAxis]: [{ ...option[categoryAxis][0], id: 'mag-category-axis', boundaryGap: true,
      axisLabel: { ...option[categoryAxis][0].axisLabel, interval: 'auto', hideOverlap: true,
        width: transposed ? 100 : Math.max(24, plot.left - (settings.groupMarkers ? 45 : 14)), overflow: 'truncate',
        margin: transposed ? settings.groupMarkers && !lineMode ? 30 : 14 : settings.groupMarkers ? 40 : 12 } }],
    [valueAxis]: [valueAxisOption],
    legend: { ...option.legend, top: 4, left: plot.left, right: undefined, itemWidth: 12, itemHeight: 12,
      ...(lineMode ? { icon: 'emptyCircle' } : { icon: 'roundRect' }) },
    tooltip: { ...option.tooltip, trigger: 'item', show: settings.groupHover, axisPointer: { type: 'none' },
      triggerOn: 'mousemove', hideDelay: 0, transitionDuration: 0, confine: true,
      formatter: entry => {
        if (model.tooltipFormatter) return model.tooltipFormatter(entry);
        const item = model.items[entry.dataIndex];
        if (!item) return '';
        const formatter = model.formatTooltipValue || model.formatValue;
        return `<div role="tooltip"><strong>${escapeTooltipText(item.fullName || item.label)}</strong><br/>${escapeTooltipText(entry.seriesName)}：${escapeTooltipText(formatter(item.values[model.series[entry.seriesIndex]?.key]))}</div>`;
      } },
    toolbox: { show: false, feature: { magicType: { show: true, type: ['line', 'bar'] }, restore: { show: true },
      dataView: { show: true, readOnly: true }, saveAsImage: { show: true } } },
    dataZoom: [
      { id: CATEGORY_ZOOM, type: 'slider', xAxisIndex: transposed ? 0 : [], yAxisIndex: transposed ? [] : 0, orient: 'horizontal', filterMode: 'filter', ...range,
        left: plot.left, width: plot.width, bottom: 12, height: 30, showDetail: false, brushSelect: true, realtime: true, throttle: 32,
        minSpan: 100 / Math.max(1, model.items.length), ...sliderStyle },
      { id: 'mag-category-inside', type: 'inside', xAxisIndex: transposed ? 0 : [], yAxisIndex: transposed ? [] : 0, filterMode: 'filter', ...range, throttle: 32,
        minSpan: 100 / Math.max(1, model.items.length), zoomOnMouseWheel: 'alt', moveOnMouseWheel: false, moveOnMouseMove: false },
      { id: VALUE_ZOOM, type: 'slider', xAxisIndex: transposed ? [] : 0, yAxisIndex: transposed ? 0 : [], orient: 'vertical', filterMode: 'empty',
        ...valueRange, show: settings.valueZoom !== false, left: plot.left + plot.width + 18, top: plot.top,
        width: 24, height: plot.height, showDataShadow: false, showDetail: false, brushSelect: true, throttle: 32,
        ...sliderStyle },
    ],
    graphic: [{ id: 'mag-native-range-caption', type: 'text', left: plot.left, top: dimensions.height - 66, silent: true,
      style: { text: plot.width < 460 ? '浏览区间' : '浏览区间 · 拖动选区或两端手柄', fill: '#64748b', font: '11px sans-serif' } }],
  };
}
