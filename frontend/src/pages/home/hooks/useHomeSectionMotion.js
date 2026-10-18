import { useEffect } from 'react';
import { createSectionMotionController } from '../motion/createSectionMotionController';

export default function useHomeSectionMotion(pageRef, pinned, reducedMotion, registry) {
  useEffect(() => {
    if (reducedMotion) return;
    const controller = createSectionMotionController(pageRef.current, pinned, registry);
    return () => controller.dispose();
  }, [pageRef, pinned, reducedMotion, registry]);
}
