import StyledSelect from '../../components/ui/StyledSelect';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMagCatalog } from '../../api/mag';
import ClientDataTable from '../../components/data-display/ClientDataTable';
import LoadingState from '../../components/ui/LoadingState';
import ErrorState from '../../components/ui/ErrorState';
import MagSearchInput from './MagSearchInput';

const number = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumSignificantDigits: 4 });
const integer = value => value == null ? '—' : Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
export default function MagCatalogExplorer({ revision, kind, rank, taxon, shownTaxa = [], selected = [], onSelect }) {
  const [query, setQuery] = useState('');
  const [band, setBand] = useState('all');
  const catalog = useQuery({ queryKey: ['mag', 'catalog', revision], queryFn: ({ signal }) => getMagCatalog({ revision }, { signal }), staleTime: Infinity });
  const rows = useMemo(() => {
    const exactId = catalog.data?.items.some(row => row.magId.toLowerCase() === query.trim().toLowerCase());
    return (catalog.data?.items || []).filter(row => {
    const label = row.taxonomy?.[rank] || `未解析至 ${rank}`;
    const matchesTaxon = !taxon || (taxon === '其他分类' ? !shownTaxa.includes(label) : label === taxon);
    const matchesBand = band === 'all' || (band === 'reference' ? row.quality?.inReferenceBand : !row.quality?.inReferenceBand);
    const searchable = `${row.magId} ${Object.values(row.taxonomy || {}).join(' ')}`.toLowerCase();
    return matchesTaxon && matchesBand && (!selected.length || selected.includes(row.magId))
      && (exactId ? row.magId.toLowerCase() === query.trim().toLowerCase() : searchable.includes(query.trim().toLowerCase()));
  }); }, [catalog.data, rank, taxon, shownTaxa, selected, query, band]);
  return <section className="mag-catalog-explorer" aria-label="目录 MAG 明细">
    <div className="mag-section-heading"><div><span className="mag-kicker">目录证据 · 点击 MAG 查看详情</span><h3>{taxon || (kind === 'quality' ? '质量与组装明细' : '分类成员')}</h3></div><span>{rows.length} 个 MAG{selected.length ? ' · 来自框选' : ''}</span></div>
    <div className="analysis-filter-form"><label>检索目录<MagSearchInput revision={revision} label="检索目录 MAG" value={query} onChange={setQuery} placeholder="MAG ID / 分类名称" /></label>
      {kind === 'quality' && <label>参考区间<StyledSelect aria-label="质量参考区间筛选" value={band} onChange={event => setBand(event.target.value)}><option value="all">全部代表 MAG</option><option value="reference">完整度≥90% 且污染率≤5%</option><option value="remaining">其余已筛选代表 MAG</option></StyledSelect></label>}
    </div>
    {catalog.isPending ? <LoadingState message="正在读取目录证据…" /> : catalog.error ? <ErrorState message={catalog.error.message} onRetry={catalog.refetch} /> : rows.length === 0 ? <p role="status">当前筛选没有匹配的 MAG。</p> : <ClientDataTable rows={rows} ariaLabel="分类与质量 MAG 列表"
      renderRow={row => <tr key={row.magId}><td><button type="button" className="analysis-text-button" onClick={() => onSelect(row.magId)}>{row.magId}</button></td>
        <td>{row.taxonomy?.species || row.taxonomy?.genus || '未解析至属/种'}</td><td>{number(row.quality?.completenessPercent)}</td><td>{number(row.quality?.contaminationPercent)}</td>
        <td>{integer(row.quality?.contigN50Bp)}</td><td>{integer(row.quality?.genomeSizeBp)}</td><td>{integer(row.quality?.totalContigs)}</td><td>{row.quality?.gcContent == null ? '—' : number(row.quality.gcContent * 100)}</td></tr>}>
      <thead><tr>{['MAG ID', 'GTDB 分类', '完整度 %', '污染率 %', 'N50 bp', '基因组 bp', 'Contigs', 'GC %'].map(label => <th key={label}>{label}</th>)}</tr></thead>
    </ClientDataTable>}
  </section>;
}
