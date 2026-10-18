import { useRef } from 'react';
import SlidingHighlight from './SlidingHighlight';
import useSlidingHighlight from './useSlidingHighlight';

// Keep native button semantics and the caller's handlers, labels, and values.
export default function SegmentedControl({ children, className = '', as: Element = 'div', ...props }) {
  const containerRef = useRef(null);
  const highlightRef = useRef(null);
  useSlidingHighlight({ containerRef, highlightRef, selector: '[aria-pressed="true"]' });
  return <Element {...props} ref={containerRef} className={`sliding-choice-group sliding-choice-group--segments ${className}`}>
    <SlidingHighlight ref={highlightRef} />{children}
  </Element>;
}
