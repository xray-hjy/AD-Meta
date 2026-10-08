const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const mapShape = (value, fn) => Array.isArray(value) ? value.map(fn) : value == null ? value : fn(value);
const numericValue = point => Number(point && typeof point === 'object' ? point.value : point);

export function cleanBarStyle(values = {}) {
  const cleaned = {};
  ['rounded', 'values', 'grid', 'legend', 'animation', 'groupMarkers', 'groupHover', 'valueZoom'].forEach(key => {
    if (typeof values[key] === 'boolean') cleaned[key] = values[key];
  });
  const choices = { width: ['thin', 'standard', 'thick'], precision: ['auto', '0', '1', '2', '3'], font: ['small', 'standard', 'large'] };
  Object.entries(choices).forEach(([key, allowed]) => { if (allowed.includes(values[key])) cleaned[key] = values[key]; });
  return cleaned;
}

export function barStyleDefaults(option) {
  const bars = list(option?.series).filter(series => series.type === 'bar');
  const first = bars[0] || {};
  const radii = list(first.itemStyle?.borderRadius);
  const pointRadius = list(first.data).some(point => list(point?.itemStyle?.borderRadius).some(value => value > 0));
  return {
    rounded: radii.some(value => value > 0) || pointRadius,
    values: Boolean(first.label?.show), grid: [...list(option?.xAxis), ...list(option?.yAxis)]
      .some(axis => axis.type === 'value' && axis.splitLine?.show !== false),
    legend: list(option?.legend).some(legend => legend.show !== false),
    animation: option?.animation !== false, width: 'standard', precision: 'auto', font: 'standard',
  };
}

function labelFormatter(original, settings, config) {
  if (settings.precision == null || settings.precision === 'auto') return original;
  return params => {
    const value = numericValue(params.value);
    if (params.value == null || !Number.isFinite(value)) return '—';
    return (value * (config.scale ?? 1)).toLocaleString('en-US', {
      minimumFractionDigits: config.integerValues ? 0 : Number(settings.precision),
      maximumFractionDigits: config.integerValues ? 0 : Number(settings.precision),
    }) + (config.suffix || '');
  };
}

function radius(horizontal, negative, enabled) {
  if (!enabled) return 0;
  return horizontal ? (negative ? [6, 0, 0, 6] : [0, 6, 6, 0])
    : (negative ? [0, 0, 6, 6] : [6, 6, 0, 0]);
}

// Pure visual transformation: never changes values, units, sorting or statistics.
export function applyBarStyle(option, preferences, config = {}) {
  const settings = cleanBarStyle(preferences);
  if (!Object.keys(settings).length) return option;
  const bars = list(option?.series).filter(series => series.type === 'bar');
  if (!bars.length) return option;
  const fontDelta = settings.font === 'large' ? 2 : settings.font === 'small' ? -2 : 0;
  const axisStyle = axis => ({ ...axis,
    ...(settings.grid == null || axis.type !== 'value' ? {} : { splitLine: { ...axis.splitLine, show: settings.grid } }),
    ...(fontDelta && axis.type === 'category' ? { axisLabel: { ...axis.axisLabel, fontSize: (axis.axisLabel?.fontSize || 12) + fontDelta } } : {}),
  });
  return { ...option,
    ...(settings.animation == null ? {} : { animation: settings.animation }),
    xAxis: mapShape(option.xAxis, axisStyle), yAxis: mapShape(option.yAxis, axisStyle),
    legend: mapShape(option.legend, legend => ({ ...legend, ...(settings.legend == null ? {} : { show: settings.legend }) })),
    series: mapShape(option.series, series => {
      if (series.type !== 'bar') return series;
      const horizontal = list(option.yAxis)[series.yAxisIndex || 0]?.type === 'category';
      const styleLabel = (label = {}, value) => ({ ...label,
        ...(settings.values == null ? {} : { show: settings.values }),
        ...(label.position == null && settings.values ? { position: horizontal ? 'right' : 'top' } : {}),
        ...(fontDelta ? { fontSize: (label.fontSize || series.label?.fontSize || 10) + fontDelta } : {}),
        ...(config.integerValues ? {} : { formatter: labelFormatter(label.formatter || series.label?.formatter, settings, config) }),
        ...(value < 0 && settings.values && (!label.position || ['right', 'top'].includes(label.position))
          ? { position: horizontal ? 'left' : 'bottom' } : {}),
      });
      const cap = Number(series.barWidth) || Number(series.barMaxWidth) || 24;
      return { ...series,
        ...(settings.width && settings.width !== 'standard' ? {
          barWidth: `${(settings.width === 'thin' ? 40 : 75) / bars.length}%`,
          barMaxWidth: cap * (settings.width === 'thin' ? 0.65 : 1.3),
        } : {}),
        label: styleLabel(series.label), labelLayout: { ...series.labelLayout, hideOverlap: true },
        ...(settings.rounded == null ? {} : { itemStyle: { ...series.itemStyle, borderRadius: 0 } }),
        data: list(series.data).map(point => {
          const value = numericValue(point);
          if (settings.rounded == null && settings.values == null && settings.precision == null && !fontDelta) return point;
          if (point == null) return point;
          const item = typeof point === 'object' ? point : { value: point };
          return { ...item,
            ...(settings.rounded == null ? {} : { itemStyle: { ...item.itemStyle, borderRadius: radius(horizontal, value < 0, settings.rounded) } }),
            label: styleLabel(item.label, value),
          };
        }),
      };
    }),
  };
}
