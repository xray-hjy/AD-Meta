import { useCallback, useSyncExternalStore } from 'react';
import { HOME_MOTION } from '../motion/motionConfig';

const pinnedQuery = `(min-width: ${HOME_MOTION.desktopWidth}px) and (min-height: ${HOME_MOTION.minimumHeight}px) and (prefers-reduced-motion: no-preference)`;
const reduceQuery = '(prefers-reduced-motion: reduce)';
function useMedia(query) {
  const subscribe = useCallback(callback => {
    const media = window.matchMedia?.(query);
    media?.addEventListener('change', callback);
    return () => media?.removeEventListener('change', callback);
  }, [query]);
  const getSnapshot = useCallback(() => window.matchMedia?.(query).matches || false, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
export default function useHomeEnvironment() {
  return { pinned: useMedia(pinnedQuery), reducedMotion: useMedia(reduceQuery) };
}
