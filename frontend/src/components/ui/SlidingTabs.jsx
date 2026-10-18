import { Children, cloneElement, isValidElement, useRef } from 'react';
import SlidingHighlight from './SlidingHighlight';
import useSlidingHighlight from './useSlidingHighlight';

// Presentation adapter; each existing tablist keeps its panel IDs and keyboard policy.
export default function SlidingTabs({ children, className = '', onKeyDown, ...props }) {
  const containerRef = useRef(null);
  const highlightRef = useRef(null);
  useSlidingHighlight({ containerRef, highlightRef, selector: '[role="tab"][aria-selected="true"]' });
  const navigate = event => {
    onKeyDown?.(event);
    if (event.defaultPrevented || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = Array.from(containerRef.current.querySelectorAll('[role="tab"]')).filter(tab => !tab.matches(':disabled, [aria-disabled="true"]'));
    const index = tabs.indexOf(event.target.closest('[role="tab"]'));
    if (index < 0 || !tabs.length) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus(); tabs[next].click();
  };
  return <div {...props} role="tablist" ref={containerRef} onKeyDown={navigate} className={`sliding-choice-group sliding-choice-group--tabs ${className}`}>
    <SlidingHighlight ref={highlightRef} />{Children.map(children, child => isValidElement(child) && child.props.role === 'tab'
      ? cloneElement(child, { tabIndex: child.props.tabIndex ?? (child.props['aria-selected'] ? 0 : -1) }) : child)}
  </div>;
}
