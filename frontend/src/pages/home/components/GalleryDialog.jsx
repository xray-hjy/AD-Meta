import { useEffect, useRef } from 'react';
import { HOME_COPY } from '../homeContent';

export default function GalleryDialog({ slide, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    if (slide && !element.open) element.showModal();
    else if (!slide && element.open) element.close();
  }, [slide]);
  return <dialog ref={dialog} className="image-dialog" aria-labelledby="home-dialog-title" onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-top"><span id="home-dialog-title">{slide?.title || HOME_COPY.gallery.previewTitle}</span><button type="button" onClick={onClose}>{HOME_COPY.gallery.close}</button></div>
    {slide && <img src={slide.image} alt={slide.alt} />}
  </dialog>;
}
