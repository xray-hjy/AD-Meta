import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CartesianEChart from '../../components/Charts/CartesianEChart';
import ChartStyleToolbar from '../../components/Charts/ChartStyleToolbar';
import useChartStylePreferences from '../../components/Charts/useChartStylePreferences';
import { useChartFrameToolbarTarget } from '../../components/Charts/ChartFrameActionsContext';
import { DEFAULT_RESEARCH_STYLE, decorateResearchOption, researchFields } from './magResearchStyle';
import { resolveResearchPalette } from './magResearchPalettes';
const EMPTY_SELECTION = [];

export default function MagResearchChart({ kind, buildOption, data, exportConfig, onSelect, onBrush, selected = EMPTY_SELECTION, height = 480 }) {
  const preferences = useChartStylePreferences(`mag-research-${kind}`);
  const values = { ...DEFAULT_RESEARCH_STYLE, ...(kind === 'taxonomy' ? { labels: true, palette: 'brewer-paired' } : {}), ...preferences.values };
  values.palette = resolveResearchPalette(kind, values).value;
  const ref = useRef(null);
  const target = useChartFrameToolbarTarget();
  const [interaction, setInteraction] = useState(null);
  const [annotation, setAnnotation] = useState(null);
  const [brushing, setBrushing] = useState(false);
  const option = useMemo(() => {
    const styled = decorateResearchOption(buildOption(data, preferences.values), kind,
      { ...(kind === 'taxonomy' ? { labels: true } : {}), ...preferences.values }, [...selected, ...(annotation?.source === data ? annotation.ids : [])]);
    const current = interaction?.source === data ? interaction : null;
    return { ...styled, ...(styled.legend ? { legend: { ...styled.legend, selected: current?.legend || Object.fromEntries(styled.series.map(series => [series.name, true])) } } : {}),
      ...(kind === 'taxonomy' ? {} : { dataZoom: [{ type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomOnMouseWheel: 'alt',
        start: current?.start ?? 0, end: current?.end ?? 100 }],
        brush: { toolbox: [], brushMode: 'single', xAxisIndex: 0, yAxisIndex: 0, brushType: 'rect', throttleType: 'debounce', throttleDelay: 80,
          inBrush: { opacity: 1 }, outOfBrush: { opacity: 0.25 } } }) };
  }, [buildOption, data, kind, preferences.values, selected, interaction, annotation]);
  const instance = () => ref.current?.getEchartsInstance?.();
  const clear = () => { instance()?.dispatchAction({ type: 'brush', areas: [] }); instance()?.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: false } }); setBrushing(false); onBrush?.([]); };
  const tools = <ChartStyleToolbar label="图形样式" fields={researchFields(kind, values)} values={values}
    onChange={preferences.update} onReset={() => { preferences.reset(); setInteraction(null); setAnnotation(null); clear(); }} />;
  return <section className="mag-research-chart">
    {target ? createPortal(tools, target) : tools}
    {kind !== 'taxonomy' && <div className="mag-research-chart__actions">
      {onBrush && <><button type="button" className={`analysis-button ${brushing ? 'analysis-button--primary' : ''}`} aria-pressed={brushing}
        onClick={() => { const next = !brushing; setBrushing(next); instance()?.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: next ? 'rect' : false } }); }}>框选 MAG</button>
        <button type="button" className="analysis-button" onClick={clear}>清除框选</button></>}
      <button type="button" className="analysis-button" onClick={() => setInteraction(null)}>恢复视图</button>
      <span>Alt + 滚轮局部缩放{onBrush ? ' · 框选只定位列表，不改变分析结果' : ''}</span>
    </div>}
    <CartesianEChart ref={ref} option={option} opts={{ renderer: 'svg' }} replaceMerge={['series']} frameActions showDataTable={false}
      exportConfig={{ ...exportConfig, prepareOption: exported => ({ ...exported, brush: undefined, dataZoom: undefined, tooltip: { show: false } }) }} style={{ height }} ariaLabel={`MAG ${kind} 研究图表`}
      onEvents={{ click: p => { const id = p.data?.magId || p.data?.details?.magId || p.name; if (p.componentType && p.componentType !== 'series') return;
          setAnnotation({ source: data, ids: [id] }); onSelect?.(id); },
        legendselectchanged: event => setInteraction(current => ({ ...(current?.source === data ? current : {}), source: data, legend: event.selected })),
        datazoom: () => { const zoom = instance()?.getOption().dataZoom?.[0]; if (zoom) setInteraction(current => ({ ...(current?.source === data ? current : {}), source: data, start: zoom.start, end: zoom.end })); },
        brushselected: event => {
          const selection = event.batch?.[0]?.selected || [];
          const ids = selection.flatMap(s => s.dataIndex.map(index => option.series[s.seriesIndex]?.data[index]?.magId || option.series[s.seriesIndex]?.data[index]?.details?.magId)).filter(Boolean);
          onBrush?.(ids);
        } }} />
  </section>;
}
