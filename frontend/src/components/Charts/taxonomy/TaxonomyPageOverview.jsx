import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ChartMinimap from '../ChartMinimap';
import '../chart-zoom.css';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// The page owns vertical navigation. Only a narrow screen needs horizontal
// scrolling inside the chart; no second vertical camera or transformed data.
export function pageChartGeometry(surface) {
  const rect = surface.getBoundingClientRect();
  let clip = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  let verticalScroller = window;
  for (let parent = surface.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    const box = parent.getBoundingClientRect();
    if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
      clip.left = Math.max(clip.left, box.left);
      clip.right = Math.min(clip.right, box.right);
    }
    if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
      clip.top = Math.max(clip.top, box.top);
      clip.bottom = Math.min(clip.bottom, box.bottom);
    }
    if (verticalScroller === window && /auto|scroll/.test(style.overflowY)
      && parent.scrollHeight > parent.clientHeight + 1) verticalScroller = parent;
  }
  const world = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
  const x = clamp(clip.left - rect.left, 0, world.width);
  const y = clamp(clip.top - rect.top, 0, world.height);
  const visible = { x, y,
    width: Math.max(0, Math.min(rect.right, clip.right) - Math.max(rect.left, clip.left)),
    height: Math.max(0, Math.min(rect.bottom, clip.bottom) - Math.max(rect.top, clip.top)) };
  return { world, visible, clip, rect, verticalScroller };
}

export function navigatePageChart(surface, x, y) {
  const { world, clip, rect, verticalScroller } = pageChartGeometry(surface);
  const scroll = surface.closest('.taxonomy-sankey-scroll');
  if (scroll) scroll.scrollLeft = clamp(x, 0, Math.max(0, world.width - scroll.clientWidth));
  const top = rect.top + clamp(y, 0, Math.max(0, world.height - (clip.bottom - clip.top))) - clip.top;
  verticalScroller.scrollBy({ top, behavior: 'instant' });
}

export default function TaxonomyPageOverview({ chart, enabled = true }) {
  const [geometry, setGeometry] = useState(null);
  const [preview, setPreview] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const timerRef = useRef(null);
  useEffect(() => {
    if (!chart || chart.isDisposed?.()) return undefined;
    const surface = chart.getDom();
    let frame;
    const measure = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = null; setGeometry(pageChartGeometry(surface)); });
    };
    // Capture one small preview after layout, never a full-size bitmap on scroll.
    const capture = () => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (chart.isDisposed?.()) return;
        setPreview(chart.getDataURL({ type: 'png', backgroundColor: '#ffffff',
          pixelRatio: Math.min(1, 320 / chart.getWidth(), 420 / chart.getHeight()) }));
        measure();
      }, 150);
    };
    chart.on('finished', capture);
    const observer = new ResizeObserver(measure);
    observer.observe(surface);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    document.addEventListener('fullscreenchange', measure);
    measure(); capture();
    return () => {
      if (!chart.isDisposed?.()) chart.off('finished', capture);
      observer.disconnect();
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      document.removeEventListener('fullscreenchange', measure);
      cancelAnimationFrame(frame); clearTimeout(timerRef.current);
    };
  }, [chart]);
  if (!enabled || !geometry || geometry.visible.height < 60 || geometry.visible.width < 60) return null;
  const { world, visible, clip } = geometry;
  const navigate = (x, y) => navigatePageChart(chart.getDom(), x, y);
  return createPortal(<aside className="taxonomy-page-overview" aria-label="桑基图页面全局预览"
    style={{ right: Math.max(12, window.innerWidth - clip.right + 12), top: Math.max(80, clip.top + 12) }}>
    <header><strong>桑基图全貌</strong><button type="button" aria-label={collapsed ? '展开页面全局预览' : '收起页面全局预览'}
      aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? '展开' : '收起'}</button></header>
    {!collapsed ? <><ChartMinimap world={world} visible={visible} preview={preview} onNavigate={navigate}
      ariaLabel="桑基图缩略全貌与页面视野" />
      <div className="taxonomy-page-overview__actions">
        <button type="button" onClick={() => navigate(0, 0)}>图顶</button>
        <button type="button" aria-label="桑基图上一屏" onClick={() => navigate(visible.x, visible.y - visible.height * .8)}>↑</button>
        <button type="button" aria-label="桑基图下一屏" onClick={() => navigate(visible.x, visible.y + visible.height * .8)}>↓</button>
        <button type="button" onClick={() => navigate(visible.x, world.height)}>图底</button>
      </div><p>视野框跟随页面滚动；点击或拖动定位</p></> : null}
  </aside>, document.fullscreenElement || document.body);
}
