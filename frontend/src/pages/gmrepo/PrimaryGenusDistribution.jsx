import { useState } from 'react';
import ChartFrame from '../../components/Charts/ChartFrame';
import ResearchChartSurface from '../../components/Charts/ResearchChartSurface';
import { useColorVision } from '../../context/ColorVisionContext';
import { COLORBLIND_GROUP_COLORS, GROUP_COLORS } from '../../components/Charts/groupPalette';
import SegmentedControl from '../../components/ui/SegmentedControl';

export function ecdfPoints(points, log = false) {
  const values = points.map(p => p.value).sort((a, b) => a - b);
  if (!values.length) return [];
  const result = [[log ? Math.log10(values[0] + 1) : values[0], 0]];
  values.forEach((value, i) => { if (i === values.length - 1 || value !== values[i + 1]) result.push([log ? Math.log10(value + 1) : value, (i + 1) / values.length * 100]); });
  return result;
}

export default function PrimaryGenusDistribution({ main, evaluationId }) {
  const [log, setLog] = useState(false);
  const { colorBlindFriendly } = useColorVision();
  const colors = colorBlindFriendly ? COLORBLIND_GROUP_COLORS : GROUP_COLORS;
  const title = `${main.statistic.genus.name} · 主队列累积分布`;
  const option = { animation: false, grid: { left: 85, right: 40, top: 45, bottom: 65 }, textStyle: { fontFamily: 'Arial, Microsoft YaHei, sans-serif' },
    legend: { top: 4 }, tooltip: { trigger: 'axis', confine: true },
    xAxis: { type: 'value', name: log ? 'log10(属级丰度 % + 1)' : '属级相对丰度（%）', nameLocation: 'middle', nameGap: 32 },
    yAxis: { type: 'value', name: '累积样本比例（%）', min: 0, max: 100 },
    series: main.groups.map(g => ({ name: `${g.group} · n=${g.points.length}`, type: 'line', step: 'end', showSymbol: false, data: ecdfPoints(g.points, log), lineStyle: { color: colors[g.group], width: 2 }, itemStyle: { color: colors[g.group] } })) };
  const footnote = `全部 ${main.groups.reduce((n, g) => n + g.points.length, 0)} 个样本；零值保留，直接使用观测值，不做密度平滑。探索性独立观测假设，未认证逐人或跨队列独立。`;
  return <ChartFrame title={title} sectioned subtitle={footnote} chartControls={<SegmentedControl role="group" aria-label="主属级分布尺度">
    <button type="button" aria-pressed={!log} onClick={() => setLog(false)}>原值</button><button type="button" aria-pressed={log} onClick={() => setLog(true)}>log10(x + 1)</button></SegmentedControl>}>
    <ResearchChartSurface option={option} world={{ width: 1000, height: 500 }} resetKey={`${evaluationId}:${log}`} label={title} height={500} exportLabel="导出主队列分布图"
      exportSpec={{ fileName: 'gmrepo-primary-genus-ecdf', buildOption: () => ({ ...option, title: [{ text: title, left: 20, top: 8 }, { text: `${footnote}\n评估 ${evaluationId}`, left: 20, bottom: 6, textStyle: { fontSize: 10, fontWeight: 'normal' } }], legend: { top: 38 }, grid: { left: 85, right: 40, top: 80, bottom: 100 } }) }} />
  </ChartFrame>;
}
