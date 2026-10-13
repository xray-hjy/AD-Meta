import { useCallback, useEffect, useMemo, useRef } from 'react';
import CartesianEChart from '../../components/Charts/CartesianEChart';
import { COLORBLIND_GROUP_COLORS, GROUP_COLORS } from '../../components/Charts/groupPalette';
import { useColorVision } from '../../context/ColorVisionContext';
import { referenceChartOption } from './referenceChartOptions';

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
  const empty = kind === 'cohorts' ? !data.counts.plotReadyRuns : ['missingness', 'resolution'].includes(kind) ? !data.counts.completeProfiles : !data.counts.selectedRuns;
  useEffect(() => {
    if (!host.current) return undefined;
    const observer = new ResizeObserver(() => resize(chart.current?.getEchartsInstance?.()));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [empty, resize]);
  if (empty) return <p className="gmrepo-chart-empty">当前范围没有适用于此图的记录。零条可用记录不代表来源研究没有 AD/NC 样本。</p>;
  const rows = kind === 'resolution' ? data.resolution.length : kind === 'cohorts' ? data.cohorts.filter(c => c.plotReadyRuns).length : 6;
  return <div ref={host} className="gmrepo-chart-host"><CartesianEChart ref={chart} option={option} opts={{ renderer: 'svg' }} notMerge showDataTable={false}
    onChartReady={resize} ariaLabel={title} style={{ height: Math.max(250, rows * 33 + 85) }} /></div>;
}
