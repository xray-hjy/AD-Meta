// Page-local registry: mounting order is not navigation order; DOM order is.
export function createSectionRegistry() {
  const entries = new Map(), listeners = new Set();
  const notify = () => listeners.forEach(listener => listener());
  let orderObserver = null;
  function observeOrder() {
    orderObserver?.disconnect();
    if (!entries.size || typeof MutationObserver === 'undefined') return;
    orderObserver ||= new MutationObserver(notify);
    // Only direct siblings matter. Swiper's internal DOM is not observed.
    const parents = new Set([...entries.values()].map(entry => entry.element.parentElement).filter(Boolean));
    for (const parent of parents) orderObserver.observe(parent, { childList: true });
  }
  return {
    register(entry) {
      if (entries.has(entry.id)) throw new Error(`Duplicate home section: ${entry.id}`);
      entries.set(entry.id, entry); observeOrder(); notify();
      return () => { if (entries.get(entry.id) === entry) { entries.delete(entry.id); observeOrder(); notify(); } };
    },
    sections() {
      return [...entries.values()].sort((a, b) => a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
