import CartesianEChart from '../../components/Charts/CartesianEChart';
import CollapsibleResultSection from '../../components/data-display/CollapsibleResultSection';

export function lineageSizeOption(bins, selected) {
  return {
    animation: false,
    tooltip: { trigger: 'item', renderMode: 'richText', confine: true,
      formatter: p => `${p.name} 个成员 / 簇\n${p.value} 个聚类\n点击筛选下方聚类表` },
    grid: { left: 64, right: 24, top: 36, bottom: 62 },
    xAxis: { type: 'category', data: bins.map(bin => bin.label), name: '每簇成员数', nameLocation: 'middle', nameGap: 34 },
    yAxis: { type: 'value', min: 0, minInterval: 1, name: '聚类数' },
    series: [{ type: 'bar', barMaxWidth: 64, label: { show: true, position: 'top' },
      data: bins.map(bin => ({ name: bin.label, value: bin.count, binId: bin.id,
        itemStyle: { color: selected === bin.id ? '#a44060' : '#658f9b', opacity: selected && selected !== bin.id ? .5 : 1 } })) }],
  };
}

export default function MagLineageOverview({ data, selected, onSelect, loading }) {
  const bins = data.sizeDistribution || [];
  const select = id => { if (!loading) onSelect(id === selected ? '' : id); };
  return <CollapsibleResultSection title="聚类大小分布" storageKey="admeta:mag:lineage-overview:fold" className="mag-lineage-overview"
    summary={`全部匹配 ${data.matchedTotal ?? data.total} 个聚类`}
    actions={selected ? <button type="button" className="analysis-button" onClick={() => onSelect('')}>清除分档筛选</button> : null}>
    <p className="mag-muted">统计全部匹配搜索、物种映射状态及低 ANI 条件的聚类，与表格分页无关。点击柱子或下方分档筛选聚类表；总览保留各档计数。</p>
    <CartesianEChart option={lineageSizeOption(bins, selected)} opts={{ renderer: 'svg' }} notMerge showDataTable={false} frameActions
      ariaLabel="dRep 聚类大小分布" style={{ height: 280 }}
      exportConfig={{ fileName: `ADMeta-lineage-size-${data.provenance.dataFingerprint.slice(0, 12)}`, format: 'svg', minWidth: 1100, minHeight: 640, title: '导出聚类大小分布 SVG' }}
      onEvents={{ click: p => { if (p.data?.binId) select(p.data.binId); } }} />
    <div className="mag-lineage-bins" role="group" aria-label="聚类大小分档">
      {bins.map(bin => <button key={bin.id} type="button" className="analysis-button" aria-pressed={selected === bin.id}
        disabled={loading || (!bin.count && selected !== bin.id)} onClick={() => select(bin.id)}>{bin.label} 个成员：{bin.count} 簇</button>)}
    </div>
  </CollapsibleResultSection>;
}
