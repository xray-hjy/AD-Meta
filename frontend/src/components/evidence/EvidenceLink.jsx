import { createContext, useContext } from 'react';
import { Link, useInRouterContext, useLocation } from 'react-router-dom';

export const EvidenceContext = createContext(null);

export function safeAnalysisReturn(value) {
  return typeof value === 'string' && /^\/analysis\/(abundance|mag)(?:[?#]|$)/.test(value)
    && !value.includes('\\') ? value : '/analysis/abundance';
}

function RoutedEvidenceLink({ subjectType = 'species', subjectId, sourceRevision, datasetSlug,
  runKey, artifactKey, context, children, onOpen, className = 'analysis-button evidence-entry' }) {
  const location = useLocation();
  const shared = useContext(EvidenceContext) || {};
  const revision = sourceRevision || shared.sourceRevision;
  if (!subjectId || !revision) return null;
  const params = new URLSearchParams({ subjectType, subjectId: String(subjectId), sourceRevision: revision,
    returnTo: safeAnalysisReturn(`${location.pathname}${location.search}`) });
  const values = { datasetSlug: datasetSlug || shared.datasetSlug, runKey: runKey || shared.runKey,
    artifactKey: artifactKey || shared.artifactKey, sourceChart: shared.sourceChart };
  Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); });
  const scope = JSON.stringify(context || shared.scope || {});
  if (scope.length <= 4000) params.set('sourceScope', scope);
  return <Link to={`/reference/gmrepo/evidence?${params}`} className={className} onClick={onOpen}>
    {children || '外部证据评估'}
  </Link>;
}

export default function EvidenceLink(props) {
  const routed = useInRouterContext();
  return routed ? <RoutedEvidenceLink {...props} /> : null;
}
