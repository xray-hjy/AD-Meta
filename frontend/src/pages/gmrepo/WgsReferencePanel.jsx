import { lazy, Suspense, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { fetchJson } from '../../api/client';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';
import { useColorVision } from '../../context/ColorVisionContext';

const CartesianEChart = lazy(() => import('../../components/Charts/CartesianEChart'));
const names = { preclinical_AD: '临床前 AD', biomarker_negative_CN: '生物标志物阴性 CN' };

function Distribution({ data }) {
  const { colorBlindFriendly } = useColorVision();
  const option = useMemo(() => ({
    animation: false, grid: { left: 65, right: 22, top: 30, bottom: 60 },
    tooltip: { trigger: 'item', formatter: item => `${names[item.seriesName]}<br/>相对丰度 ${Number(item.value[1]).toPrecision(4)}%` },
    xAxis: { type: 'category', data: data.groups.map(g => names[g.group]), axisLabel: { interval: 0 } },
    yAxis: { type: 'value', name: '相对丰度（%）', min: 0 },
    series: data.groups.map((group, index) => ({ type: 'scatter', name: group.group, symbolSize: 5,
      itemStyle: { color: (colorBlindFriendly ? ['#d55e00', '#0072b2'] : ['#ee8f40', '#3986c4'])[index], opacity: .65 },
      data: group.points.map(point => [index, point.value]) })),
  }), [data, colorBlindFriendly]);
  return <><Suspense fallback={<LoadingState />}><CartesianEChart option={option} notMerge showDataTable={false} ariaLabel={`${data.feature.name} 临床前阶段 WGS 相对丰度分布`} style={{ height: 320 }} /></Suspense>
    <div className="gmrepo-table-scroll"><table><thead><tr><th>原研究分组</th><th>参与者</th><th>检出</th><th>中位相对丰度</th></tr></thead><tbody>{data.groups.map(group => <tr key={group.group}><th>{names[group.group]}</th><td>{group.count}</td><td>{group.detected}</td><td>{group.median.toLocaleString('zh-CN', { maximumSignificantDigits: 4 })}%</td></tr>)}</tbody></table></div><p className="gmrepo-note">每个点对应一名原研究匿名参与者，重合点可能遮挡；完整分母、零值和中位数见表。{data.note}</p></>;
}

export function FrozenWgsReference({ record }) {
  if (!record?.catalog) return null;
  return <section className="gmrepo-panel reference-wgs" aria-label="当前对象的 WGS 阶段参考"><div className="gmrepo-panel-heading"><h2>WGS · 相关阶段参考</h2><p>{record.catalog.projectId} · 原研究直接来源，不计入上方 GMrepo 队列。</p></div>
    <p>{record.mappingMethod}</p>{record.distribution ? <><h3>{record.distribution.feature.name} · {record.distribution.feature.level === 'genus' ? '属级背景' : '原研究物种'}</h3><Distribution data={record.distribution} /></> : <p>当前参考属未在此版本找到唯一精确名称对应；未默认替换其他特征。</p>}
    <p className="gmrepo-note">这是同一固定评估中保存的阶段参考，不认证当前主物种/MAG，也不与临床 AD/NC 合并。</p><a href={record.catalog.sourceUrl} target="_blank" rel="noreferrer">作者处理数据 ↗</a> · <a href={record.catalog.studyUrl} target="_blank" rel="noreferrer">原研究 ↗</a></section>;
}

export default function WgsReferencePanel() {
  const [params, setParams] = useSearchParams();
  const query = params.get('wgsQuery') || '';
  const level = params.get('wgsLevel') === 'species' ? 'species' : 'genus';
  const feature = params.get('wgsFeature') || '';
  const catalog = useQuery({ queryKey: ['gmrepo', 'wgs', query, level], retry: false,
    queryFn: ({ signal }) => fetchJson(`/api/references/gmrepo/wgs-reference?${new URLSearchParams({ query, level })}`, { signal }) });
  const revision = catalog.data?.fingerprint;
  const dist = useQuery({ queryKey: ['gmrepo', 'wgs-distribution', revision, feature], enabled: !!revision && !!feature, retry: false,
    queryFn: ({ signal }) => fetchJson(`/api/references/gmrepo/wgs-distribution?${new URLSearchParams({ feature, revision })}`, { signal }) });
  const update = changes => setParams(current => { const next = new URLSearchParams(current); Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); return next; }, { replace: true });
  const data = catalog.data;
  return <section className="gmrepo-panel reference-wgs"><div className="gmrepo-panel-heading"><h2>WGS 扩展参考</h2><p>与 GMrepo 共用研究评估入口，来源渠道和疾病阶段分别标注。</p></div>
    {catalog.isPending ? <LoadingState /> : catalog.error ? <ErrorState message={catalog.error.message} onRetry={catalog.refetch} /> : data ? <>
      <h3>{data.projectId} · 临床前 AD 研究</h3><p>原研究直接来源 · MetaPhlAn3 · {data.sampleCount} 名参与者：临床前 AD {data.groupCounts.preclinical_AD}，生物标志物阴性 CN {data.groupCounts.biomarker_negative_CN}。</p>
      <p>{data.featureCounts.genus} 个属、{data.featureCounts.species} 个物种层原分类特征；另有 {data.excludedProfileOnlyCount} 份 profile 无对应纳入元数据，未混入分母。</p>
      <p className="gmrepo-note">此处为原研究直接提供的临床前阶段参考，不是 GMrepo WGS 数据。当前仅描述分布；跨研究及主外参与者独立性尚未确立，不提供新 WGS p/q。</p>
      <div className="reference-wgs-controls"><label>特征层级<select aria-label="特征层级" value={level} onChange={e => update({ wgsLevel: e.target.value, wgsFeature: null })}><option value="genus">属</option><option value="species">物种（原分类版本）</option></select></label><label>查找原研究特征<input type="search" aria-label="查找原研究特征" value={query} onChange={e => update({ wgsQuery: e.target.value, wgsFeature: null })} placeholder="名称检索，不按显著性筛选" /></label><label>选择特征<select aria-label="选择特征" value={feature} onChange={e => update({ wgsFeature: e.target.value })}><option value="">明确选择后查看分布</option>{data.items.map(f => <option key={f.featureId} value={f.featureId}>{f.name}</option>)}</select></label></div>
      <p className="gmrepo-note">匹配 {data.total} 项，展示前 100 项；请按名称缩小范围。选择和检索不改变原研究分母。</p>
      {feature ? dist.isPending ? <LoadingState /> : dist.error ? <ErrorState message={dist.error.message} onRetry={dist.refetch} /> : dist.data ? <><h3>{dist.data.feature.name}</h3><Distribution data={dist.data} /></> : null : null}
      <details><summary>来源、处理与用途限制</summary><p><a href={data.sourceUrl} target="_blank" rel="noreferrer">作者公开数据 ↗</a> · <a href={data.studyUrl} target="_blank" rel="noreferrer">原论文 ↗</a></p><p>{data.title}</p><p>处理：{data.processingVersion}；版本：{data.fingerprint}</p><ul>{data.limits.map(text => <li key={text}>{text}</li>)}</ul><p>{data.extraction.featureSelection}</p><p>来源许可登记：{data.access?.declaredLicense}。{data.access?.note}</p><p>本分支不使用来源显著性表挑选特征；HUMAnN 通路并非 KO，不自动接到群落 KO 或 MAG 功能。</p></details>
    </> : null}</section>;
}
