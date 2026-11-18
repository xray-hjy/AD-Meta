import { boxplotRanges, outsidePoints } from './boxplotView';

const encoder = new TextEncoder();
const finite = value => value != null && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

export function groupSummaryRows(items, groups, transform, groupCounts = {}) {
  return items.flatMap(item => groups.map(group => {
    const stats = item.groupStats?.[group.key];
    const box = item.values?.[group.key]?.[transform.key]?.box;
    const q1 = finite(box?.[1]), q3 = finite(box?.[3]);
    return { featureId: String(item.featureId || item.fullName), feature: item.fullName || item.shortName, shortName: item.shortName || item.fullName, group: group.label,
      sampleCount: stats?.sampleCount ?? groupCounts[group.key] ?? null,
      validCount: stats?.validCount ?? null, missingCount: stats?.missingCount ?? null,
      detectedCount: stats?.detectedCount ?? null, zeroCount: stats?.zeroCount ?? null, detectionRate: stats?.detectionRate ?? null,
      lowerWhisker: finite(box?.[0]), q1, median: finite(box?.[2]), q3, upperWhisker: finite(box?.[4]),
      iqr: q1 == null || q3 == null ? null : q3 - q1 };
  }));
}

export function csvBytes(columns, rows) {
  const cell = value => {
    let result = value == null ? '' : String(value);
    if (typeof value === 'string' && /^\s*[=+@-]/.test(value)) result = `'${result}`;
    return `"${result.replaceAll('"', '""')}"`;
  };
  return encoder.encode('\uFEFF' + [columns.map(cell).join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n'));
}

export function researchStyleSnapshot(option = {}) {
  const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
  return {
    colorBlindFriendly: Boolean(option.aria?.decal?.show),
    medianLabels: list(option.series).some(series => String(series.id).startsWith('box-median-labels-')),
    legends: list(option.legend).map(legend => ({ show: legend.show !== false, selected: legend.selected || {} })),
    series: list(option.series).filter(series => ['boxplot', 'scatter'].includes(series.type))
      .map(series => ({ type: series.type, name: series.name, boxWidth: series.boxWidth, symbolSize: series.symbolSize, itemStyle: series.itemStyle,
        categoryStyles: (series.data || []).flatMap((point, index) => point?.itemStyle ? [{ index, itemStyle: point.itemStyle }] : []),
      })),
    axes: list(option.yAxis).map(axis => ({ fontSize: axis.axisLabel?.fontSize, grid: axis.splitLine?.show !== false })),
  };
}

export function buildReviewFiles(projection, model, review, sourceOption = {}, output = {}) {
  if (!projection?.projectionKey || review?.projectionKey !== projection.projectionKey) throw new Error('复核数据与当前图表不一致，请重新导出。');
  const { available, series, activeTransform, focus, view, axisMode } = model;
  const valuesById = new Map(review.items.map(item => [String(item.featureId), item]));
  if (valuesById.size !== available.length || available.some(item => {
    const values = valuesById.get(String(item.featureId));
    return values?.storedValues?.length !== review.samples.length
      || ['raw', 'sqrt', 'log'].some(key => values?.displayValues?.[key]?.length !== review.samples.length);
  })) {
    throw new Error('逐样本数据不完整，未生成下载文件，请刷新图表后重试。');
  }
  const multiplier = review.displayMultiplier;
  if (!(multiplier > 0) || !Number.isFinite(multiplier)) throw new Error('丰度换算比例无效，请重新加载图表。');
  const ranges = boxplotRanges(available, series, activeTransform.key, view === 'overview' ? 'shared' : axisMode, focus);
  const transforms = projection.payload.valueTransforms;
  const groupRows = transforms.flatMap(transform => groupSummaryRows(available, series, transform, model.groupCounts)
    .map(row => ({ projectionKey: projection.projectionKey, datasetRevision: projection.datasetRevision,
      ...row, transformKey: transform.key, displayUnit: transform.label, formula: transform.formula })));
  const samples = available.flatMap((item, index) => review.samples.map((sample, sampleIndex) => {
    const values = valuesById.get(String(item.featureId));
    const storedValue = finite(values.storedValues[sampleIndex]);
    const raw = finite(values.displayValues.raw[sampleIndex]);
    const sqrt = finite(values.displayValues.sqrt[sampleIndex]);
    const log = finite(values.displayValues.log[sampleIndex]);
    const current = { raw, sqrt, log }[activeTransform.key];
    const isOutlier = key => storedValue == null ? null
      : Boolean(item.values?.[sample.group]?.[key]?.outlierPoints?.some(point => point.sample === sample.sampleCode));
    return { projectionKey: projection.projectionKey, datasetRevision: projection.datasetRevision,
      featureId: String(item.featureId), feature: item.fullName || item.shortName, sampleCode: sample.sampleCode, group: sample.group,
      storedValue, rawDisplayValue: raw, sqrtDisplayValue: sqrt, log10DisplayValue: log,
      detected: storedValue == null ? null : storedValue > 0, status: storedValue == null ? 'missing' : storedValue === 0 ? 'zero' : 'nonzero',
      outlierRaw: isOutlier('raw'), outlierSqrt: isOutlier('sqrt'), outlierLog10: isOutlier('log'),
      currentTransform: activeTransform.key, outsideCurrentViewport: current == null ? null : current < ranges[index].min || current > ranges[index].max };
  }));
  const metadata = {
    schema: 'admeta-boxplot-review/1', exportedAt: new Date().toISOString(),
    projectionKey: projection.projectionKey, runKey: projection.runKey, artifactKey: projection.artifactKey,
    datasetSlug: projection.datasetSlug, datasetRevision: projection.datasetRevision, dataSemantics: projection.dataSemantics,
    scope: projection.scope, projectionRequest: projection.projectionRequest, samples: review.samples,
    selectedFeatures: available.map(item => ({ featureId: String(item.featureId), fullName: item.fullName, shortName: item.shortName })),
    statistics: projection.payload.statisticalMethods, displayMultiplier: multiplier, valueTransforms: transforms,
    currentFigure: { view, axisMode: view === 'overview' ? 'shared' : axisMode, focus,
      transform: activeTransform, page: model.page, pageSize: model.pageSize,
      ...output, styles: researchStyleSnapshot(sourceOption),
      ranges: available.map((item, index) => ({ featureId: String(item.featureId), ...ranges[index],
        outsideCounts: Object.fromEntries(series.map(group => [group.key,
          outsidePoints(item, [group], activeTransform.key, ranges[index]).length])) })),
    },
    csvNotes: 'UTF-8 BOM; empty numeric cells mean missing, never zero; text cells beginning with spreadsheet formula characters are prefixed with an apostrophe.',
  };
  return [
    { name: 'group-statistics.csv', bytes: csvBytes(['projectionKey', 'datasetRevision', 'featureId', 'feature', 'group', 'transformKey', 'displayUnit', 'formula',
      'sampleCount', 'validCount', 'missingCount', 'detectedCount', 'zeroCount', 'detectionRate', 'lowerWhisker', 'q1', 'median', 'q3', 'upperWhisker', 'iqr'], groupRows) },
    { name: 'sample-abundance.csv', bytes: csvBytes(['projectionKey', 'datasetRevision', 'featureId', 'feature', 'sampleCode', 'group', 'storedValue', 'rawDisplayValue',
      'sqrtDisplayValue', 'log10DisplayValue', 'detected', 'status', 'outlierRaw', 'outlierSqrt', 'outlierLog10', 'currentTransform', 'outsideCurrentViewport'], samples) },
    { name: 'metadata.json', bytes: encoder.encode(JSON.stringify(metadata, null, 2)) },
    { name: 'README.txt', bytes: encoder.encode(`丰度箱线图复核数据\n\n样本范围和全部绘图物种以 metadata.json 为准，数据不受图表分页或主体放大影响。\n\ngroup-statistics.csv：每个物种、每组、每种尺度的统计；detectionRate 为 0–1 比例，分母为 validCount。检出定义为存储丰度 > 0。零值计入分位数及检出分母；非有限值排除，missingCount 单列。Q1/Q3 使用 linear 插值；IQR=Q3-Q1；箱须为 1.5×IQR 范围内最远观测值。\n\nsample-abundance.csv：全部已选物种×范围内样本。storedValue 保留存储口径；rawDisplayValue=storedValue×${multiplier}，再逐样本执行 sqrt(max(x,0)) 或 log10(max(x,0)+1)。相对丰度的存储单位为比例，展示单位为百分数；其他单位以 metadata.json 为准，unknown 表示未提供，不推断为百分数。数值空白表示缺失；0 是实际零值。outlier 列来自对应尺度的后端统计。\n\nmetadata.json：数据版本、分析运行、分析产物、精确请求和样本/物种列表，以及当前图形尺度、轴范围、视野外计数、样式、导出格式与范围。图形如使用独立纵轴，不可用不同物种的箱体视觉高度比较丰度。\n\nCSV 使用 UTF-8 BOM，数值保留序列化精度；公式字符开头的文本加单引号以便安全地用表格软件打开。\n`) },
  ];
}
