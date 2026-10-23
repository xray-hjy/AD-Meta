import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMagFunctions, magFunctionDownloadUrl } from '../../api/mag';
import StyledSelect from '../../components/ui/StyledSelect';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';
import DataTableViewport from '../../components/data-display/DataTableViewport';
import PaginationControls from '../../components/data-display/PaginationControls';
import CollapsibleResultSection from '../../components/data-display/CollapsibleResultSection';
import MagFunctionalChart from './MagFunctionalChart';
import { geneTrackOption } from './magFunctionOptions';

export default function MagGeneEvidence({ revision, magId, namespace = '', featureId = '' }) {
  const [page, setPage] = useState(1), [contig, setContig] = useState(''), [selected, setSelected] = useState(null);
  const params = { revision, magId, namespace, featureId, contig, limit: 25, offset: (page - 1) * 25 };
  const query = useQuery({ queryKey: ['mag', 'functional-genes', params], queryFn: ({ signal }) => getMagFunctions('genes', params, { signal }) });
  const currentContig = contig || query.data?.items[0]?.contigId || '';
  const [windowStart, setWindowStart] = useState(''), [windowStop, setWindowStop] = useState('');
  const [interval, setInterval] = useState({ start: '', stop: '' });
  const trackParams = { revision, magId, contig: currentContig, ...interval, limit: 2000 };
  const track = useQuery({ queryKey: ['mag', 'functional-gene-track', trackParams], enabled: Boolean(currentContig),
    queryFn: ({ signal }) => getMagFunctions('genes', trackParams, { signal }) });
  return <div className="mag-gene-evidence">
    <div className="mag-functional-context"><strong>{featureId || '全部功能基因'}</strong><span>{magId}</span></div>
    {query.error && <ErrorState message={query.error.message} onRetry={query.refetch} />}
    {query.isPending ? <LoadingState /> : <>
      <div className="analysis-filter-form"><label>Contig<StyledSelect value={contig} onChange={e => { setContig(e.target.value); setPage(1); setInterval({ start: '', stop: '' }); }}>
        <option value="">全部 contigs</option>{query.data?.contigs.map(r => <option key={r.contigId} value={r.contigId}>{r.contigId} · {r.geneCount} 基因</option>)}
      </StyledSelect></label><a className="analysis-button" href={magFunctionDownloadUrl('genes', { revision, magId, namespace, featureId, contig })}>完整匹配基因 CSV</a></div>
      <DataTableViewport ariaLabel="功能基因证据" pagination={<PaginationControls page={page} pageCount={Math.ceil((query.data?.total || 0) / 25)} onPageChange={setPage} ariaLabel="基因分页" />}>
        <thead><tr><th>基因 ID</th><th>Contig</th><th>原坐标</th><th>链向</th></tr></thead>
            <tbody>{query.data?.items.map(r => <tr key={r.geneId}><td><button className="mag-functional-link" type="button" onClick={() => { const start = Math.max(0, Math.min(r.start, r.end) - 5000), stop = Math.max(r.start, r.end) + 5000; setSelected(r); setContig(r.contigId); setWindowStart(start); setWindowStop(stop); setInterval({ start, stop }); }}>{r.geneId}</button></td><td>{r.contigId}</td><td>{r.start}–{r.end}</td><td>{r.strand === 1 ? '+' : '−'}</td></tr>)}</tbody>
      </DataTableViewport><p className="mag-muted">共 {query.data?.total.toLocaleString()} 条匹配记录。坐标沿用 DRAM 原字段；此表不含序列。</p>
    </>}
    {currentContig && <CollapsibleResultSection title="局部基因轨道" summary={currentContig} storageKey="admeta:mag:gene-track:fold">
      <form className="analysis-filter-form" onSubmit={e => { e.preventDefault(); setInterval({ start: windowStart, stop: windowStop }); }}>
        <label>起点 bp<input type="number" min="0" value={windowStart} onChange={e => setWindowStart(e.target.value)} /></label>
        <label>终点 bp<input type="number" min={windowStart || 0} value={windowStop} onChange={e => setWindowStop(e.target.value)} /></label><button className="analysis-button" type="submit">应用区间</button></form>
      {track.error ? <ErrorState message={track.error.message} onRetry={track.refetch} /> : track.data && <>
        <MagFunctionalChart kind="gene-track" data={track.data.items} buildOption={geneTrackOption} height={300} onSelect={setSelected} label="DRAM 局部基因原始坐标" />
        <p className="mag-muted">区间内 {track.data.total} 个基因，绘制 {track.data.items.length} 个。{track.data.total > track.data.items.length ? '请缩小区间查看完整轨道。' : '当前区间基因已完整取得。'} Alt + 滚轮缩放；箭头方向来自原链向。</p>
      </>}
    </CollapsibleResultSection>}
    {selected && <section className="mag-functional-gene-fields"><h4>{selected.geneId}</h4><dl className="mag-detail-facts">
      {Object.entries(selected.evidence || {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
    </dl></section>}
  </div>;
}
