import { useState } from 'react';

export default function MobileGallery({ chapter, onOpen }) {
  const [index, setIndex] = useState(0);
  const slide = chapter.slides[index];
  const shift = direction => setIndex(current => (current + direction + chapter.slides.length) % chapter.slides.length);
  return <div className="mobile-gallery" aria-label={chapter.label + '图集'}>
    <button className="mobile-gallery__open" type="button" onClick={() => onOpen(slide)} aria-label={'放大查看' + slide.title}>
      <img className="mobile-gallery__image" src={slide.image} width={slide.width} height={slide.height} alt={slide.title + '分析界面'} loading="lazy" decoding="async" />
    </button>
    <div className="mobile-gallery__caption"><strong>{slide.title}</strong><div className="mobile-gallery__actions">
      <span className="mobile-gallery__count" aria-live="polite">{index + 1} / {chapter.slides.length}</span>
      <button className="round-button" type="button" aria-label={'上一张' + chapter.label + '图'} onClick={() => shift(-1)}>‹</button>
      <button className="round-button" type="button" aria-label={'下一张' + chapter.label + '图'} onClick={() => shift(1)}>›</button>
    </div></div>
  </div>;
}
