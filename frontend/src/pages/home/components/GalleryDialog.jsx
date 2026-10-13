import { useEffect, useRef } from 'react';

export default function GalleryDialog({ slide, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    if (slide && !element.open) element.showModal();
    else if (!slide && element.open) element.close();
  }, [slide]);
  return <dialog ref={dialog} className="image-dialog" aria-labelledby="home-dialog-title" onClose={onClose}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-top"><span id="home-dialog-title">{slide?.title || '图表预览'}</span><button type="button" onClick={onClose}>关闭 ✕</button></div>
    {slide && <img src={slide.image} alt={slide.title + '分析界面'} />}
  </dialog>;
}
