import { useRef } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { centeredLeafRange, resizeLeafRange } from './magPhylogenyNavigation';

export default function MagPhylogenyRange({ count, capacity, start, end, onChange, transposed, style }) {
  const rail = useRef(null);
  const drag = useRef(null);
  const length = end - start;
  const position = event => transposed ? event.clientX : event.clientY;
  const move = rows => onChange(centeredLeafRange(count, length, (start + end) / 2 + rows));
  return <div className={`mag-phylogeny-range${transposed ? ' mag-phylogeny-range--horizontal' : ''}`} style={style}
    aria-label="MAG 叶节点范围">
    <Slider.Root ref={rail} className="mag-phylogeny-range__slider" min={0} max={count} step={1} minStepsBetweenThumbs={1}
      value={[start, end]} orientation={transposed ? 'horizontal' : 'vertical'} inverted={!transposed} disabled={count === 1}
      onValueChange={values => onChange(resizeLeafRange(count, capacity, [start, end], values))}>
      <Slider.Track className="mag-phylogeny-range__rail">
        <Slider.Range className="mag-phylogeny-range__window" tabIndex={count > 1 ? 0 : -1} role="button" aria-label="拖动叶节点范围"
          title="拖动整个范围平移，拖动手柄调整行数"
          onPointerDown={event => {
            if (event.button !== 0 || count === 1) return;
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { position: position(event), center: (start + end) / 2, length };
          }}
          onPointerMove={event => {
            const previous = drag.current;
            if (!previous || !rail.current) return;
            event.stopPropagation();
            const pixels = transposed ? rail.current.clientWidth : rail.current.clientHeight;
            if (pixels) onChange(centeredLeafRange(count, previous.length, previous.center + (position(event) - previous.position) / pixels * count));
          }}
          onPointerUp={event => { event.stopPropagation(); drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          onLostPointerCapture={() => { drag.current = null; }}
          onKeyDown={event => {
            const directions = transposed ? { ArrowLeft: -1, ArrowRight: 1 } : { ArrowUp: -1, ArrowDown: 1 };
            if (directions[event.key]) { event.preventDefault(); move(directions[event.key] * Math.max(1, Math.floor(length / 4))); }
            if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); move(event.key === 'Home' ? -count : count); }
          }} />
      </Slider.Track>
      <Slider.Thumb className="mag-phylogeny-range__thumb" aria-label="范围起点" aria-valuetext={`第 ${start + 1} 个叶节点`} />
      <Slider.Thumb className="mag-phylogeny-range__thumb" aria-label="范围终点" aria-valuetext={`第 ${end} 个叶节点`} />
    </Slider.Root>
  </div>;
}
