import { forwardRef } from 'react';

const TaxonomyViewport = forwardRef(function TaxonomyViewport({
  mode,
  height,
  children,
}, ref) {
  return (
    <div
      ref={ref}
      className={`taxonomy-viewport taxonomy-viewport--${mode}`}
      style={{ '--taxonomy-viewport-height': `${height || 760}px` }}
      data-taxonomy-mode={mode}
    >
      {children}
    </div>
  );
});

export default TaxonomyViewport;
