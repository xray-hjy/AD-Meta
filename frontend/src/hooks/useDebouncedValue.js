import { useEffect, useState } from 'react';

/**
 * Keep text-entry requests deliberate without delaying local input feedback.
 * The hook is shared by remote option lookups rather than coupling debounce
 * timing to one particular audit control.
 */
export default function useDebouncedValue(value, delay = 220) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}
