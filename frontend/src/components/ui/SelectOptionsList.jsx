import { useRef } from 'react';
import { Select } from '@base-ui/react/select';
import SlidingHighlight from './SlidingHighlight';
import useSlidingHighlight from './useSlidingHighlight';

export default function SelectOptionsList({ children }) {
  const containerRef = useRef(null);
  const highlightRef = useRef(null);
  useSlidingHighlight({ containerRef, highlightRef, observeItems: true,
    selector: ['[data-highlighted]:not([data-disabled])', '[data-selected]:not([data-disabled])'] });
  return <Select.List ref={containerRef} className="styled-select-list sliding-option-list">
    <SlidingHighlight ref={highlightRef} />{children}
  </Select.List>;
}
