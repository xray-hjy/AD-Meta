import './selection-motion.css';

export default function SlidingHighlight({ ref }) {
  return <span ref={ref} className="sliding-highlight" aria-hidden="true" />;
}
