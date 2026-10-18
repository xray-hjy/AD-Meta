import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createSectionSnapController } from '../motion/createSectionSnapController';

export default function useHomeSectionSnap(pageRef, registry, pinned, reducedMotion, blocked) {
  const api = useRef(null), blockedRef = useRef(blocked);
  useLayoutEffect(() => { blockedRef.current = blocked; }, [blocked]);
  useEffect(() => {
    const controller = createSectionSnapController({ page: pageRef.current, registry, reducedMotion, blocked: () => blockedRef.current });
    api.current = controller;
    return () => { controller.dispose(); api.current = null; };
  }, [pageRef, registry, pinned, reducedMotion]);
  return useMemo(() => ({
    goto: id => api.current?.goto(id),
    navigate: action => { if (api.current) api.current.navigate(action); else action(); },
  }), []);
}
