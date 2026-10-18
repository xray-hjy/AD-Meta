import { useRef, useState } from 'react';
import SegmentedControl from '../ui/SegmentedControl';
import * as Slider from '@radix-ui/react-slider';

const percent = scale => Number((scale * 100).toFixed(1)).toString();

function ZoomIcon({ kind }) {
  const path = {
    fit: 'M7 3H3v4m14 0V3h-4M3 13v4h4m6 0h4v-4',
    width: 'M3 5v10m14-10v10M5 10h10m-7-3-3 3 3 3m4-6 3 3-3 3',
    minus: 'M4 10h12', plus: 'M4 10h12M10 4v12',
  }[kind];
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d={path} /></svg>;
}

// A shared UI adapter: camera constraints, anchoring and frame scheduling stay
// in the viewport, so every renderer can reuse the same controls.
export default function ChartZoomControls({ scale, minScale, maxScale, fitMode, onFit, onWidth, onZoom, onSlide }) {
  const [draft, setDraft] = useState(null);
  const cancelled = useRef(false);
  const span = Math.log(maxScale / minScale);
  const position = Math.max(0, Math.min(1000, Math.log(scale / minScale) / span * 1000));
  const commit = () => {
    const value = Number(draft?.trim().replace(/%$/, ''));
    if (!cancelled.current && draft?.trim() && Number.isFinite(value) && value > 0) onZoom(value / 100);
    cancelled.current = false; setDraft(null);
  };
  return <div className="chart-zoom-toolbar" role="toolbar" aria-label="图形缩放与导航">
    <SegmentedControl className="chart-zoom-toolbar__fit" role="group" aria-label="图形适配方式">
      <button type="button" aria-label="适应视口" title="完整图形适应视口" aria-pressed={fitMode === 'fit'} onClick={onFit}>
        <ZoomIcon kind="fit" /><span>全图</span>
      </button>
      <button type="button" aria-label="适应宽度" title="图形适应可用宽度" aria-pressed={fitMode === 'width'} onClick={onWidth}>
        <ZoomIcon kind="width" /><span>宽度</span>
      </button>
      <button type="button" aria-label="原始大小" title="100% · 原始格子尺寸" aria-pressed={fitMode === 'native'} onClick={() => onZoom(1)}>
        <span className="chart-zoom-toolbar__native">1:1</span>
      </button>
    </SegmentedControl>
    <span className="chart-zoom-toolbar__divider" aria-hidden="true" />
    <div className="chart-zoom-toolbar__scale">
      <button type="button" className="chart-zoom-toolbar__step" aria-label="缩小图形" title="缩小" disabled={scale <= minScale * 1.001} onClick={() => onZoom(scale / 1.15)}><ZoomIcon kind="minus" /></button>
      <Slider.Root className="chart-zoom-slider" value={[position]} min={0} max={1000} step={1}
        onValueChange={([value]) => onSlide(minScale * Math.exp(span * value / 1000))}>
        <Slider.Track className="chart-zoom-slider__track"><Slider.Range className="chart-zoom-slider__range" /></Slider.Track>
        <Slider.Thumb className="chart-zoom-slider__thumb" aria-label="缩放滑动条" aria-valuetext={`${percent(scale)}%`} />
      </Slider.Root>
      <button type="button" className="chart-zoom-toolbar__step" aria-label="放大图形" title="放大" disabled={scale >= maxScale * .999} onClick={() => onZoom(scale * 1.15)}><ZoomIcon kind="plus" /></button>
      <label className="chart-zoom-toolbar__value" title="输入精确缩放倍率，回车应用">
        <input type="text" inputMode="decimal" aria-label="图形缩放比例" value={draft ?? percent(scale)} maxLength={9}
          onFocus={() => { cancelled.current = false; setDraft(percent(scale)); }} onChange={event => setDraft(event.target.value)}
          onBlur={commit} onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
            if (event.key === 'Escape') { event.preventDefault(); cancelled.current = true; event.currentTarget.blur(); }
          }} /><span aria-hidden="true">%</span>
      </label>
    </div>
  </div>;
}
