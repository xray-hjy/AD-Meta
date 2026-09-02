import { lazy, Suspense, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import LoadingState from '../../components/ui/LoadingState';
import useDatasets from '../../hooks/useDatasets';

const AbundanceWorkspacePage = lazy(() => import('../abundance/AbundanceWorkspacePage'));
const MagWorkspacePage = lazy(() => import('../mag/MagWorkspacePage'));

export default function AnalysisWorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const datasetsState = useDatasets();
  const activeDomain = searchParams.get('domain') === 'mag' ? 'mag' : 'abundance';

  const changeDomain = useCallback(domain => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      if (domain === 'mag') next.set('domain', 'mag');
      else next.delete('domain');
      return next;
    });
  }, [setSearchParams]);

  const changeDataset = useCallback(slug => {
    setSearchParams(current => {
      const next = new URLSearchParams(current);
      next.delete('domain');
      next.set('dataset', slug);
      next.set('chart', 'species');
      ['scope', 'group', 'samples', 'topN', 'q', 'log2fc', 'prevalence', 'detection', 'pcoaFilter']
        .forEach(key => next.delete(key));
      return next;
    });
  }, [setSearchParams]);

  return (
    <Suspense fallback={<LoadingState message="正在切换分析工作区..." />}>
      {activeDomain === 'mag'
        ? <MagWorkspacePage datasets={datasetsState.data} onDatasetChange={changeDataset} onDomainChange={changeDomain} />
        : <AbundanceWorkspacePage datasetsState={datasetsState} onDomainChange={changeDomain} />}
    </Suspense>
  );
}
