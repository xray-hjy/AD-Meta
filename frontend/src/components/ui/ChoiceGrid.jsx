import { useRef } from 'react';
import SlidingHighlight from './SlidingHighlight';
import useSlidingHighlight from './useSlidingHighlight';

export default function ChoiceGrid({ children, className = '', ...props }) {
  const containerRef = useRef(null);
  const highlightRef = useRef(null);
  useSlidingHighlight({ containerRef, highlightRef, selector: '[aria-pressed="true"]' });
  return <div {...props} ref={containerRef} className={`sliding-choice-group sliding-choice-group--grid ${className}`}>
    <SlidingHighlight ref={highlightRef} />{children}
  </div>;
}
