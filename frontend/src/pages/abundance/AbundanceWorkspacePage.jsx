import AnalysisWorkspace from '../../app/App';

export default function AbundanceWorkspacePage({ datasetsState, onDomainChange }) {
  return <AnalysisWorkspace datasetsState={datasetsState} onDomainChange={onDomainChange} />;
}
