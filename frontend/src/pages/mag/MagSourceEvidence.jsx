import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMagSources, magSourceDownloadUrl } from '../../api/mag';
import MagDisclosure from './MagDisclosure';
import { MAG_MODULE_LABELS, MAG_OVERVIEW_COPY as COPY } from './magOverviewContent';

function SourceFiles({ files, module, revision }) {
  const [limit, setLimit] = useState(5);
  const [copied, setCopied] = useState('');
  const [copyError, setCopyError] = useState(false);
  return <><ul className="mag-evidence__files">{files.slice(0, limit).map(file => <li key={file.file}>
    <div className="mag-evidence__filename"><code>{file.file}</code><a href={magSourceDownloadUrl(module, file.index, revision)} download>{COPY.sourceDownload} ↗</a></div>
    <div className="mag-evidence__hash"><span>{Number(file.bytes).toLocaleString('en-US')} B</span><code title="SHA-256">{file.sha256}</code>
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(file.sha256); setCopied(file.file); setCopyError(false); } catch { setCopyError(true); } }}>{copied === file.file ? COPY.copied : COPY.copyHash}</button></div>
  </li>)}</ul>{copyError && <p role="status">{COPY.copyFailed}</p>}
    {files.length > limit && <button type="button" className="mag-overview-link" onClick={() => setLimit(n => n + 10)}>{COPY.showMore}（{limit} / {files.length}）</button>}</>;
}

export default function MagSourceEvidence({ revision, modules, scripts }) {
  const query = useQuery({ queryKey: ['mag', 'source-inventory', revision],
    queryFn: ({ signal }) => getMagSources(revision, { signal }), staleTime: Infinity });
  if (query.isPending) return <p role="status">{COPY.sourceLoading}</p>;
  if (query.isError) return <p role="alert">{COPY.sourceError}：{query.error.message} <button type="button" className="mag-overview-link" onClick={() => query.refetch()}>{COPY.retry}</button></p>;
  const inventory = query.data.modules || {};
  const selectedScripts = scripts?.map(key => inventory.methodology?.report?.scripts?.[key]?.file).filter(Boolean);
  const groups = Object.entries(inventory).flatMap(([module, info]) => {
    if (modules && module !== 'methodology' && !modules.includes(module)) return [];
    const files = (info.files || []).map((file, index) => ({ ...file, index }))
      .filter(file => module !== 'methodology' || !scripts || selectedScripts.includes(file.file));
    return files.length ? [{ module, files }] : [];
  });
  return <div className="mag-evidence"><p className="mag-evidence__scope">{COPY.sourceScope}</p>
    {groups.length ? groups.map(({ module, files }) => <MagDisclosure key={module} title={`${MAG_MODULE_LABELS[module] || module} · ${files.length} 个文件`}>
      <SourceFiles files={files} module={module} revision={revision} />
    </MagDisclosure>) : <p>{COPY.noSources}</p>}
  </div>;
}
