import { useEffect, useState } from 'react';

const DEFAULT_SIZE = { width: 0, height: 0 };

export default function useAvailableViewport(ref, {
  minHeight = 620,
  maxHeight = 1120,
  bottomMargin = 20,
} = {}) {
  const [size, setSize] = useState(DEFAULT_SIZE);

  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;

    let frameId = null;
    const measure = () => {
      if (frameId != null) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const availableHeight = window.innerHeight - rect.top - bottomMargin;
        const nextSize = {
          width: Math.max(0, Math.floor(rect.width)),
          height: Math.max(minHeight, Math.min(maxHeight, Math.floor(availableHeight))),
        };
        setSize(current => (
          current.width === nextSize.width && current.height === nextSize.height
            ? current
            : nextSize
        ));
      });
    };

    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    measure();

    return () => {
      if (frameId != null) window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [bottomMargin, maxHeight, minHeight, ref]);

  return size;
}
