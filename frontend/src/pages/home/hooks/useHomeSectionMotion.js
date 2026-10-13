import { useLayoutEffect } from 'react';
import { createSectionMotionController } from '../motion/createSectionMotionController';

export default function useHomeSectionMotion(pageRef, pinned, reducedMotion) {
  useLayoutEffect(() => {
    if (reducedMotion) return;
    const controller = createSectionMotionController(pageRef.current, pinned);
    return () => controller.dispose();
  }, [pageRef, pinned, reducedMotion]);
}
