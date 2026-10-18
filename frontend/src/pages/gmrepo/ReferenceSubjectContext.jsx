import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { resolveGmrepoSubject } from '../../api/gmrepo';
import { referenceHref, subjectHref, withoutSubject } from './referenceNavigation';

export default function ReferenceSubjectContext({ params, revision }) {
  const subjectId = params.get('subjectId') || params.get('analysisGenus') || '';
  const request = { subjectType: params.get('subjectType') || 'genus', subjectId, sourceRevision: params.get('sourceRevision') || '', revision,
    datasetSlug: params.get('datasetSlug') || 'ad-nc-species', runKey: params.get('runKey') || '', artifactKey: params.get('artifactKey') || '' };
  const state = useQuery({ queryKey: ['gmrepo', 'subject', request], enabled: !!subjectId && !!revision, retry: false,
    queryFn: ({ signal }) => resolveGmrepoSubject(request, { signal }) });
  if (!subjectId) return null;
  return <section className="reference-subject-context" aria-label="当前研究对象">
    <div><span>{request.subjectType === 'genus' ? '当前参考菌属' : '来自主分析的研究对象'}</span><strong>{state.data?.subjectName || subjectId}</strong>
      <small>{state.isPending ? '正在核对固定版本…' : state.error ? '对象读取失败；未替换为其他菌属' : state.data?.status === 'mapped' ? `${state.data.genus.name} · 属级外部背景` : state.data?.reasons.join(' ')}</small>
      {request.sourceRevision ? <small className="reference-context-version" title={request.sourceRevision}>主版本 {request.sourceRevision}</small> : null}</div>
    <div className="reference-context-actions"><Link className="analysis-button" to={subjectHref(params)}>继续对象评估 →</Link><Link to={referenceHref(withoutSubject(params))}>退出对象上下文</Link></div>
  </section>;
}
