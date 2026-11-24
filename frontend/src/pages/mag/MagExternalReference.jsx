import { useQuery } from '@tanstack/react-query';
import { Link, useInRouterContext, useLocation } from 'react-router-dom';
import { getGmrepoCatalog, resolveGmrepoSubject } from '../../api/gmrepo';
import EvidenceLink, { safeAnalysisReturn } from '../../components/evidence/EvidenceLink';
import ErrorState from '../../components/ui/ErrorState';
import LoadingState from '../../components/ui/LoadingState';

function ReferenceDirectoryLink({ revision, onOpen }) {
  const location = useLocation();
  const params = new URLSearchParams({ section: 'genera', revision,
    returnTo: safeAnalysisReturn(location.pathname + location.search) });
  return <Link to={`/reference/gmrepo?${params}`} className="analysis-button" onClick={onOpen}>浏览 GMrepo 参考菌属</Link>;
}

function MagReferenceResult({ magId, revision, scope, onOpen }) {
  const catalog = useQuery({ queryKey: ['gmrepo', 'catalog'], retry: false, queryFn: ({ signal }) => getGmrepoCatalog({ signal }) });
  const referenceRevision = catalog.data?.provenance.fingerprint || '';
  const request = { subjectType: 'mag', subjectId: magId, sourceRevision: revision, revision: referenceRevision,
    datasetSlug: 'ad-nc-species', runKey: '', artifactKey: '' };
  const resolved = useQuery({ queryKey: ['gmrepo', 'subject', request], enabled: !!referenceRevision, retry: false,
    queryFn: ({ signal }) => resolveGmrepoSubject(request, { signal }) });
  const result = resolved.data;
  const error = catalog.error || resolved.error;
  if (error) return <ErrorState title="菌属参考读取失败" message={error.message} onRetry={catalog.error ? catalog.refetch : resolved.refetch} />;
  if (catalog.isPending || resolved.isPending) return <LoadingState message="正在核查所属菌属的外部参考…" />;
  if (result?.subjectType !== 'mag' || result.subjectId !== magId || result.sourceRevision !== revision ||
      result.referenceRevision !== referenceRevision || result.status === 'source_unavailable' || result.status === 'source_version_mismatch') {
    return <ErrorState title="菌属参考核查失败" message={result?.reasons?.[0] || '返回的对象或版本与当前选择不一致。'} onRetry={resolved.refetch} />;
  }
  const representative = result.representativeMag;
  return <>
    {representative && representative !== magId ? <p className="mag-muted">分类对应来自聚类代表 MAG {representative}。</p> : null}
    {result.status === 'mapped' && result.genus ? <>
      <h4>所属菌属的外部参考 · {result.genus.name}</h4>
      <EvidenceLink subjectType="mag" subjectId={magId} sourceRevision={revision} referenceRevision={referenceRevision}
        context={{ scope, magId, representative, source: 'MAG 分类证据', tab: 'taxonomy' }} onOpen={onOpen} />
    </> : <>
      <h4>{result.sourceGenus ? `已核对菌属 · ${result.sourceGenus}` : result.status === 'crosswalk_unavailable' ? '当前版本的分类对应表' : 'NCBI 分类对应待核查'}</h4>
      <p>{result.reasons[0]}</p>
      {result.status === 'crosswalk_unavailable' ? null : <ReferenceDirectoryLink revision={referenceRevision} onOpen={onOpen} />}
    </>}
  </>;
}

export default function MagExternalReference({ overview, ...props }) {
  const routed = useInRouterContext();
  return <section className="mag-external-reference" aria-label="菌属参考">
    {overview.capabilities.crosswalk && routed ? <MagReferenceResult {...props} /> :
      <p>当前 MAG 发布版本尚未接入 NCBI 分类对应表。</p>}
  </section>;
}
