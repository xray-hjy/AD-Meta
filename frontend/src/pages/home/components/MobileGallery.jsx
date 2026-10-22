import { useState } from 'react';
import { HOME_COPY } from '../homeContent';

export default function MobileGallery({ chapter, onOpen }) {
  const [index, setIndex] = useState(0);
  const slide = chapter.slides[index];
  const shift = direction => setIndex(current => (current + direction + chapter.slides.length) % chapter.slides.length);
  return <div className="mobile-gallery" aria-label={HOME_COPY.gallery.label(chapter.label)}>
    <button className="mobile-gallery__open" type="button" onClick={() => onOpen(slide)} aria-label={HOME_COPY.gallery.open(slide.title)}>
      <img className="mobile-gallery__image" src={slide.image} width={slide.width} height={slide.height} alt={slide.alt} loading="lazy" decoding="async" />
    </button>
    <div className="mobile-gallery__caption"><strong>{slide.title}</strong><div className="mobile-gallery__actions">
      <span className="mobile-gallery__count" aria-live="polite">{HOME_COPY.gallery.count(index + 1, chapter.slides.length)}</span>
      <button className="round-button" type="button" aria-label={HOME_COPY.gallery.previousIn(chapter.label)} onClick={() => shift(-1)}>{HOME_COPY.symbols.previous}</button>
      <button className="round-button" type="button" aria-label={HOME_COPY.gallery.nextIn(chapter.label)} onClick={() => shift(1)}>{HOME_COPY.symbols.next}</button>
    </div></div>
  </div>;
}
