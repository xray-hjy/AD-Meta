import { useCallback, useEffect, useRef, useState } from 'react';
import useTooltip from '../../hooks/useTooltip';

const MIN_SCALE = 0.5;
const MAX_SCALE = 5;

function clampScale(scale) {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

export default function HeatmapLightbox({ image, onClose }) {
  const dialogRef = useRef(null);
  const contentRef = useRef(null);
  const viewportRef = useRef(null);
  const imageRef = useRef(null);
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const transform = useRef({ x: 0, y: 0, scale: 1 });
  const frame = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [scale, setScale] = useState(1);
  const { Tooltip, show, move, hide } = useTooltip();

  const applyTransform = useCallback(() => {
    frame.current = null;
    if (!contentRef.current) return;
    const { x, y, scale } = transform.current;
    contentRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }, []);

  const scheduleTransform = useCallback(() => {
    if (frame.current) return;
    frame.current = window.requestAnimationFrame
      ? window.requestAnimationFrame(applyTransform)
      : window.setTimeout(applyTransform, 16);
  }, [applyTransform]);

  const setScaleBy = useCallback((delta) => {
    const nextScale = clampScale(transform.current.scale + delta);
    transform.current.scale = nextScale;
    setScale(nextScale);
    scheduleTransform();
  }, [scheduleTransform]);

  const zoomAt = useCallback((delta, clientX, clientY) => {
    const previous = transform.current;
    const nextScale = clampScale(previous.scale + delta);
    if (nextScale === previous.scale) return;
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) {
      transform.current.scale = nextScale;
      scheduleTransform();
      return;
    }
    const anchorX = clientX - rect.left - rect.width / 2;
    const anchorY = clientY - rect.top - rect.height / 2;
    const ratio = nextScale / previous.scale;
    transform.current = {
      scale: nextScale,
      x: anchorX - (anchorX - previous.x) * ratio,
      y: anchorY - (anchorY - previous.y) * ratio,
    };
    setScale(nextScale);
    scheduleTransform();
  }, [scheduleTransform]);

  const resetTransform = useCallback(() => {
    transform.current = { x: 0, y: 0, scale: 1 };
    setScale(1);
    scheduleTransform();
  }, [scheduleTransform]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const handleWheel = event => {
      event.preventDefault();
      zoomAt(event.deltaY > 0 ? -0.2 : 0.2, event.clientX, event.clientY);
    };
    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [zoomAt]);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const focusable = () => [...(dialogRef.current?.querySelectorAll('button') || [])];
    focusable()[0]?.focus();
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (!elements.length) return;
      const current = elements.indexOf(document.activeElement);
      const next = event.shiftKey
        ? (current <= 0 ? elements.length - 1 : current - 1)
        : (current >= elements.length - 1 ? 0 : current + 1);
      event.preventDefault();
      elements[next].focus();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus?.();
      if (frame.current) {
        const cancel = window.cancelAnimationFrame || window.clearTimeout;
        cancel(frame.current);
      }
    };
  }, [onClose]);

  const handleMouseMove = event => {
    if (dragging.current) {
      hide();
      transform.current.x += event.clientX - lastPos.current.x;
      transform.current.y += event.clientY - lastPos.current.y;
      lastPos.current = { x: event.clientX, y: event.clientY };
      scheduleTransform();
      return;
    }

    const interaction = image.interaction;
    const rect = imageRef.current?.getBoundingClientRect();
    if (!interaction || !rect?.width || !rect?.height) {
      hide();
      return;
    }
    const html = interaction.getTooltipHtml({
      x: (event.clientX - rect.left) * (interaction.width / rect.width),
      y: (event.clientY - rect.top) * (interaction.height / rect.height),
    });
    if (!html) {
      hide();
      return;
    }
    show(html);
    move(event);
  };

  const stopDragging = () => {
    dragging.current = false;
    setIsDragging(false);
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${image.title} 放大预览`}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15, 23, 42, 0.78)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out',
      }}
    >
      <div
        ref={viewportRef}
        data-testid="heatmap-lightbox-viewport"
        onClick={event => event.stopPropagation()}
        onMouseDown={event => {
          event.preventDefault();
          hide();
          dragging.current = true;
          setIsDragging(true);
          lastPos.current = { x: event.clientX, y: event.clientY };
        }}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDragging}
        onMouseLeave={() => {
          stopDragging();
          hide();
        }}
        style={{
          position: 'relative', width: 'min(94vw, 1400px)', height: 'min(90vh, 900px)', overflow: 'hidden',
          borderRadius: 14, background: '#fff', padding: 18, boxShadow: '0 24px 80px rgba(15, 23, 42, 0.38)',
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <div
          ref={contentRef}
          style={{
            transform: 'translate(0px, 0px) scale(1)', transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 100ms ease', width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <img
            ref={imageRef}
            src={image.src}
            alt={`${image.title} 放大预览`}
            draggable={false}
            onDragStart={event => event.preventDefault()}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', userSelect: 'none', pointerEvents: 'none' }}
          />
        </div>
        <div style={{ position: 'absolute', right: 18, bottom: 18, display: 'flex', gap: 8 }}>
          <output
            aria-label="当前缩放比例"
            style={{ minWidth: 48, alignSelf: 'center', textAlign: 'center', color: '#475569', fontSize: 12 }}
          >
            {Math.round(scale * 100)}%
          </output>
          <button type="button" onClick={() => setScaleBy(0.5)}>放大</button>
          <button type="button" onClick={() => setScaleBy(-0.5)}>缩小</button>
          <button type="button" onClick={resetTransform}>重置</button>
          <button type="button" onClick={onClose}>关闭</button>
        </div>
        <Tooltip />
      </div>
    </div>
  );
}
