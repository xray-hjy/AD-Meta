import { useContext, useLayoutEffect, useRef } from 'react';
import { HomeSectionContext } from './HomeSectionContext';

// The shell stays in normal document flow; animate its children, not its anchor.
export default function HomeSection({ id, snap = 'start', size = 'content', adapter, motion, anchor, children, ...props }) {
  const registry = useContext(HomeSectionContext);
  const element = useRef(null);
  useLayoutEffect(() => {
    if (!registry) throw new Error('HomeSection requires HomeSectionContext');
    return registry.register({ id, snap, adapter, motion, anchor, element: element.current });
  }, [registry, id, snap, adapter, motion, anchor]);
  return <div {...props} ref={element} className={'home-section' + (props.className ? ' ' + props.className : '')} data-home-section={id} data-section-size={size}>{children}</div>;
}
