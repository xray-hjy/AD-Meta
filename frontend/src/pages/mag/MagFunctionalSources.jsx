import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMagFunctions, getMagRecords, getMagSources, magSourceDownloadUrl, magFunctionDownloadUrl } from '../../api/mag';
import CollapsibleResultSection from '../../components/data-display/CollapsibleResultSection';
import DataTableViewport from '../../components/data-display/DataTableViewport';
import PaginationControls from '../../components/data-display/PaginationControls';
import StyledSelect from '../../components/ui/StyledSelect';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';
import MagFunctionalChart from './MagFunctionalChart';
import { functionBarOption, functionMatrixOption, geneTrackOption } from './magFunctionOptions';

const fmt = n => n == null ? '—' : Number(n).toLocaleString('en-US', { maximumSignificantDigits: 4 });

export default function MagFunctionalSources({ module, revision, overview, initialMagId, onDetail }) {
  const arg = module === 'arg';
  const storageKey = `admeta:mag:functional-source:${revision}:${module}`;
  const [saved] = useState(() => { try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null') || {}; } catch { return {}; } });
  const [category, setCategory] = useState(saved.category || 'known_hmm_hit'), [mag, setMag] = useState(saved.initialMagId === initialMagId ? saved.mag || '' : initialMagId || '');
  const [draftMag, setDraftMag] = useState(mag), [query, setQuery] = useState(saved.query || ''), [draftQuery, setDraftQuery] = useState(saved.query || '');
  const [page, setPage] = useState(saved.page || 1), [magLimit, setMagLimit] = useState(saved.magLimit || 40), [featureLimit, setFeatureLimit] = useState(saved.featureLimit || 30);
  const [selected, setSelected] = useState(null), [plot, setPlot] = useState(saved.plot || 'matrix');
  useEffect(() => { try { sessionStorage.setItem(storageKey, JSON.stringify({ category, mag, query, page, magLimit, featureLimit, plot, initialMagId })); } catch { /* Optional state. */ } }, [storageKey, category, mag, query, page, magLimit, featureLimit, plot, initialMagId]);
  const matrix = useQuery({ queryKey: ['mag', 'functional-source-matrix', revision, module, category, magLimit, featureLimit],
    queryFn: ({ signal }) => getMagFunctions(`sources/${module}/matrix`, { revision, category, magLimit, featureLimit }, { signal }) });
  const metric = arg ? category === 'known_hmm_hit' ? 'knownHits' : category === 'novel095' ? 'novel095' : 'novel075' : 'regionCount';
  const ranking = useQuery({ queryKey: ['mag', 'functional-source-ranking', revision, module, metric, magLimit], enabled: plot === 'ranking',
    queryFn: ({ signal }) => getMagRecords(module, { revision, kind: arg ? 'arg_summary' : 'bgc_status', rankBy: metric, limit: magLimit }, { signal }) });
  const params = { revision, magId: mag, query, category: arg ? category : '', limit: 25, offset: (page - 1) * 25 };
  const details = useQuery({ queryKey: ['mag', 'functional-source-details', module, params],
    queryFn: ({ signal }) => getMagFunctions(`sources/${module}/details`, params, { signal }) });
  const tracks = useQuery({ queryKey: ['mag', 'functional-bgc-track', revision, mag], enabled: !arg && Boolean(mag),
    queryFn: ({ signal }) => getMagFunctions('sources/bgc/details', { revision, magId: mag, limit: 2000 }, { signal }) });
  const sources = useQuery({ queryKey: ['mag', 'sources', revision], enabled: Boolean(selected) && !arg,
    queryFn: ({ signal }) => getMagSources(revision, { signal }), staleTime: Infinity });
  const files = sources.data?.modules?.bgc?.files || [];
  const sourceIndex = selected ? files.findIndex(r => r.file.includes(`/${selected.magId}/`) && r.file.endsWith(`/${selected.sourceName}`)) : -1;
  const report = overview.provenance.modules[module] || {};
  const buildRanking = (data, style) => functionBarOption(data.items, style, metric, arg ? '蛋白命中 / 候选数' : '唯一 BGC 区域数');
  const buildRegions = (data, style) => geneTrackOption(data.items, style, true);
  const pick = row => { if (row?.magId) { setMag(row.magId); setDraftMag(row.magId); setPage(1); setSelected(null); } };
  return <>
    <div className="analysis-filter-form mag-functional-source-controls">
      {arg && <label>证据类型<StyledSelect value={category} onChange={e => { setCategory(e.target.value); setPage(1); setSelected(null); }}><option value="known_hmm_hit">ARG HMM 命中</option><option value="novel_candidate">新候选 passed_0.75</option><option value="novel095">新候选 passed_0.95</option></StyledSelect></label>}
      <label>图形<StyledSelect value={plot} onChange={e => setPlot(e.target.value)}><option value="matrix">MAG × 类型矩阵</option><option value="ranking">MAG 数量排名</option></StyledSelect></label>
      <label>展示 MAG<StyledSelect value={magLimit} onChange={e => setMagLimit(Number(e.target.value))}>{[20, 40, 80, 100, 200].map(n => <option key={n}>{n}</option>)}</StyledSelect></label>
      <label>展示类型<StyledSelect value={featureLimit} onChange={e => setFeatureLimit(Number(e.target.value))}>{[10, 20, 30, 60, 100].map(n => <option key={n}>{n}</option>)}</StyledSelect></label>
    </div>
    <div className="mag-functional-context">{arg ? <><span>HMM 命中 {fmt(report.knownHits)}</span><span>新候选 0.75 / 0.95：{fmt(report.novel075)} / {fmt(report.novel095)}</span></>
      : <><span>唯一 BGC 区域 {fmt(report.regionCount)}</span><span>未完整提供的 MAG {fmt(report.incompleteMags)}</span></>}</div>
    <CollapsibleResultSection title={arg ? 'ARG 功能证据' : 'BGC 合成潜力'} summary={plot === 'matrix' ? '完整目录的展示集合' : '按唯一对象计数排名'} storageKey={`admeta:mag:${module}:${plot}:fold`}>
      {matrix.error || ranking.error ? <ErrorState message={(matrix.error || ranking.error).message} onRetry={() => { matrix.refetch(); if (plot === 'ranking') ranking.refetch(); }} /> : null}
      {plot === 'matrix' ? matrix.data ? <MagFunctionalChart kind={`${module}-matrix`} data={matrix.data} buildOption={functionMatrixOption} camera onSelect={pick} /> : <LoadingState />
        : ranking.data ? <MagFunctionalChart kind={`${module}-ranking`} data={ranking.data} buildOption={buildRanking} onSelect={pick} /> : <LoadingState />}
      <p className="mag-muted">{arg ? 'HMM 命中与模型候选分别展示。0.95 是 0.75 候选的子集，passed 沿用来源，不重算为概率阈值。' : '一个 region 可有多个 product 标签；类型计数之和不等于唯一区域数。成功零命中与结果不完整分别显示。'} 编码潜力不等于表达、表型或产物量。</p>
    </CollapsibleResultSection>
    <form className="analysis-filter-form" onSubmit={e => { e.preventDefault(); setMag(draftMag.trim()); setQuery(draftQuery.trim()); setPage(1); setSelected(null); }}>
      <label>MAG ID<input value={draftMag} onChange={e => setDraftMag(e.target.value)} placeholder="完整 MAG ID，留空为全部" /></label><label>命中 / 产品检索<input value={draftQuery} onChange={e => setDraftQuery(e.target.value)} /></label>
      <button className="analysis-button analysis-button--primary" type="submit">查看明细</button><button className="analysis-button" type="button" onClick={() => { setMag(''); setDraftMag(''); setQuery(''); setDraftQuery(''); setPage(1); }}>全部结果</button>
      {mag && <button className="analysis-button" type="button" onClick={() => onDetail(mag, { tab: 'function' })}>MAG 研究证据</button>}
    </form>
    <CollapsibleResultSection title={arg ? 'ARG 蛋白记录' : 'BGC 区域记录'} summary={`${details.data?.total ?? '…'} 条`} storageKey={`admeta:mag:${module}:details:fold`}
      actions={<a className="analysis-button" href={magFunctionDownloadUrl(module, { revision, magId: mag, query, category: arg ? category : '' })}>完整匹配 CSV</a>}>
      {details.error ? <ErrorState message={details.error.message} onRetry={details.refetch} /> : details.isPending ? <LoadingState /> : <DataTableViewport ariaLabel={`${module} 完整记录`} pagination={<PaginationControls page={page} pageCount={Math.ceil(details.data.total / 25)} onPageChange={setPage} ariaLabel={`${module} 分页`} />}>
        <thead><tr>{(arg ? ['MAG', '蛋白', '类别', '命中名称', '模型分数'] : ['MAG', 'Contig / 区域', 'Product', '原坐标', '区域 CDS']).map(name => <th key={name}>{name}</th>)}</tr></thead>
        <tbody>{details.data.items.map(r => <tr key={r.id}><td><button className="mag-functional-link" type="button" onClick={() => pick(r)}>{r.magId}</button></td>
          {arg ? <><td><button className="mag-functional-link" type="button" onClick={() => setSelected(r)}>{r.proteinId}</button></td><td>{r.category === 'known_hmm_hit' ? 'HMM 命中' : '模型候选'}</td><td>{r.queryName}</td><td>{fmt(r.modelScore)}</td></>
            : <><td><button className="mag-functional-link" type="button" onClick={() => { pick(r); setSelected(r); }}>{r.contigId} / {r.regionNumber}</button></td><td>{r.products.join(', ')}</td><td>{r.start}–{r.end}</td><td>{r.geneCount}</td></>}</tr>)}</tbody>
      </DataTableViewport>}
    </CollapsibleResultSection>
    {!arg && mag && <CollapsibleResultSection title="BGC 区域轨道" summary={mag} storageKey="admeta:mag:bgc-track:fold">
      {tracks.error ? <ErrorState message={tracks.error.message} onRetry={tracks.refetch} /> : tracks.data && <><MagFunctionalChart kind="bgc-track" data={tracks.data} buildOption={buildRegions} onSelect={setSelected} />
        <p className="mag-muted">绘制 {tracks.data.items.length} / {tracks.data.total} 个区域。坐标为原 contig 的 0 起点半开区间，不与 DRAM 基因自动拼接。</p></>}
    </CollapsibleResultSection>}
    {selected && <section className="mag-functional-gene-fields"><h4>{arg ? selected.proteinId : `${selected.contigId} / region ${selected.regionNumber}`}</h4>
      <dl className="mag-detail-facts">{Object.entries(selected).filter(([k]) => !['genes', 'passes'].includes(k)).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd></div>)}</dl>
      {arg && <dl className="mag-detail-facts">{Object.entries(selected.passes).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v ? 'True' : 'False'}</dd></div>)}</dl>}
      {!arg && <><p>{selected.contigEdge ? '区域接触 contig 边缘。' : '来源未标记接触 contig 边缘。'}区域内基因坐标沿用 regionLocation。</p>
        {sourceIndex >= 0 && <a className="analysis-button" href={magSourceDownloadUrl('bgc', sourceIndex, revision)}>下载原始区域 GenBank</a>}
        <DataTableViewport ariaLabel="BGC 区域基因"><thead><tr><th>Locus tag</th><th>原区域位置</th></tr></thead><tbody>{selected.genes.map((r, i) => <tr key={`${r.locusTag}:${i}`}><td>{r.locusTag || '未提供'}</td><td>{r.regionLocation}</td></tr>)}</tbody></DataTableViewport></>}
    </section>}
  </>;
}
