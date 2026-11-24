import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMagFunctions, getMagRecords } from '../../api/mag';
import ChartFrame from '../../components/Charts/ChartFrame';
import CollapsibleResultSection from '../../components/data-display/CollapsibleResultSection';
import StyledSelect from '../../components/ui/StyledSelect';
import ErrorState from '../../components/ui/ErrorState';
import LoadingState from '../../components/ui/LoadingState';
import MagFunctionalChart from './MagFunctionalChart';
import MagPhylogenyTracks from './MagPhylogenyTracks';
import { collapsiblePhylogenyHeight } from './magFunctionalGeometry';
import './mag-functional.css';

function collapsibleTreeOption(source, style) {
  return { tooltip: { trigger: 'item', show: style.hover !== false, renderMode: 'richText', formatter: p => `${p.data.name || '内部节点'}\n原始分支长度：${p.data.branchLength ?? '未提供'}` }, animation: false,
    series: [{ type: 'tree', data: [source.tree], top: 20, left: '8%', right: '30%', bottom: 30, roam: true, initialTreeDepth: 3,
      expandAndCollapse: true, symbolSize: 5, label: { show: style.labels !== false, fontSize: Number(style.fontSize), position: 'left' }, leaves: { label: { show: style.labels !== false, position: 'right' } } }] };
}

export default function MagPhylogenyWorkspace({ overview, onDetail }) {
  const revision = overview.provenance.dataFingerprint;
  const [treeId, setTreeId] = useState(''), [mode, setMode] = useState('topology'), [view, setView] = useState(overview.capabilities.metabolism ? 'tracks' : 'tree');
  const [draftFeatures, setDraftFeatures] = useState(''), [features, setFeatures] = useState('');
  const [draftQuery, setDraftQuery] = useState(''), [query, setQuery] = useState('');
  const trees = useQuery({ queryKey: ['mag', 'phylogeny', revision], queryFn: ({ signal }) => getMagRecords('phylogeny', { revision, kind: 'trees', limit: 10 }, { signal }) });
  const available = trees.data?.items;
  const current = available?.find(r => r.id === treeId) || available?.find(r => r.id === 'bacteria') || available?.[0];
  const request = { revision, namespace: 'kofam_ko', valueKind: 'count', featureIds: features, query, magIds: current?.leafIds.join(',') || '', magLimit: 1000, featureLimit: 8 };
  const matrix = useQuery({ queryKey: ['mag', 'phylogeny-tracks', request], enabled: view === 'tracks' && Boolean(current) && Boolean(overview.capabilities.metabolism),
    queryFn: ({ signal }) => getMagFunctions('matrix', request, { signal }) });
  const data = useMemo(() => current ? { ...current, matrix: matrix.data, projectionFingerprint: matrix.data?.projectionFingerprint || revision } : null, [current, matrix.data, revision]);
  const selectEvidence = r => {
    const id = r?.magId || (current.leafIds.includes(r?.name) ? r.name : '');
    if (id) onDetail?.(id, { tab: r.featureId ? 'function' : r.role === 'quality' ? 'quality' : 'taxonomy', featureId: r.featureId, namespace: 'kofam_ko' });
  };
  return <ChartFrame title="MAG 系统发育树" subtitle="IQ-TREE 原始树与同一发布的功能注释对照。" layout="document">
    {trees.error && <ErrorState message={trees.error.message} onRetry={trees.refetch} />}
    {trees.isPending ? <LoadingState /> : current && <>
      <form className="analysis-filter-form" onSubmit={e => { e.preventDefault(); setFeatures(draftFeatures); setQuery(draftQuery); }}>
        <label>树文件<StyledSelect value={current.id} onChange={e => setTreeId(e.target.value)}>{trees.data.items.map(r => <option key={r.id} value={r.id}>{r.id} · {r.leafIds.length} MAG</option>)}</StyledSelect></label>
        <label>视图<StyledSelect value={view} onChange={e => setView(e.target.value)}><option value="tree">可折叠拓扑树</option>{overview.capabilities.metabolism && <option value="tracks">树与功能轨道</option>}</StyledSelect></label>
        {view === 'tracks' && <><label>分支排布<StyledSelect value={mode} onChange={e => setMode(e.target.value)}><option value="topology">拓扑层级</option><option value="length">累计原始分支长度</option></StyledSelect></label>
          <label>功能检索<input value={draftQuery} onChange={e => setDraftQuery(e.target.value)} placeholder="KO / 描述" /></label><label>固定 KO<input value={draftFeatures} onChange={e => setDraftFeatures(e.target.value)} placeholder="逗号分隔，最多展示 8 项" /></label><button className="analysis-button analysis-button--primary" type="submit">应用功能</button></>}
      </form>
      {matrix.error && view === 'tracks' && <ErrorState message={matrix.error.message} onRetry={matrix.refetch} />}
      {view === 'tracks' && matrix.isPending ? <LoadingState /> : <CollapsibleResultSection title="系统发育与研究证据" summary={`${current.leafIds.length} 个叶节点`} storageKey="admeta:mag:phylogeny-tracks:fold">
        {view === 'tracks' ? <MagPhylogenyTracks key={current.id} data={data} mode={mode} onSelect={selectEvidence} />
          : <><MagFunctionalChart kind="phylogeny-tree" data={data} buildOption={collapsibleTreeOption} height={collapsiblePhylogenyHeight(current.leafIds.length)}
            label="MAG 可折叠拓扑树" onSelect={selectEvidence} />
          <p className="mag-muted">点击内部节点展开，拖动或滚轮调整拓扑视图。水平距离表示拓扑层级。</p></>}
      </CollapsibleResultSection>}
    </>}
  </ChartFrame>;
}
