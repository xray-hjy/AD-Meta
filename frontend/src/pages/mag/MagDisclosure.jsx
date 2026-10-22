import { useId, useLayoutEffect, useRef, useState } from 'react';

export function MagCollapse({ open, id, children, label, className = '' }) {
  const outer = useRef(null);
  const inner = useRef(null);
  useLayoutEffect(() => {
    const update = () => { if (outer.current && inner.current) outer.current.style.height = open ? `${inner.current.getBoundingClientRect().height}px` : '0px'; };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (inner.current) observer?.observe(inner.current);
    return () => observer?.disconnect();
  }, [open]);
  return <div ref={outer} id={id} className={`mag-collapse ${open ? 'is-open' : ''} ${className}`} aria-hidden={!open} inert={!open}>
    <div ref={inner} className="mag-collapse__content" role={label ? 'region' : undefined} aria-label={label}>{children}</div>
  </div>;
}

export default function MagDisclosure({ title, children, className = '', onOpen }) {
  const [open, setOpen] = useState(false);
  const [visited, setVisited] = useState(false);
  const id = useId();
  return <section className={`mag-disclosure ${className}`}>
    <button className="mag-disclosure__toggle" type="button" aria-expanded={open} aria-controls={id}
      onClick={() => { setOpen(!open); setVisited(true); if (!open) onOpen?.(); }}><span aria-hidden="true" className="mag-disclosure__chevron">›</span>{title}</button>
    <MagCollapse open={open} id={id}>{visited && children}</MagCollapse>
  </section>;
}
