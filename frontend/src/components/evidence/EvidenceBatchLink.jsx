import { Link, useInRouterContext, useLocation } from 'react-router-dom';

function RoutedLink({ selected, data, onOpen }) {
  const location = useLocation();
  const query = new URLSearchParams({ sourceRevision: data.datasetRevision, datasetSlug: data.datasetSlug,
    speciesIds: selected.join(','), returnTo: `${location.pathname}${location.search}` });
  return <Link className="analysis-button analysis-button--primary" to={`/reference/gmrepo/comparison?${query}`} onClick={onOpen}>查看属级对照</Link>;
}

export default function EvidenceBatchLink(props) {
  const routed = useInRouterContext();
  return routed && props.selected.length ? <RoutedLink {...props} /> : <button type="button" className="analysis-button" disabled>查看属级对照</button>;
}
