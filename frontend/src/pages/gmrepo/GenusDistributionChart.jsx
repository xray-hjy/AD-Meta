import { useCallback, useEffect, useMemo, useRef } from 'react';
import CartesianEChart from '../../components/Charts/CartesianEChart';
import { COLORBLIND_GROUP_COLORS, GROUP_COLORS } from '../../components/Charts/groupPalette';
import { useColorVision } from '../../context/ColorVisionContext';
import { distributionChartOption } from './distributionChartOption';

export default function GenusDistributionChart({ data, transform }) {
  const host = useRef(null);
  const chart = useRef(null);
  const { colorBlindFriendly } = useColorVision();
  const colors = colorBlindFriendly ? COLORBLIND_GROUP_COLORS : GROUP_COLORS;
  const option = useMemo(() => distributionChartOption(data, transform, colors), [data, transform, colors]);
  const resize = useCallback(instance => {
    const width = host.current?.clientWidth;
    if (width) instance?.resize({ width });
  }, []);
  useEffect(() => {
    if (!host.current) return undefined;
    const observer = new ResizeObserver(() => resize(chart.current?.getEchartsInstance?.()));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [resize]);
  return <div className="gmrepo-chart-host" ref={host}><CartesianEChart ref={chart} option={option} opts={{ renderer: 'svg' }}
    notMerge showDataTable={false} ariaLabel={`${data.cohort} ${data.genus.name} AD/NC 菌属丰度分布`} onChartReady={resize} style={{ height: 380 }} /></div>;
}
