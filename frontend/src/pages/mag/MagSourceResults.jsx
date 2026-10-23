import MagFunctionalWorkspace from './MagFunctionalWorkspace';
import MagPhylogenyWorkspace from './MagPhylogenyWorkspace';

export default function MagSourceResults({ overview, scope, view, initialMagId = '', onDetail, onNavigate, scopeControls }) {
  return view === 'phylogeny' ? <MagPhylogenyWorkspace overview={overview} onDetail={onDetail} />
    : <MagFunctionalWorkspace overview={overview} scope={scope} initialMagId={initialMagId} onDetail={onDetail} onNavigate={onNavigate} scopeControls={scopeControls} />;
}
