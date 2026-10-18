import { useEffect, useState } from 'react';

// Keep custom menus mounted briefly for their exit animation. Closed content is
// inert/aria-hidden at the call site, so it cannot intercept focus or selection.
export default function usePopupPresence(open) {
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) { setPresent(true); return undefined; }
    const timer = setTimeout(() => setPresent(false), 140);
    return () => clearTimeout(timer);
  }, [open]);
  return open || present;
}
