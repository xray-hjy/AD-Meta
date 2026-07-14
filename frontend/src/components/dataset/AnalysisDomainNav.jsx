import {
  ANALYSIS_DOMAINS,
  getAnalysisDomainForFeatureKind,
  getDatasetForDomain,
} from '../../app/analysisDomains';

export default function AnalysisDomainNav({
  datasets = [],
  featureKind = 'taxonomy',
  onDatasetChange,
}) {
  const activeDomain = getAnalysisDomainForFeatureKind(featureKind);

  return (
    <div className="analysis-domain-list" aria-label="分析模块">
      {ANALYSIS_DOMAINS.map(domain => {
        const dataset = getDatasetForDomain(datasets, domain);
        const planned = domain.status === 'planned';
        const disabled = planned || !dataset;
        const active = activeDomain.key === domain.key;

        return (
          <button
            key={domain.key}
            type="button"
            className={`analysis-domain ${active ? 'analysis-domain--active' : ''}`}
            disabled={disabled}
            aria-disabled={disabled}
            aria-current={active ? 'page' : undefined}
            title={planned ? `${domain.label}：规划中` : domain.description}
            onClick={() => dataset && onDatasetChange(dataset.slug)}
          >
            <span className="analysis-domain__mark" aria-hidden="true" />
            <span className="analysis-domain__body">
              <span className="analysis-domain__label">{domain.label}</span>
              <span className="analysis-domain__hint">
                {planned ? '规划中' : active ? '当前分析域' : '切换数据域'}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
