import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMagCatalog, getMagSuggestions } from '../../api/mag';
import useDebouncedValue from '../../hooks/useDebouncedValue';
import EntityAutocomplete, { EntityCombobox } from '../../components/ui/EntityAutocomplete';
import { magCatalogSuggestions, matchSuggestions } from '../../components/ui/entitySuggestions';

function useCatalog(revision, taxa) {
  const catalog = useQuery({ queryKey: ['mag', 'catalog', revision], queryFn: ({ signal }) => getMagCatalog({ revision }, { signal }), staleTime: Infinity });
  const entries = useMemo(() => magCatalogSuggestions(catalog.data?.items || [], { taxa }), [catalog.data?.items, taxa]);
  return { catalog, entries };
}

export default function MagSearchInput({ revision, value, onChange, onSelect, label, context = 'catalog', taxa = true, ...rest }) {
  return context === 'catalog'
    ? <CatalogSearch revision={revision} value={value} onChange={onChange} onSelect={onSelect} label={label} taxa={taxa} {...rest} />
    : <RemoteSearch revision={revision} context={context} value={value} onChange={onChange} onSelect={onSelect} label={label} {...rest} />;
}

function CatalogSearch({ revision, value, taxa, ...rest }) {
  const { catalog, entries } = useCatalog(revision, taxa);
  const result = useMemo(() => matchSuggestions(entries, value), [entries, value]);
  return <EntityAutocomplete {...rest} value={value} {...result} loading={catalog.isPending} error={catalog.error?.message} retry={catalog.refetch}
    note={taxa ? '完整代表 MAG 目录 · 分类 / ID' : '完整代表 MAG 目录 · 选择 ID'} />;
}

function RemoteSearch({ revision, context, value, ...rest }) {
  const [open, setOpen] = useState(false);
  const debounced = useDebouncedValue(value.trim(), 200);
  const request = { revision, context, query: debounced, limit: 20 };
  const lookup = useQuery({ queryKey: ['mag', 'suggestions', request], queryFn: ({ signal }) => getMagSuggestions(request, { signal }), enabled: open, staleTime: 60000, retry: false });
  const current = debounced === value.trim();
  return <EntityAutocomplete {...rest} value={value} onOpenChange={setOpen} items={current ? lookup.data?.items || [] : []}
    total={current ? lookup.data?.total || 0 : 0} loading={!current || lookup.isPending || lookup.isFetching}
    error={current ? lookup.error?.message : ''} retry={lookup.refetch} note={context === 'lineage' ? '完整聚类目录 · 聚类 / 代表 MAG / 物种' : '完整 crosswalk · 名称检索不改变映射证据'} />;
}

export function MagEntityPicker({ revision, ...rest }) {
  const { catalog, entries } = useCatalog(revision, false);
  return <EntityCombobox {...rest} entries={entries} loading={catalog.isPending} error={catalog.error?.message} retry={catalog.refetch} />;
}

export function MagCandidateInput({ revision, value, onChange }) {
  const [query, setQuery] = useState('');
  const ids = [...new Set(value.split(/[,;\s]+/).filter(Boolean))];
  return <div>
    <label>添加候选 MAG<MagSearchInput revision={revision} label="添加候选 MAG" value={query} onChange={setQuery} taxa={false}
      onSelect={id => { onChange([...new Set([...ids, id])].join('\n')); setQuery(''); }} placeholder="搜索分类名称或 MAG ID，选择后加入清单" /></label>
    {ids.length > 0 && <div className="entity-chip-list" aria-label="已选候选 MAG">{ids.map(id => <span key={id} className="entity-chip" title={id}>
      <span>{id}</span><button type="button" aria-label={`移除 ${id}`} onClick={() => onChange(ids.filter(value => value !== id).join('\n'))}>×</button>
    </span>)}</div>}
  </div>;
}
