import { StrictMode } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from './HomePage';
import { HOME_CHAPTERS, HOME_COPY } from './homeContent';

// jsdom 26 cannot parse Swiper's native CSS nesting. Keep its actual JS;
// the browser check covers vendor CSS and rendered geometry.
vi.mock('swiper/css', () => ({}));
vi.mock('swiper/css/effect-coverflow', () => ({}));
vi.mock('swiper/css/free-mode', () => ({}));

beforeEach(() => {
  vi.stubGlobal('matchMedia', query => ({ matches: query === '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {} }));
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  vi.stubGlobal('DOMMatrixReadOnly', class {
    constructor(value) {
      const match = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(value);
      this.m41 = match ? Number(match[1]) : 0;
      this.m42 = match ? Number(match[2]) : 0;
    }
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function home() {
  return render(<StrictMode><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><HomePage /></MemoryRouter></StrictMode>);
}

test('renders the accepted copy and routes each real analysis entry to its dataset', () => {
  home();
  expect(screen.getByRole('link', { name: HOME_COPY.header.reference })).toHaveAttribute('href', '/reference/gmrepo');
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(HOME_COPY.hero.title.join(''));
  for (const chapter of HOME_CHAPTERS) {
    expect(screen.getByRole('link', { name: chapter.action })).toHaveAttribute('href', chapter.route);
    expect(document.getElementById(chapter.id)).toBeTruthy();
  }
  expect(document.querySelectorAll('.mobile-gallery')).toHaveLength(4);
  expect(document.querySelectorAll('.stage-carousel')).toHaveLength(0);
  expect([...document.querySelectorAll('[data-home-section]')].map(element => element.dataset.homeSection)).toEqual(['hero', 'showcase', 'foundation']);
  const wheel = new WheelEvent('wheel', { deltaY: 120, cancelable: true, bubbles: true });
  window.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
});

test('supports keyboard domain selection and a scoped chapter jump', () => {
  home();
  const species = screen.getByRole('tab', { name: HOME_CHAPTERS[0].label });
  fireEvent.keyDown(species, { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: HOME_CHAPTERS[1].label })).toHaveAttribute('aria-selected', 'true');
  const jump = vi.fn();
  document.getElementById(HOME_CHAPTERS[1].id).scrollIntoView = jump;
  fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('link'));
  expect(jump).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
});

test('mobile galleries cycle independently and use a controlled preview dialog', () => {
  home();
  const chapter = HOME_CHAPTERS[0];
  const gallery = within(document.getElementById(chapter.id));
  // jsdom does not evaluate responsive media queries; these controls are
  // rendered in flow mode and visually checked at a narrow browser viewport.
  fireEvent.click(gallery.getByRole('button', { name: '下一张' + chapter.label + '图', hidden: true }));
  expect(gallery.getByRole('img', { name: chapter.slides[1].alt, hidden: true })).toHaveAttribute('src', chapter.slides[1].image);
  fireEvent.click(gallery.getByRole('button', { name: '放大查看' + chapter.slides[1].title, hidden: true }));
  expect(screen.getByRole('dialog')).toHaveTextContent(chapter.slides[1].title);
  expect(within(screen.getByRole('dialog')).getByRole('img', { name: chapter.slides[1].alt })).toHaveAttribute('src', chapter.slides[1].image);
  fireEvent.click(screen.getByRole('button', { name: '关闭 ✕' }));
  expect(document.querySelector('dialog').open).toBe(false);
  expect(document.getElementById(HOME_CHAPTERS[1].id).querySelector('.mobile-gallery__count')).toHaveTextContent('1 / 4');
});

test('desktop initializes after the parent ref, survives StrictMode, and disposes on mode change', () => {
  const listeners = new Set();
  let pinned = true;
  vi.stubGlobal('matchMedia', query => ({ matches: query.includes('min-width') && pinned,
    addEventListener(type, callback) { listeners.add(callback); }, removeEventListener(type, callback) { listeners.delete(callback); } }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  const view = home();
  const swipers = [...document.querySelectorAll('.stage-carousel')].map(scene => scene.swiper);
  expect(swipers.every(swiper => !swiper.destroyed)).toBe(true);
  expect(document.querySelectorAll('.stage-carousel:not(.is-parked)')).toHaveLength(1);
  expect(document.querySelectorAll('.chapter.is-active')).toHaveLength(1);
  act(() => { pinned = false; [...listeners].forEach(callback => callback()); });
  expect(swipers.every(swiper => swiper.destroyed)).toBe(true);
  expect(document.querySelectorAll('.stage-carousel')).toHaveLength(0);
  expect(document.querySelectorAll('.mobile-gallery')).toHaveLength(4);
  view.unmount();
  expect(listeners.size).toBe(0);
  const wheel = new WheelEvent('wheel', { deltaY: 120, cancelable: true });
  window.dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(false);
});
