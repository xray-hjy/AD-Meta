import { useCallback, useLayoutEffect, useRef } from 'react';
import { createIntroController } from '../motion/createIntroController';

export default function useHomeIntro(pageRef, reducedMotion) {
  const controller = useRef(null);
  useLayoutEffect(() => {
    const instance = createIntroController(pageRef.current, reducedMotion);
    controller.current = instance;
    return () => { instance.dispose(); controller.current = null; };
  }, [pageRef, reducedMotion]);
  return {
    replay: useCallback(() => controller.current?.replay(), []),
    replayLogo: useCallback(() => controller.current?.replayLogo(), []),
    finish: useCallback(() => controller.current?.finish(), []),
  };
}
