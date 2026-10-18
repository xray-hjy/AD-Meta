import { Link, useInRouterContext, useLocation } from 'react-router-dom';

function RoutedLink({ selected, data, onOpen }) {
  const location = useLocation();
  const query = new URLSearchParams({ sourceRevision: data.datasetRevision, datasetSlug: data.datasetSlug,
    speciesIds: selected.join(','), returnTo: `${location.pathname}${location.search}` });
  return <Link className="analysis-button" to={`/reference/gmrepo/comparison?${query}`} onClick={onOpen}>对照已选 {selected.length} 个物种的属级外证</Link>;
}

export default function EvidenceBatchLink(props) {
  const routed = useInRouterContext();
  return routed && props.selected.length ? <RoutedLink {...props} /> : null;
}
