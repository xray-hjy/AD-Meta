import { useLayoutEffect, useRef } from 'react';

// Geometry only. The caller owns selection, focus, and any pending business value.
export default function useSlidingHighlight({ containerRef, highlightRef, selector, resetKey, observeItems = false, enabled = true }) {
  const config = useRef(null);
  const previousReset = useRef(resetKey);
  useLayoutEffect(() => { config.current = { selector, resetKey }; });
  const measureRef = useRef(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const highlight = highlightRef.current;
    if (!enabled || !container || !highlight) return undefined;
    let frame;
    const measure = () => {
      const selectors = Array.isArray(config.current.selector) ? config.current.selector : [config.current.selector];
      const target = selectors.map(item => container.querySelector(item)).find(Boolean);
      const reset = previousReset.current !== config.current.resetKey;
      previousReset.current = config.current.resetKey;
      if (!target || target.matches(':disabled, [data-disabled], [aria-disabled="true"]')) {
        highlight.style.opacity = '0';
        container.removeAttribute('data-highlight-visible');
        return;
      }
      const first = !container.hasAttribute('data-highlight-ready') || !container.hasAttribute('data-highlight-visible');
      if (first || reset) highlight.style.transition = 'none';
      // Direct children share the positioned container's content coordinates,
      // independent of popup scaling and scrolling.
      highlight.style.width = `${target.offsetWidth}px`;
      highlight.style.height = `${target.offsetHeight}px`;
      highlight.style.transform = `translate(${target.offsetLeft}px, ${target.offsetTop}px)`;
      highlight.style.opacity = '1';
      container.setAttribute('data-highlight-visible', '');
      if (first || reset) {
        highlight.getBoundingClientRect();
        container.setAttribute('data-highlight-ready', '');
        highlight.style.transition = '';
      }
    };
    measureRef.current = measure;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const observed = new Set();
    const observeChildren = () => {
      for (const node of observed) {
        if (!container.contains(node)) { resize?.unobserve(node); observed.delete(node); }
      }
      for (const node of container.children) {
        if (node !== highlight && !observed.has(node)) { resize?.observe(node); observed.add(node); }
      }
    };
    resize?.observe(container);
    observeChildren();
    // Library list adapters own DOM-highlight changes; controlled button groups
    // are measured after React commits and don't need an attribute observer.
    const mutations = observeItems ? new MutationObserver(records => {
      if (records.some(record => record.type === 'childList')) observeChildren();
      schedule();
    }) : null;
    mutations?.observe(container, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['data-highlighted', 'data-selected', 'data-disabled', 'aria-selected'] });
    window.addEventListener('resize', schedule);
    measure();
    return () => {
      cancelAnimationFrame(frame); resize?.disconnect(); mutations?.disconnect();
      window.removeEventListener('resize', schedule); measureRef.current = null;
    };
  }, [containerRef, highlightRef, observeItems, enabled]);
  useLayoutEffect(() => { measureRef.current?.(); });
}
