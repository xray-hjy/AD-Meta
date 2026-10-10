import Swiper from 'swiper';
import { EffectCoverflow, FreeMode, Mousewheel } from 'swiper/modules';
import { fitScreenshot, galleryPosition } from './galleryGeometry';
import { HOME_MOTION, clamp } from './motionConfig';
import { createPanelTransition } from './panelTransition';

// This controller owns only the empty gallery host's descendants. React owns
// all copy, controls, chapters and routes outside that host.
export function createGalleryController(host, chapters, { onSelection, onMove, onEnd, onOpen }) {
  const cache = new Map();
  const transition = createPanelTransition({ config: HOME_MOTION.scene, exitClass: 'is-exiting' });
  let current = null, disposed = false;
  const prepared = new Set();
  function prepare(chapter) {
    if (!chapter) return;
    for (const slide of chapter.slides) {
      if (prepared.has(slide.image)) continue;
      prepared.add(slide.image);
      const image = new Image();
      image.onload = () => image.decode?.().catch(() => {});
      image.src = slide.image;
    }
  }
  function paint(scene, position) {
    if (scene !== current) return;
    const nearest = Math.round(position);
    scene.cards.forEach(({ pane, sheet }, index) => {
      const distance = Math.abs(index - position);
      sheet.style.opacity = String(1 - Math.min(1, distance) * .22);
      pane.inert = distance > 1.05;
      pane.setAttribute('aria-hidden', String(pane.inert));
      sheet.setAttribute('aria-label', `${index === nearest ? '放大查看' : '切换到'}${scene.chapter.slides[index].title}`);
    });
    if (Math.abs(position - nearest) < .00001 && scene.index !== nearest) {
      scene.index = nearest;
      onSelection(scene.chapter.key, nearest);
    }
  }
  function fit(scene) {
    const width = scene.element.clientWidth, height = scene.element.clientHeight;
    if (!width || !height) return;
    scene.cards.forEach(({ pane, sheet }, index) => {
      const size = fitScreenshot(scene.chapter.slides[index], width, height);
      pane.style.width = size.paneWidth + 'px';
      sheet.style.width = size.width + 'px';
      sheet.style.height = size.height + 'px';
    });
  }
  function build(chapter, initialIndex) {
    const element = document.createElement('div');
    element.className = 'stage-carousel swiper';
    element.setAttribute('aria-label', chapter.label + '图集');
    element.innerHTML = '<div class="stage-gallery swiper-wrapper"></div>';
    const wrapper = element.firstElementChild;
    host.append(element);
    const scene = { element, chapter, index: initialIndex, target: initialIndex, cards: [] };
    scene.cards = chapter.slides.map((slide, index) => {
      const pane = document.createElement('div'); pane.className = 'stage-slide swiper-slide';
      const sheet = document.createElement('button'); sheet.type = 'button'; sheet.className = 'stage-slide__sheet';
      const image = document.createElement('img'); image.className = 'stage-image';
      image.src = slide.image; image.width = slide.width; image.height = slide.height;
      image.alt = slide.title + '分析界面'; image.decoding = 'async';
      sheet.append(image); pane.append(sheet); wrapper.append(pane);
      sheet.addEventListener('click', () => {
        if (scene !== current) return;
        if (index === Math.round(galleryPosition(scene.swiper))) onOpen(slide);
        else onMove(index);
      });
      return { pane, sheet };
    });
    fit(scene);
    scene.swiper = new Swiper(element, {
      modules: [EffectCoverflow, FreeMode, Mousewheel],
      initialSlide: initialIndex, effect: 'coverflow', slidesPerView: 'auto', centeredSlides: true,
      coverflowEffect: HOME_MOTION.coverflow, speed: HOME_MOTION.gallerySpeed,
      loop: false, grabCursor: true, preventInteractionOnTransition: false,
      resizeObserver: true, freeMode: { enabled: true, momentum: false, sticky: false },
      mousewheel: { enabled: false, eventsTarget: 'body', sensitivity: HOME_MOTION.wheelSensitivity, releaseOnEdges: true },
      on: {
        setTranslate(swiper) { paint(scene, galleryPosition(swiper, swiper.translate)); },
        scroll(swiper, event) { if (scene === current) { event.preventDefault(); onMove(galleryPosition(swiper), { continuous: true }); } },
        sliderMove(swiper) { if (scene === current) onMove(galleryPosition(swiper), { drag: true }); },
        touchEnd(swiper) { if (scene === current) onMove(Math.round(galleryPosition(swiper))); },
        transitionEnd() { if (scene === current) { paint(scene, scene.target); onEnd(); } },
      },
    });
    cache.set(chapter.key, scene);
    return scene;
  }
  function activate(key, index = 0, immediate = false) {
    if (disposed) return;
    const chapter = chapters.find(item => item.key === key);
    if (current?.chapter === chapter) { go(index, { immediate }); return; }
    const previous = current;
    if (previous) {
      previous.swiper.mousewheel.disable();
      previous.element.classList.add('is-parked');
      previous.element.inert = true; previous.element.setAttribute('aria-hidden', 'true');
    }
    current = cache.get(key) || build(chapter, index);
    current.element.classList.remove('is-parked');
    current.element.inert = false; current.element.removeAttribute('aria-hidden');
    current.target = current.index = index;
    fit(current); current.swiper.update(); current.swiper.slideTo(index, 0);
    paint(current, index); onSelection(key, index);
    const direction = previous ? Math.sign(chapters.indexOf(chapter) - chapters.indexOf(previous.chapter)) || 1 : 1;
    transition.play(previous?.element, current.element, direction, immediate);
    prepare(chapters[chapters.indexOf(chapter) + 1]);
  }
  function go(index, { immediate = false, duration = HOME_MOTION.gallerySpeed } = {}) {
    if (!current || disposed) return;
    const target = clamp(Math.round(index), 0, current.chapter.slides.length - 1);
    if (!immediate && target === current.target && current.swiper.animating) return;
    current.target = target;
    current.swiper.slideTo(target, immediate ? 0 : duration);
    current.index = target;
    onSelection(current.chapter.key, target);
    paint(current, target);
  }
  function resize() {
    transition.clear();
    if (!current) return;
    fit(current); current.swiper.update(); current.swiper.slideTo(current.target, 0);
  }
  return {
    activate, go, resize,
    state: () => current && ({ key: current.chapter.key, index: current.index, target: current.target, position: galleryPosition(current.swiper), last: current.chapter.slides.length - 1, swiper: current.swiper }),
    dispose() {
      disposed = true; transition.clear();
      for (const scene of cache.values()) scene.swiper.destroy(true, true);
      cache.clear(); current = null; host.replaceChildren();
    },
  };
}
