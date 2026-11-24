import { useCallback, useEffect, useMemo, useRef } from 'react';
import CartesianEChart from '../../components/Charts/CartesianEChart';
import { COLORBLIND_GROUP_COLORS, GROUP_COLORS } from '../../components/Charts/groupPalette';
import { useColorVision } from '../../context/ColorVisionContext';
import { DECISION_CHART_HEIGHT, referenceChartOption } from './referenceChartOptions';

export default function ReferenceChart({ kind, data, title }) {
  const host = useRef(null);
  const chart = useRef(null);
  const resize = useCallback(instance => {
    const width = host.current?.clientWidth;
    if (width) instance?.resize({ width });
  }, []);
  const { colorBlindFriendly } = useColorVision();
  const colors = colorBlindFriendly ? COLORBLIND_GROUP_COLORS : GROUP_COLORS;
  const option = useMemo(() => referenceChartOption(kind, data, colors), [kind, data, colors]);
  const empty = kind === 'cohorts' ? !data.counts.plotReadyRuns : kind === 'resolution' && !data.resolution.length;
  useEffect(() => {
    if (!host.current) return undefined;
    const observer = new ResizeObserver(() => resize(chart.current?.getEchartsInstance?.()));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [empty, resize]);
  if (empty) return <p className="gmrepo-chart-empty">{kind === 'cohorts' ? '当前范围内有 0 个 Run 可用于 AD/NC 属级图表。' : '当前范围暂无可计算待解析比例的完整 profile。'}</p>;
  const height = kind === 'decisions' ? DECISION_CHART_HEIGHT
    : kind === 'cohorts' ? Math.max(178, data.cohorts.filter(c => c.plotReadyRuns).length * 25 + 76)
      : Math.max(148, data.resolution.length * 24 + 53);
  return <div ref={host} className="gmrepo-chart-host"><CartesianEChart ref={chart} option={option} opts={{ renderer: 'svg' }} notMerge showDataTable={false}
    onChartReady={resize} ariaLabel={title} style={{ height }} /></div>;
}
